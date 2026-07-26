import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import type { EstablishmentMemberDTO, ResetStaffPasswordResponse } from '@coralyn/contracts';
import { Permission } from '../identity/permission';
import { RequiresPermission } from '../identity/permission.decorator';
import { CurrentUser } from '../identity/current-user.decorator';
import type { AuthUser } from '../identity/auth-user';
import { EstablishmentUsersService } from './establishment-users.service';
import { CreateStaffUserDto } from './dto/create-staff-user.dto';
import { UpdateStaffUserDto } from './dto/update-staff-user.dto';

@Controller('establishment/users')
@RequiresPermission(Permission.TeamManage)
export class EstablishmentUsersController {
  constructor(private readonly users: EstablishmentUsersService) {}

  // Le email degli operatori vivono qui e non nell'overview: il permesso di classe è `team.manage`,
  // cioè admin, mentre l'overview è leggibile da tutto lo staff (D-064).
  @Get()
  list(): Promise<EstablishmentMemberDTO[]> {
    return this.users.list();
  }

  @Post()
  create(@Body() body: CreateStaffUserDto, @CurrentUser() user: AuthUser): Promise<EstablishmentMemberDTO> {
    return this.users.create(body, user.id);
  }

  @Patch(':id')
  setDisabled(@Param('id') id: string, @Body() body: UpdateStaffUserDto, @CurrentUser() user: AuthUser): Promise<EstablishmentMemberDTO> {
    return this.users.setDisabled(id, body.disabled, user.id);
  }

  @Post(':id/reset-password')
  resetPassword(@Param('id') id: string, @CurrentUser() user: AuthUser): Promise<ResetStaffPasswordResponse> {
    return this.users.resetPassword(id, user.id);
  }
}
