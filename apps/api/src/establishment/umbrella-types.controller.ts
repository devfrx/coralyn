import { Body, Controller, Delete, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { Role } from '@coralyn/contracts';
import type { UmbrellaTypeDTO } from '@coralyn/contracts';
import { Roles } from '../identity/roles.decorator';
import { UmbrellaTypesService } from './umbrella-types.service';
import { CreateUmbrellaTypeDto } from './dto/create-umbrella-type.dto';
import { UpdateUmbrellaTypeDto } from './dto/update-umbrella-type.dto';

@Controller('establishment/umbrella-types')
@Roles(Role.Admin)
export class UmbrellaTypesController {
  constructor(private readonly types: UmbrellaTypesService) {}

  @Post()
  create(@Body() body: CreateUmbrellaTypeDto): Promise<UmbrellaTypeDTO> {
    return this.types.create(body);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateUmbrellaTypeDto): Promise<UmbrellaTypeDTO> {
    return this.types.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<UmbrellaTypeDTO> {
    return this.types.remove(id);
  }
}
