import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { CustomerDTO, CustomerBookingDTO, DeleteCustomerResult, Role } from '@coralyn/contracts';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { BookingsService } from '../bookings/bookings.service';
import { Roles } from '../identity/roles.decorator';
import { CurrentUser } from '../identity/current-user.decorator';
import { AuthUser } from '../identity/auth-user';

@Controller('customers')
export class CustomersController {
  constructor(
    private readonly customers: CustomersService,
    private readonly bookings: BookingsService,
  ) {}

  @Get()
  list(): Promise<CustomerDTO[]> {
    return this.customers.list();
  }

  @Get(':id/bookings')
  listBookings(@Param('id') id: string): Promise<CustomerBookingDTO[]> {
    return this.bookings.listByCustomer(id);
  }

  @Get(':id')
  getById(@Param('id') id: string): Promise<CustomerDTO> {
    return this.customers.getById(id);
  }

  @Post()
  create(@Body() body: CreateCustomerDto): Promise<CustomerDTO> {
    return this.customers.create(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateCustomerDto): Promise<CustomerDTO> {
    return this.customers.update(id, body);
  }

  @Delete(':id')
  @Roles(Role.Admin)
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser): Promise<DeleteCustomerResult> {
    return this.customers.remove(id, user.id);
  }
}
