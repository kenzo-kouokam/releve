import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module';
import { GeocodageModule } from '../geocodage/geocodage.module';
import { CandidatsController } from './candidats.controller';
import { CandidatsService } from './candidats.service';

@Module({
  imports: [DocumentsModule, GeocodageModule],
  controllers: [CandidatsController],
  providers: [CandidatsService],
  exports: [CandidatsService],
})
export class CandidatsModule {}
