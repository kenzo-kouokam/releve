import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  qualificationCreateSchema,
  type QualificationCreate,
  type QualificationResume,
} from '@releve/shared';
import { Roles } from '../auth/auth.decorateurs';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { QualificationsService } from './qualifications.service';

@ApiTags('qualifications')
@ApiBearerAuth()
@Controller('qualifications')
export class QualificationsController {
  constructor(private readonly qualifications: QualificationsService) {}

  /**
   * Lecture ouverte a tout compte authentifie : le candidat et le client ont
   * besoin du libelle des qualifications pour lire une mission. Le referentiel
   * ne contient aucune donnee nominative.
   */
  @Get()
  @ApiOperation({ summary: 'Referentiel des qualifications' })
  lister(): Promise<QualificationResume[]> {
    return this.qualifications.lister();
  }

  // Le referentiel est partage par toutes les agences : y ajouter une ligne
  // engage tout le monde, donc administrateur seulement.
  @Post()
  @Roles('ADMIN_AGENCE')
  @ApiOperation({ summary: 'Ajouter une qualification au referentiel' })
  creer(
    @Body(new ZodValidationPipe(qualificationCreateSchema)) donnees: QualificationCreate,
  ): Promise<QualificationResume> {
    return this.qualifications.creer(donnees);
  }
}
