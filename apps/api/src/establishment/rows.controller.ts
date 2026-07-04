import { Body, Controller, Delete, Param, Patch, Post } from '@nestjs/common';
import { Role } from '@coralyn/contracts';
import type { StructureRowDTO } from '@coralyn/contracts';
import { Roles } from '../identity/roles.decorator';
import { RowsService } from './rows.service';
import { CreateRowDto } from './dto/create-row.dto';
import { UpdateRowDto } from './dto/update-row.dto';

@Controller('establishment/rows')
@Roles(Role.Admin)
export class RowsController {
  constructor(private readonly rows: RowsService) {}

  @Post()
  create(@Body() body: CreateRowDto): Promise<StructureRowDTO> {
    return this.rows.create(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateRowDto): Promise<StructureRowDTO> {
    return this.rows.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string): Promise<StructureRowDTO> {
    return this.rows.remove(id);
  }
}
