import { PrismaClient, BookingType, BookingStatus, PaymentStatus, PaymentMethod } from '@prisma/client';

// Script DEV-ONLY (demo del "Report cruscotto"): popola dati ricchi nel tenant di
// sviluppo già creato da seed.ts. Idempotente (upsert + id fissi). NON per produzione.
// Esegui con:
//   DATABASE_URL="postgresql://coralyn_app:coralyn_app@localhost:5433/coralyn_dev?schema=public" \
//     corepack pnpm --filter @coralyn/api exec ts-node prisma/seed-report-demo.ts

const prisma = new PrismaClient();

const EID = '00000000-0000-0000-0000-000000000001';

// Stesso helper id di seed.ts: u(prefix, n) = "${prefix}0000000-0000-0000-0000-${n padded a 12}"
const u = (prefix: number, n: number): string =>
  `${prefix}0000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

// Id fissi dedicati a questo script (prefisso 'c' per i customer, come da istruzioni).
const c = (n: number): string => `c0000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

// Helper per i booking di questo script: `group` è un prefisso alfanumerico di 2 char
// (mantiene il primo gruppo UUID a 8 hex char, come richiede il parser UUID di Postgres;
// u(prefix:number,n) di seed.ts funziona solo con prefissi a 1 cifra, qui servono più serie
// distinte quindi uso gruppi a 2 char che non collidono con gli id numerici di seed.ts).
const b = (group: string, n: number): string => `${group}000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

const SLOT_MATTINA = u(2, 1);
const SLOT_POMERIGGIO = u(2, 2);
const SEASON_2026 = u(7, 1);
const SEASON_2027 = u(7, 2);

const dateOnly = (ymd: string): Date => new Date(`${ymd}T00:00:00Z`);
const toYmd = (d: Date): string => d.toISOString().slice(0, 10);

function addDays(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Seed demo non può girare in produzione');
  }

  const today = new Date();
  const todayYmd = toYmd(today);
  const seasonStart = '2026-05-01';
  const seasonEnd = '2026-09-30';
  if (todayYmd < seasonStart || todayYmd > seasonEnd) {
    throw new Error(
      `today (${todayYmd}) non è nel range stagione Estate 2026 (${seasonStart}..${seasonEnd}); lo script assume la stagione attiva. STOP.`,
    );
  }

  const customers = [
    { id: c(1), firstName: 'Mario', lastName: 'Rossi', phone: '333-1000001', email: 'mario.rossi@example.com' },
    { id: c(2), firstName: 'Anna', lastName: 'Conti', phone: '333-1000002', email: 'anna.conti@example.com' },
    { id: c(3), firstName: 'Franco', lastName: 'Marini', phone: '333-1000003', email: 'franco.marini@example.com' },
    { id: c(4), firstName: 'Elena', lastName: 'Lombardi', phone: '333-1000004', email: 'elena.lombardi@example.com' },
    { id: c(5), firstName: 'Luca', lastName: 'Bianchi', phone: '333-1000005', email: 'luca.bianchi@example.com' },
  ];

  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant', ${EID}, true)`;

      // 1. Customers -----------------------------------------------------------------
      for (const cust of customers) {
        await tx.customer.upsert({
          where: { id: cust.id },
          update: {
            firstName: cust.firstName,
            lastName: cust.lastName,
            phone: cust.phone,
            email: cust.email,
          },
          create: { establishmentId: EID, ...cust },
        });
      }

      // 2. Subscriptions (6, covering today, season Estate 2026) ----------------------
      // Umbrelle u(5,1)..u(5,6), tutte in fascia Mattina, distinct per evitare overlap.
      // Pagamenti: 4 PAID (collectionDate variate: maggio/giugno + 2 negli ultimi 7 giorni), 2 UNPAID.
      const subCollectionDates = [
        dateOnly('2026-05-12'),
        dateOnly('2026-06-03'),
        addDays(today, -2),
        addDays(today, -5),
      ];
      const subscriptions = Array.from({ length: 6 }, (_, i) => {
        const n = i + 1;
        const customer = customers[i % customers.length];
        const paid = n <= 4; // primi 4 pagati, ultimi 2 non pagati
        return {
          id: b('a1', n),
          umbrellaId: u(5, n),
          customerId: customer.id,
          paid,
          collectionDate: paid ? subCollectionDates[n - 1] : null,
        };
      });

      for (const sub of subscriptions) {
        await tx.booking.upsert({
          where: { id: sub.id },
          update: {
            customerId: sub.customerId,
            umbrellaId: sub.umbrellaId,
            timeSlotId: SLOT_MATTINA,
            startDate: dateOnly(seasonStart),
            endDate: dateOnly(seasonEnd),
            type: BookingType.subscription,
            status: BookingStatus.confirmed,
            totalPrice: 800,
            paymentStatus: sub.paid ? PaymentStatus.paid : PaymentStatus.unpaid,
            amountCollected: sub.paid ? 800 : 0,
            paymentMethod: sub.paid ? PaymentMethod.card : null,
            collectionDate: sub.collectionDate,
          },
          create: {
            id: sub.id,
            establishmentId: EID,
            customerId: sub.customerId,
            umbrellaId: sub.umbrellaId,
            timeSlotId: SLOT_MATTINA,
            startDate: dateOnly(seasonStart),
            endDate: dateOnly(seasonEnd),
            type: BookingType.subscription,
            status: BookingStatus.confirmed,
            totalPrice: 800,
            paymentStatus: sub.paid ? PaymentStatus.paid : PaymentStatus.unpaid,
            amountCollected: sub.paid ? 800 : 0,
            paymentMethod: sub.paid ? PaymentMethod.card : null,
            collectionDate: sub.collectionDate,
          },
        });
      }

      // 3. Daily bookings over the last 7 days (today-6 .. today), 3/day, PAID -------
      // Umbrelle u(5,10)/u(5,11)/u(5,12) riusate su giorni diversi (startDate=endDate=quel
      // giorno => NON overlappano tra loro, stesso ombrellone+fascia su date disgiunte è ok).
      const dailyUmbrellas = [u(5, 10), u(5, 11), u(5, 12)];
      let dailySeq = 0;
      for (let dayOffset = -6; dayOffset <= 0; dayOffset++) {
        const day = addDays(today, dayOffset);
        const dayDate = dateOnly(toYmd(day));
        for (let slotIdx = 0; slotIdx < 3; slotIdx++) {
          dailySeq++;
          const isAfternoon = slotIdx === 2; // 2 mattina + 1 pomeriggio per giorno, varia gli importi
          const timeSlotId = isAfternoon ? SLOT_POMERIGGIO : SLOT_MATTINA;
          const basePrice = isAfternoon ? 40 : 28;
          const priceVariation = slotIdx * 2; // piccola variazione fra le prenotazioni mattutine
          const totalPrice = basePrice + priceVariation;
          const customer = customers[dailySeq % customers.length];
          const method = dailySeq % 2 === 0 ? PaymentMethod.cash : PaymentMethod.card;

          await tx.booking.upsert({
            where: { id: b('a2', dailySeq) },
            update: {
              customerId: customer.id,
              umbrellaId: dailyUmbrellas[slotIdx],
              timeSlotId,
              startDate: dayDate,
              endDate: dayDate,
              type: BookingType.daily,
              status: BookingStatus.confirmed,
              totalPrice,
              paymentStatus: PaymentStatus.paid,
              amountCollected: totalPrice,
              paymentMethod: method,
              collectionDate: dayDate,
            },
            create: {
              id: b('a2', dailySeq),
              establishmentId: EID,
              customerId: customer.id,
              umbrellaId: dailyUmbrellas[slotIdx],
              timeSlotId,
              startDate: dayDate,
              endDate: dayDate,
              type: BookingType.daily,
              status: BookingStatus.confirmed,
              totalPrice,
              paymentStatus: PaymentStatus.paid,
              amountCollected: totalPrice,
              paymentMethod: method,
              collectionDate: dayDate,
            },
          });
        }
      }

      // 4. ~6 daily bookings for TODAY (occupancy + today revenue + outstanding) -----
      // Umbrelle distinte u(5,26)..u(5,31) (26-30 + P1), mix mattina/pomeriggio. 4 PAID, 2 UNPAID.
      // NB: u(5,20)..u(5,25) NON usate qui: nel DB coralyn_dev esistono già prenotazioni
      // confirmed create a mano su 21/22/23/24/25 che coprono/overlappano oggi (dati reali
      // di test manuale dell'app); 26-31 risultano libere per tutta la stagione 2026.
      const todayDate = dateOnly(todayYmd);
      const todayBookings = Array.from({ length: 6 }, (_, i) => {
        const n = i + 1;
        const umbrellaId = u(5, 26 + i);
        const isAfternoon = i % 2 === 1;
        const timeSlotId = isAfternoon ? SLOT_POMERIGGIO : SLOT_MATTINA;
        const totalPrice = isAfternoon ? 40 : 28;
        const paid = n <= 4;
        const customer = customers[i % customers.length];
        return { id: b('a3', n), umbrellaId, timeSlotId, totalPrice, paid, customerId: customer.id };
      });

      for (const bk of todayBookings) {
        await tx.booking.upsert({
          where: { id: bk.id },
          update: {
            customerId: bk.customerId,
            umbrellaId: bk.umbrellaId,
            timeSlotId: bk.timeSlotId,
            startDate: todayDate,
            endDate: todayDate,
            type: BookingType.daily,
            status: BookingStatus.confirmed,
            totalPrice: bk.totalPrice,
            paymentStatus: bk.paid ? PaymentStatus.paid : PaymentStatus.unpaid,
            amountCollected: bk.paid ? bk.totalPrice : 0,
            paymentMethod: bk.paid ? PaymentMethod.card : null,
            collectionDate: bk.paid ? todayDate : null,
          },
          create: {
            id: bk.id,
            establishmentId: EID,
            customerId: bk.customerId,
            umbrellaId: bk.umbrellaId,
            timeSlotId: bk.timeSlotId,
            startDate: todayDate,
            endDate: todayDate,
            type: BookingType.daily,
            status: BookingStatus.confirmed,
            totalPrice: bk.totalPrice,
            paymentStatus: bk.paid ? PaymentStatus.paid : PaymentStatus.unpaid,
            amountCollected: bk.paid ? bk.totalPrice : 0,
            paymentMethod: bk.paid ? PaymentMethod.card : null,
            collectionDate: bk.paid ? todayDate : null,
          },
        });
      }

      // 5. Open renewal campaign (Estate 2026 -> Estate 2027), deadline today+45 -----
      const CAMPAIGN_ID = 'ca000000-0000-0000-0000-000000000001';
      const deadline = dateOnly(toYmd(addDays(today, 45)));
      await tx.renewalCampaign.upsert({
        where: { id: CAMPAIGN_ID },
        update: {
          originSeasonId: SEASON_2026,
          destinationSeasonId: SEASON_2027,
          deadline,
        },
        create: {
          id: CAMPAIGN_ID,
          establishmentId: EID,
          originSeasonId: SEASON_2026,
          destinationSeasonId: SEASON_2027,
          deadline,
        },
      });
    },
    { timeout: 30000 },
  );

  console.log('Seed report-demo completato per establishment', EID);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
