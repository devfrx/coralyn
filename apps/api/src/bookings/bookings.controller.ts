import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import type { BookingDTO, BookingQuoteDTO, SubscriptionListItemDTO } from '@coralyn/contracts';
import { Role } from '@coralyn/contracts';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { QuoteBookingDto } from './dto/quote-booking.dto';
import { SettlePaymentDto } from './dto/settle-payment.dto';
import { BookingsQueryDto } from './dto/bookings-query.dto';
import { SubscriptionsQueryDto } from './dto/subscriptions-query.dto';
import { RenewBookingDto } from './dto/renew-booking.dto';
import { TerminateSubscriptionDto } from './dto/terminate-subscription.dto';
import { Roles } from '../identity/roles.decorator';
import { resolveDate } from '../common/dates';

@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

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
  @Roles(Role.Admin)
  terminate(@Param('id') id: string, @Body() body: TerminateSubscriptionDto): Promise<BookingDTO> {
    return this.bookings.terminate(id, body);
  }

  @Patch(':id/payment')
  settle(@Param('id') id: string, @Body() body: SettlePaymentDto): Promise<BookingDTO> {
    return this.bookings.settlePayment(id, body);
  }
}
