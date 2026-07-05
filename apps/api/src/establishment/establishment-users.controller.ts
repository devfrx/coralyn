import { Body, Controller, Param, Patch, Post } from '@nestjs/common';
import { Role } from '@coralyn/contracts';
import type { EstablishmentMemberDTO, ResetStaffPasswordResponse } from '@coralyn/contracts';
import { Roles } from '../identity/roles.decorator';
import { CurrentUser } from '../identity/current-user.decorator';
import type { AuthUser } from '../identity/auth-user';
import { EstablishmentUsersService } from './establishment-users.service';
import { CreateStaffUserDto } from './dto/create-staff-user.dto';
import { UpdateStaffUserDto } from './dto/update-staff-user.dto';

@Controller('establishment/users')
export class EstablishmentUsersController {
  constructor(private readonly users: EstablishmentUsersService) {}

  @Post()
  @Roles(Role.Admin)
  create(@Body() body: CreateStaffUserDto, @CurrentUser() user: AuthUser): Promise<EstablishmentMemberDTO> {
    return this.users.create(body, user.id);
  }

  @Patch(':id')
  @Roles(Role.Admin)
  setDisabled(@Param('id') id: string, @Body() body: UpdateStaffUserDto, @CurrentUser() user: AuthUser): Promise<EstablishmentMemberDTO> {
    return this.users.setDisabled(id, body.disabled, user.id);
  }

  @Post(':id/reset-password')
  @Roles(Role.Admin)
  resetPassword(@Param('id') id: string, @CurrentUser() user: AuthUser): Promise<ResetStaffPasswordResponse> {
    return this.users.resetPassword(id, user.id);
  }
}
