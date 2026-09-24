import { Module } from '@nestjs/common';
import { CacheService } from './cache.service';
import { GeocodageModule } from '../geocodage/geocodage.module';
import { FranceTravailClient } from './france-travail.client';
import { GeocodageOffresService } from './geocodage-offres.service';
import { ImportPlanifieService } from './import-planifie.service';
import { OffresController } from './offres.controller';
import { OffresService } from './offres.service';
import { TensionController } from './tension.controller';
import { VitrineService } from './vitrine.service';

@Module({
  imports: [GeocodageModule],
  controllers: [TensionController, OffresController],
  providers: [
    CacheService,
    FranceTravailClient,
    OffresService,
    VitrineService,
    GeocodageOffresService,
    ImportPlanifieService,
  ],
  exports: [OffresService, CacheService, GeocodageOffresService],
})
export class DonneesPubliquesModule {}
