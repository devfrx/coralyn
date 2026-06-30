import type { PaymentMethod, PaymentStatus, SettlePaymentInput } from '@coralyn/contracts';

export type ResolvePaymentResult =
  | {
      ok: true;
      fields: {
        amountCollected: number;
        paymentStatus: PaymentStatus;
        paymentMethod: PaymentMethod | null;
        collectionDate: string | null;
      };
    }
  | { ok: false; reason: 'OVER_TOTAL' | 'METHOD_REQUIRED' };

/** Confronto in centesimi interi: evita imprecisioni di virgola mobile. */
const cents = (n: number): number => Math.round(n * 100);

/**
 * Normalizza l'incasso e deriva `paymentStatus` da `amountCollected` vs `totalPrice` (ADR-0011).
 * Puro: nessuna dipendenza Nest. `today` = data ISO da iniettare (Europe/Rome, ADR-0031).
 */
export function resolvePayment(
  input: SettlePaymentInput,
  totalPrice: number,
  today: string,
): ResolvePaymentResult {
  const amount = input.amountCollected;
  if (cents(amount) > cents(totalPrice)) return { ok: false, reason: 'OVER_TOTAL' };

  // Reset / non pagato (o totale 0 = niente da incassare).
  if (cents(amount) === 0) {
    const paymentStatus: PaymentStatus = cents(totalPrice) === 0 ? 'paid' : 'unpaid';
    return { ok: true, fields: { amountCollected: 0, paymentStatus, paymentMethod: null, collectionDate: null } };
  }

  // Qui 0 < amount <= totale: serve il metodo.
  if (!input.paymentMethod) return { ok: false, reason: 'METHOD_REQUIRED' };

  const paymentStatus: PaymentStatus = cents(amount) === cents(totalPrice) ? 'paid' : 'partial';
  return {
    ok: true,
    fields: {
      amountCollected: amount,
      paymentStatus,
      paymentMethod: input.paymentMethod,
      collectionDate: input.collectionDate ?? today,
    },
  };
}
