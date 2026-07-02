import { Matches } from 'class-validator';
import { UUID_SHAPE } from '../../common/uuid';

/** Query per GET /bookings/subscriptions: la stagione è obbligatoria (coerente con GET /rates di Slice A). */
export class SubscriptionsQueryDto {
  @Matches(UUID_SHAPE, { message: 'seasonId non valido' })
  seasonId!: string;
}
