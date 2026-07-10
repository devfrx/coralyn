import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import type { BookingDTO, BookingQuoteDTO, CustomerProvisionResponse, SubscriptionListItemDTO } from '@coralyn/contracts';
import { Role } from '@coralyn/contracts';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { QuoteBookingDto } from './dto/quote-booking.dto';
import { SettlePaymentDto } from './dto/settle-payment.dto';
import { BookingsQueryDto } from './dto/bookings-query.dto';
import { SubscriptionsQueryDto } from './dto/subscriptions-query.dto';
import { RenewBookingDto } from './dto/renew-booking.dto';
import { TerminateSubscriptionDto } from './dto/terminate-subscription.dto';
import { SuspendSubscriptionDto } from './dto/suspend-subscription.dto';
import { ReactivateSubscriptionDto } from './dto/reactivate-subscription.dto';
import { TransferSubscriptionDto } from './dto/transfer-subscription.dto';
import { SetAbsenceConsentDto } from './dto/set-absence-consent.dto';
import { ReleaseAbsenceDto } from './dto/release-absence.dto';
import { Roles } from '../identity/roles.decorator';
import { CurrentUser } from '../identity/current-user.decorator';
import type { AuthUser } from '../identity/auth-user';
import { CustomerAccessService } from '../customer-auth/customer-access.service';
import { resolveDate } from '../common/dates';

@Controller('bookings')
export class BookingsController {
  constructor(
    private readonly bookings: BookingsService,
    private readonly customerAccess: CustomerAccessService,
  ) {}

  @Get('quote')
  quote(@Query() query: QuoteBookingDto): Promise<BookingQuoteDTO> {
    return this.bookings.quote(query);
  }

  @Get('subscriptions')
  subscriptions(@Query() query: SubscriptionsQueryDto): Promise<SubscriptionListItemDTO[]> {
    return this.bookings.listSubscriptions(query.seasonId);
  }

  @Get()
  list(@Query() query: BookingsQueryDto): Promise<BookingDTO[]> {
    return this.bookings.listByDate(resolveDate(query.date));
  }

  @Post()
  create(@Body() body: CreateBookingDto): Promise<BookingDTO> {
    return this.bookings.create(body);
  }

  @Post(':id/renew')
  renew(@Param('id') id: string, @Body() body: RenewBookingDto): Promise<BookingDTO> {
    return this.bookings.renew(id, body);
  }

  @Delete(':id')
  cancel(@Param('id') id: string): Promise<BookingDTO> {
    return this.bookings.cancel(id);
  }

  @Post(':id/terminate')
  @HttpCode(200)
  @Roles(Role.Admin)
  terminate(@Param('id') id: string, @Body() body: TerminateSubscriptionDto): Promise<BookingDTO> {
    return this.bookings.terminate(id, body);
  }

  @Post(':id/suspend')
  @HttpCode(200)
  @Roles(Role.Admin)
  suspend(@Param('id') id: string, @Body() body: SuspendSubscriptionDto): Promise<BookingDTO> {
    return this.bookings.suspend(id, body);
  }

  @Post(':id/reactivate')
  @HttpCode(200)
  @Roles(Role.Admin)
  reactivate(@Param('id') id: string, @Body() body: ReactivateSubscriptionDto): Promise<BookingDTO> {
    return this.bookings.reactivate(id, body);
  }

  @Post(':id/transfer')
  @HttpCode(200)
  @Roles(Role.Admin)
  transfer(@Param('id') id: string, @Body() body: TransferSubscriptionDto): Promise<BookingDTO> {
    return this.bookings.transfer(id, body);
  }

  @Patch(':id/payment')
  settle(@Param('id') id: string, @Body() body: SettlePaymentDto): Promise<BookingDTO> {
    return this.bookings.settlePayment(id, body);
  }

  @Patch(':id/absence-consent')
  @Roles(Role.Admin)
  setAbsenceConsent(@Param('id') id: string, @Body() body: SetAbsenceConsentDto): Promise<BookingDTO> {
    return this.bookings.setAbsenceConsent(id, body);
  }

  @Post(':id/absence-releases')
  @HttpCode(200)
  @Roles(Role.Admin)
  releaseAbsence(@Param('id') id: string, @Body() body: ReleaseAbsenceDto): Promise<BookingDTO> {
    return this.bookings.releaseAbsence(id, body);
  }

  @Post(':id/absence-releases/:rid/cancel')
  @HttpCode(200)
  @Roles(Role.Admin)
  cancelAbsenceRelease(@Param('id') id: string, @Param('rid') rid: string): Promise<BookingDTO> {
    return this.bookings.cancelAbsenceRelease(id, rid);
  }

  @Post(':id/customer-access')
  @Roles(Role.Admin)
  provisionCustomerAccess(@Param('id') id: string, @CurrentUser() user: AuthUser): Promise<CustomerProvisionResponse> {
    return this.customerAccess.provisionAccess(id, user.id);
  }

  @Post(':id/customer-access/revoke')
  @Roles(Role.Admin)
  @HttpCode(HttpStatus.NO_CONTENT)
  revokeCustomerAccess(@Param('id') id: string): Promise<void> {
    return this.customerAccess.revokeAccess(id);
  }
}
