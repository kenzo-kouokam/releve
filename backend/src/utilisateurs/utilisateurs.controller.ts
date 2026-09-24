import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  motDePasseReinitialiseSchema,
  utilisateurCreateSchema,
  utilisateurListQuerySchema,
  utilisateurUpdateSchema,
  type MotDePasseReinitialise,
  type PageResultat,
  type UtilisateurCreate,
  type UtilisateurListQuery,
  type UtilisateurResume,
  type UtilisateurSession,
  type UtilisateurUpdate,
} from '@releve/shared';
import { AgenceCourante, Roles, UtilisateurCourant } from '../auth/auth.decorateurs';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { UtilisateursService } from './utilisateurs.service';

// Gerer les acces est un acte d'administration : le charge de recrutement, qui
// travaille pourtant dans la meme agence, n'y a pas acces.
@ApiTags('utilisateurs')
@ApiBearerAuth()
@Roles('ADMIN_AGENCE')
@Controller('utilisateurs')
export class UtilisateursController {
  constructor(private readonly utilisateurs: UtilisateursService) {}

  @Get()
  @ApiOperation({ summary: 'Lister les comptes de l agence et de ses clients et candidats' })
  @ApiQuery({ name: 'role', required: false })
  @ApiQuery({ name: 'actif', required: false, type: Boolean })
  @ApiQuery({ name: 'recherche', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limite', required: false, type: Number })
  lister(
    @Query(new ZodValidationPipe(utilisateurListQuerySchema)) query: UtilisateurListQuery,
    @AgenceCourante() agenceId: string,
  ): Promise<PageResultat<UtilisateurResume>> {
    return this.utilisateurs.lister(query, agenceId);
  }

  @Post()
  @ApiOperation({ summary: 'Creer un compte' })
  creer(
    @Body(new ZodValidationPipe(utilisateurCreateSchema)) donnees: UtilisateurCreate,
    @AgenceCourante() agenceId: string,
  ): Promise<UtilisateurResume> {
    return this.utilisateurs.creer(donnees, agenceId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Activer, desactiver ou changer le role d un compte' })
  modifier(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(utilisateurUpdateSchema)) donnees: UtilisateurUpdate,
    @UtilisateurCourant() auteur: UtilisateurSession,
    @AgenceCourante() agenceId: string,
  ): Promise<UtilisateurResume> {
    return this.utilisateurs.modifier(id, donnees, auteur, agenceId);
  }

  @Post(':id/mot-de-passe')
  @ApiOperation({ summary: 'Reinitialiser le mot de passe d un compte' })
  reinitialiserMotDePasse(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(motDePasseReinitialiseSchema)) donnees: MotDePasseReinitialise,
    @AgenceCourante() agenceId: string,
  ): Promise<UtilisateurResume> {
    return this.utilisateurs.reinitialiserMotDePasse(id, donnees, agenceId);
  }
}
