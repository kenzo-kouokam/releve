import { Module } from '@nestjs/common';
import { CompetencesModule } from '../competences/competences.module';
import { DocumentsModule } from '../documents/documents.module';
import { GeocodageModule } from '../geocodage/geocodage.module';
import { CandidatsController } from './candidats.controller';
import { CandidatsService } from './candidats.service';

@Module({
  imports: [DocumentsModule, GeocodageModule, CompetencesModule],
  controllers: [CandidatsController],
  providers: [CandidatsService],
  exports: [CandidatsService],
})
export class CandidatsModule {}
