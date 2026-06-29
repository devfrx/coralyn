import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ClientiService } from './clienti.service';
import { ClienteDTO } from '@driftly/contracts';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { UpdateClienteDto } from './dto/update-cliente.dto';

@Controller('clienti')
export class ClientiController {
  constructor(private readonly clienti: ClientiService) {}

  @Get()
  list(): Promise<ClienteDTO[]> {
    return this.clienti.list();
  }

  @Get(':id')
  getById(@Param('id') id: string): Promise<ClienteDTO> {
    return this.clienti.getById(id);
  }

  @Post()
  create(@Body() body: CreateClienteDto): Promise<ClienteDTO> {
    return this.clienti.create(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateClienteDto): Promise<ClienteDTO> {
    return this.clienti.update(id, body);
  }
}
