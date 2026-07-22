import { Body, Controller, Delete, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { Role } from '@coralyn/contracts';
import type { BulkDeleteUmbrellasResultDTO, BulkAssignUmbrellaTypeResultDTO, GenerateUmbrellasResultDTO, StructureUmbrellaDTO } from '@coralyn/contracts';
import { Roles } from '../identity/roles.decorator';
import { UmbrellasService } from './umbrellas.service';
import { CreateUmbrellaDto } from './dto/create-umbrella.dto';
import { UpdateUmbrellaDto } from './dto/update-umbrella.dto';
import { GenerateUmbrellasDto } from './dto/generate-umbrellas.dto';
import { BulkDeleteUmbrellasDto } from './dto/bulk-delete-umbrellas.dto';
import { BulkAssignUmbrellaTypeDto } from './dto/bulk-assign-umbrella-type.dto';

@Controller('establishment/umbrellas')
@Roles(Role.Admin)
export class UmbrellasController {
  constructor(private readonly umbrellas: UmbrellasService) {}

  @Post()
  create(@Body() body: CreateUmbrellaDto): Promise<StructureUmbrellaDTO> {
    return this.umbrellas.create(body);
  }

  @Post('generate')
  generate(@Body() body: GenerateUmbrellasDto): Promise<GenerateUmbrellasResultDTO> {
    return this.umbrellas.generate(body);
  }

  @Post('bulk-delete')
  bulkDelete(@Body() body: BulkDeleteUmbrellasDto): Promise<BulkDeleteUmbrellasResultDTO> {
    return this.umbrellas.bulkDelete(body);
  }

  @Post('bulk-assign-type')
  bulkAssignType(@Body() body: BulkAssignUmbrellaTypeDto): Promise<BulkAssignUmbrellaTypeResultDTO> {
    return this.umbrellas.bulkAssignType(body);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateUmbrellaDto): Promise<StructureUmbrellaDTO> {
    return this.umbrellas.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<StructureUmbrellaDTO> {
    return this.umbrellas.remove(id);
  }
}
