import { Controller, Get, NotFoundException, Param, ParseUUIDPipe } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PublicTitolareDTO } from '@coralyn/contracts';
import { Public } from '../identity/public.decorator';
import { LegalProfileService } from '../establishment/legal-profile.service';

@Controller('public/informativa')
export class PublicInformativaController {
  constructor(private readonly legal: LegalProfileService) {}

  @Public()
  @Get(':establishmentId')
  async get(@Param('establishmentId', ParseUUIDPipe) establishmentId: string): Promise<PublicTitolareDTO> {
    // getTitolare usa establishment.findUniqueOrThrow: id valido ma inesistente → Prisma P2025.
    // Il PrismaExceptionFilter globale lascia P2025 INVARIATO (500) per design (vedi
    // common/prisma-exception.filter.ts) — qui, endpoint pubblico, lo traduciamo esplicitamente in 404.
    try {
      return await this.legal.getTitolare(establishmentId);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        throw new NotFoundException('Stabilimento non trovato');
      }
      throw err;
    }
  }
}
