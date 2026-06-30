import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { CustomerDTO } from '@coralyn/contracts';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  list(): Promise<CustomerDTO[]> {
    return this.customers.list();
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
}
