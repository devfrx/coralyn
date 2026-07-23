import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { Role } from '@coralyn/contracts';
import type { BulkDeleteUmbrellasResultDTO, BulkAssignUmbrellaTypeResultDTO, GenerateUmbrellasResultDTO, RetiredUmbrellaDTO, StructureUmbrellaDTO } from '@coralyn/contracts';
import { Roles } from '../identity/roles.decorator';
import { UmbrellasService } from './umbrellas.service';
import { CreateUmbrellaDto } from './dto/create-umbrella.dto';
import { UpdateUmbrellaDto } from './dto/update-umbrella.dto';
import { GenerateUmbrellasDto } from './dto/generate-umbrellas.dto';
import { BulkDeleteUmbrellasDto } from './dto/bulk-delete-umbrellas.dto';
import { BulkAssignUmbrellaTypeDto } from './dto/bulk-assign-umbrella-type.dto';
import { RestoreUmbrellaDto } from './dto/restore-umbrella.dto';

// I @Roles stanno sui singoli handler (non sulla classe): le mutazioni e il CRUD sono admin-only,
// la sola GET retired è anche staff — serve alla risoluzione delle label storiche nelle viste
// Prenotazioni/Rinnovi (D-060), è pura struttura senza PII come la day-map che lo staff già vede.
@Controller('establishment/umbrellas')
export class UmbrellasController {
  constructor(private readonly umbrellas: UmbrellasService) {}

  @Post()
  @Roles(Role.Admin)
  create(@Body() body: CreateUmbrellaDto): Promise<StructureUmbrellaDTO> {
    return this.umbrellas.create(body);
  }

  @Post('generate')
  @Roles(Role.Admin)
  generate(@Body() body: GenerateUmbrellasDto): Promise<GenerateUmbrellasResultDTO> {
    return this.umbrellas.generate(body);
  }

  @Post('bulk-delete')
  @Roles(Role.Admin)
  bulkDelete(@Body() body: BulkDeleteUmbrellasDto): Promise<BulkDeleteUmbrellasResultDTO> {
    return this.umbrellas.bulkDelete(body);
  }

  @Post('bulk-assign-type')
  @Roles(Role.Admin)
  bulkAssignType(@Body() body: BulkAssignUmbrellaTypeDto): Promise<BulkAssignUmbrellaTypeResultDTO> {
    return this.umbrellas.bulkAssignType(body);
  }

  // Route statica 'retired' PRIMA delle rotte parametriche ':id...' sotto: altrimenti Nest la
  // interpreterebbe come un :id letterale "retired".
  @Get('retired')
  @Roles(Role.Admin, Role.Staff)
  listRetired(): Promise<RetiredUmbrellaDTO[]> {
    return this.umbrellas.listRetired();
  }

  @Post(':id/retire')
  @Roles(Role.Admin)
  retire(@Param('id', ParseUUIDPipe) id: string): Promise<RetiredUmbrellaDTO> {
    return this.umbrellas.retire(id);
  }

  @Post(':id/restore')
  @Roles(Role.Admin)
  restore(@Param('id', ParseUUIDPipe) id: string, @Body() body: RestoreUmbrellaDto): Promise<StructureUmbrellaDTO> {
    return this.umbrellas.restore(id, body);
  }

  @Patch(':id')
  @Roles(Role.Admin)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateUmbrellaDto): Promise<StructureUmbrellaDTO> {
    return this.umbrellas.update(id, body);
  }

  @Delete(':id')
  @Roles(Role.Admin)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<StructureUmbrellaDTO> {
    return this.umbrellas.remove(id);
  }
}
