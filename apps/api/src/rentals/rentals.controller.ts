import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import type { RentalDTO, RentalsDayDTO } from '@coralyn/contracts';
import { RentalsService } from './rentals.service';
import { CheckoutRentalDto } from './dto/checkout-rental.dto';
import { SettlePaymentDto } from '../bookings/dto/settle-payment.dto';

@Controller('rentals')
export class RentalsController {
  constructor(private readonly rentals: RentalsService) {}

  @Get() list(@Query('date') date?: string): Promise<RentalsDayDTO> { return this.rentals.listByDate(date); }
  @Post() checkout(@Body() b: CheckoutRentalDto): Promise<RentalDTO> { return this.rentals.checkout(b); }
  @Patch(':id/return') ret(@Param('id') id: string): Promise<RentalDTO> { return this.rentals.returnRental(id); }
  @Patch(':id/cancel') cancel(@Param('id') id: string): Promise<RentalDTO> { return this.rentals.cancelRental(id); }
  @Patch(':id/payment') pay(@Param('id') id: string, @Body() b: SettlePaymentDto): Promise<RentalDTO> {
    return this.rentals.settlePayment(id, b);
  }
}
