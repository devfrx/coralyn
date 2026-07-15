import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import type { BookingDTO, CustomerBookingDTO } from '@coralyn/contracts';
import { Public } from '../identity/public.decorator';
import { CustomerJwtGuard } from '../customer-auth/customer-jwt.guard';
import { CurrentCustomer } from '../customer-auth/current-customer.decorator';
import type { CustomerPrincipal } from '../customer-auth/customer-principal';
import { BookingsService } from './bookings.service';
import { ReleaseAbsenceDto } from './dto/release-absence.dto';

/** Rotte di dominio del canale cliente self-service (D-035 S4). Separate dall'auth
 *  (CustomerAuthController) per blast-radius (ADR-0049 §5.6). Ownership a 2 assi: RLS (tenant dal
 *  guard) + customerId dal principal → passato ai domain service come actingCustomerId. */
@UseGuards(CustomerJwtGuard)
@Controller('customer')
export class CustomerBookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Public()
  @Get('me/subscriptions')
  mySubscriptions(@CurrentCustomer() c: CustomerPrincipal): Promise<CustomerBookingDTO[]> {
    return this.bookings.listSubscriptionsForCustomer(c.id);
  }

  @Public()
  @Post('subscriptions/:bookingId/absence-releases')
  @HttpCode(200)
  releaseAbsence(
    @Param('bookingId') bookingId: string,
    @Body() body: ReleaseAbsenceDto,
    @CurrentCustomer() c: CustomerPrincipal,
  ): Promise<BookingDTO> {
    return this.bookings.releaseAbsence(bookingId, body, { source: 'customer', actingCustomerId: c.id });
  }

  @Public()
  @Post('subscriptions/:bookingId/absence-releases/:rid/cancel')
  @HttpCode(200)
  cancelAbsenceRelease(
    @Param('bookingId') bookingId: string,
    @Param('rid') rid: string,
    @CurrentCustomer() c: CustomerPrincipal,
  ): Promise<BookingDTO> {
    return this.bookings.cancelAbsenceRelease(bookingId, rid, { actingCustomerId: c.id });
  }
}
