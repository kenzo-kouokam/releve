import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import type { Barometre } from '@releve/shared';
import { OffresService } from './offres.service';

const barometreQuerySchema = z.object({
  jours: z.coerce.number().int().min(1).max(365).default(30),
  departement: z
    .string()
    .trim()
    .regex(/^(\d{2,3}|2[AB])$/, 'Code departement invalide')
    .optional(),
});

const suggestionQuerySchema = barometreQuerySchema.extend({
  rome: z
    .string()
    .trim()
    .regex(/^[A-Z]\d{4}$/, 'Code ROME invalide'),
  jours: z.coerce.number().int().min(1).max(365).default(90),
});

@ApiTags('tension')
@Controller('tension')
export class TensionController {
  constructor(private readonly offres: OffresService) {}

  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Barometre de tension par metier et departement' })
  @ApiQuery({ name: 'jours', required: false, type: Number })
  @ApiQuery({ name: 'departement', required: false })
  barometre(
    @Query(new ZodValidationPipe(barometreQuerySchema))
    query: z.infer<typeof barometreQuerySchema>,
  ): Promise<Barometre> {
    return this.offres.barometre(query.jours, query.departement);
  }

  /**
   * Premier usage visible de la donnee publique : le taux horaire propose a
   * l'entreprise au moment ou elle cree sa mission.
   */
  @Get('suggestion')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Taux horaire suggere pour un metier et un departement' })
  @ApiQuery({ name: 'rome', required: true })
  @ApiQuery({ name: 'departement', required: false })
  @ApiQuery({ name: 'jours', required: false, type: Number })
  suggestion(
    @Query(new ZodValidationPipe(suggestionQuerySchema))
    query: z.infer<typeof suggestionQuerySchema>,
  ) {
    return this.offres.tauxSuggere(query.rome, query.departement, query.jours);
  }
}
