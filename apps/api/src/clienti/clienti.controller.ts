import { Body, Controller, Get, Post } from '@nestjs/common';
import { ClientiService } from './clienti.service';
import { ClienteDTO } from '@driftly/contracts';

@Controller('clienti')
export class ClientiController {
  constructor(private readonly clienti: ClientiService) {}

  @Get()
  list(): Promise<ClienteDTO[]> {
    return this.clienti.list();
  }

  @Post()
  create(@Body() body: { nome: string; cognome: string }): Promise<ClienteDTO> {
    return this.clienti.create(body);
  }
}
