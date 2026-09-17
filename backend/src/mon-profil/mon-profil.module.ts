import { Module } from '@nestjs/common';
import { CandidatsModule } from '../candidats/candidats.module';
import { DocumentsModule } from '../documents/documents.module';
import { MonProfilController } from './mon-profil.controller';
import { MonProfilService } from './mon-profil.service';

@Module({
  imports: [CandidatsModule, DocumentsModule],
  controllers: [MonProfilController],
  providers: [MonProfilService],
})
export class MonProfilModule {}
