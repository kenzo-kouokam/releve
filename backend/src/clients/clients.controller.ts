import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  clientCreateSchema,
  clientListQuerySchema,
  clientUpdateSchema,
  lieuCreateSchema,
  lieuUpdateSchema,
  ROLES_AGENCE,
  type ClientCreate,
  type ClientDetail,
  type ClientListQuery,
  type ClientResume,
  type ClientUpdate,
  type LieuCreate,
  type LieuResume,
  type LieuUpdate,
  type PageResultat,
} from '@releve/shared';
import { AgenceCourante, Roles } from '../auth/auth.decorateurs';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ClientsService } from './clients.service';

@ApiTags('clients')
@ApiBearerAuth()
@Roles(...ROLES_AGENCE)
@Controller('clients')
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Get()
  @ApiOperation({ summary: 'Lister les clients de l agence' })
  @ApiQuery({ name: 'type', required: false })
  @ApiQuery({ name: 'recherche', required: false })
  @ApiQuery({ name: 'actif', required: false, type: Boolean })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limite', required: false, type: Number })
  lister(
    @Query(new ZodValidationPipe(clientListQuerySchema)) query: ClientListQuery,
    @AgenceCourante() agenceId: string,
  ): Promise<PageResultat<ClientResume>> {
    return this.clients.lister(query, agenceId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detail d un client et de ses lieux d intervention' })
  detail(
    @Param('id', ParseUUIDPipe) id: string,
    @AgenceCourante() agenceId: string,
  ): Promise<ClientDetail> {
    return this.clients.detail(id, agenceId);
  }

  @Post()
  @ApiOperation({ summary: 'Creer un client' })
  creer(
    @Body(new ZodValidationPipe(clientCreateSchema)) donnees: ClientCreate,
    @AgenceCourante() agenceId: string,
  ): Promise<ClientResume> {
    return this.clients.creer(donnees, agenceId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Modifier un client (le SIRET n est pas modifiable)' })
  modifier(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(clientUpdateSchema)) donnees: ClientUpdate,
    @AgenceCourante() agenceId: string,
  ): Promise<ClientResume> {
    return this.clients.modifier(id, donnees, agenceId);
  }

  @Get(':id/lieux')
  @ApiOperation({ summary: 'Lieux d intervention rattaches au client' })
  listerLieux(
    @Param('id', ParseUUIDPipe) id: string,
    @AgenceCourante() agenceId: string,
  ): Promise<LieuResume[]> {
    return this.clients.listerLieux(id, agenceId);
  }

  @Post(':id/lieux')
  @ApiOperation({ summary: 'Ajouter un lieu d intervention' })
  creerLieu(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(lieuCreateSchema)) donnees: LieuCreate,
    @AgenceCourante() agenceId: string,
  ): Promise<LieuResume> {
    return this.clients.creerLieu(id, donnees, agenceId);
  }

  @Patch(':id/lieux/:lieuId')
  @ApiOperation({ summary: 'Modifier un lieu d intervention' })
  modifierLieu(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('lieuId', ParseUUIDPipe) lieuId: string,
    @Body(new ZodValidationPipe(lieuUpdateSchema)) donnees: LieuUpdate,
    @AgenceCourante() agenceId: string,
  ): Promise<LieuResume> {
    return this.clients.modifierLieu(id, lieuId, donnees, agenceId);
  }
}
