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

// Admin-only di default (fail-closed: un handler futuro senza @Roles nasce protetto). La sola
// GET retired dichiara un override Admin+Staff sul metodo (in getAllAndOverride il metodo vince
// sulla classe): serve alla risoluzione delle label storiche in Prenotazioni/Rinnovi (D-060) ed
// è pura struttura senza PII, come la day-map che lo staff già vede.
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

  // Route statica 'retired' PRIMA delle rotte parametriche ':id...' sotto: altrimenti Nest la
  // interpreterebbe come un :id letterale "retired".
  @Get('retired')
  @Roles(Role.Admin, Role.Staff)
  listRetired(): Promise<RetiredUmbrellaDTO[]> {
    return this.umbrellas.listRetired();
  }

  @Post(':id/retire')
  retire(@Param('id', ParseUUIDPipe) id: string): Promise<RetiredUmbrellaDTO> {
    return this.umbrellas.retire(id);
  }

  @Post(':id/restore')
  restore(@Param('id', ParseUUIDPipe) id: string, @Body() body: RestoreUmbrellaDto): Promise<StructureUmbrellaDTO> {
    return this.umbrellas.restore(id, body);
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
