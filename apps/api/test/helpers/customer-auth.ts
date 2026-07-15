import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { CustomerProvisionResponse, CustomerAuthResponse } from '@coralyn/contracts';

/**
 * Provisiona un enrollment cliente fresco (admin) su una prenotazione e restituisce
 * raw token + pin per l'attivazione. Parametrico: nessuna dipendenza da closure di test,
 * riusabile sia per il canale S3 (customer-access.e2e-spec) sia per S4.
 *
 * `CUSTOMER_APP_URL` non è settato in `.env.test`, quindi `activationUrl` è relativo:
 * il token va estratto via regex sulla query string.
 */
export async function provisionCustomerAccess(
  app: INestApplication,
  adminToken: string,
  bookingId: string,
): Promise<{ activationUrl: string; pin: string; enrollmentToken: string }> {
  const res = await request(app.getHttpServer())
    .post(`/api/bookings/${bookingId}/customer-access`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(201);
  const body = res.body as CustomerProvisionResponse;
  const enrollmentToken = body.activationUrl.match(/token=([^&]+)/)![1];
  return { activationUrl: body.activationUrl, pin: body.pin, enrollmentToken };
}

/** Attiva un enrollment cliente esistente (token + pin) e restituisce la sessione viva. */
export async function activateCustomer(
  app: INestApplication,
  enrollmentToken: string,
  pin: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const res = await request(app.getHttpServer())
    .post('/api/customer/activate')
    .send({ enrollmentToken, pin })
    .expect(200);
  return res.body as CustomerAuthResponse;
}
