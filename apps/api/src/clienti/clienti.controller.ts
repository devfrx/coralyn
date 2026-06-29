import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ClientiService } from './clienti.service';
import { ClienteDTO, CreaClienteInput } from '@driftly/contracts';

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
  create(@Body() body: CreaClienteInput): Promise<ClienteDTO> {
    return this.clienti.create(body);
  }
}
