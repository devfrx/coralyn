import { Body, Controller, Delete, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import type { StructureRowDTO } from '@coralyn/contracts';
import { Permission } from '../identity/permission';
import { RequiresPermission } from '../identity/permission.decorator';
import { RowsService } from './rows.service';
import { CreateRowDto } from './dto/create-row.dto';
import { UpdateRowDto } from './dto/update-row.dto';

@Controller('establishment/rows')
@RequiresPermission(Permission.StructureManage)
export class RowsController {
  constructor(private readonly rows: RowsService) {}

  @Post()
  create(@Body() body: CreateRowDto): Promise<StructureRowDTO> {
    return this.rows.create(body);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateRowDto): Promise<StructureRowDTO> {
    return this.rows.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<StructureRowDTO> {
    return this.rows.remove(id);
  }
}
