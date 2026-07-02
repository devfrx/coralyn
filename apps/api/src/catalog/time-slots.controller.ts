import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import type { TimeSlotDTO } from '@coralyn/contracts';
import { TimeSlotsService } from './time-slots.service';
import { CreateTimeSlotDto } from './dto/create-time-slot.dto';
import { UpdateTimeSlotDto } from './dto/update-time-slot.dto';

@Controller('time-slots')
export class TimeSlotsController {
  constructor(private readonly timeSlots: TimeSlotsService) {}

  @Get()
  list(): Promise<TimeSlotDTO[]> {
    return this.timeSlots.list();
  }

  @Post()
  create(@Body() body: CreateTimeSlotDto): Promise<TimeSlotDTO> {
    return this.timeSlots.create(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateTimeSlotDto): Promise<TimeSlotDTO> {
    return this.timeSlots.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string): Promise<TimeSlotDTO> {
    return this.timeSlots.remove(id);
  }
}
