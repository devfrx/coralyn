import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import type { RateDTO } from '@coralyn/contracts';
import { RatesService } from './rates.service';
import { CreateRateDto } from './dto/create-rate.dto';
import { UpdateRateDto } from './dto/update-rate.dto';
import { RatesQueryDto } from './dto/rates-query.dto';

@Controller('rates')
export class RatesController {
  constructor(private readonly rates: RatesService) {}

  @Get()
  list(@Query() query: RatesQueryDto): Promise<RateDTO[]> {
    return this.rates.list(query.seasonId);
  }

  @Post()
  create(@Body() body: CreateRateDto): Promise<RateDTO> {
    return this.rates.create(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateRateDto): Promise<RateDTO> {
    return this.rates.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string): Promise<RateDTO> {
    return this.rates.remove(id);
  }
}
