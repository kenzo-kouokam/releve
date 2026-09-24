import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ConservationController } from './conservation.controller';
import { ConservationService } from './conservation.service';
import { DocumentsService } from './documents.service';
import { StockageService } from './stockage.service';

/**
 * Le depot et le retrait d'une piece ne passent pas par ici : ils se
 * manipulent depuis `/mon-profil` pour l'interesse et depuis `/candidats/:id`
 * pour l'agence, chacun avec ses gardes. Un `/documents` autonome aurait
 * duplique ces regles.
 *
 * Le seul controleur du module est celui de la conservation, et c'est
 * l'exception qui confirme la regle : il repond a un lien recu par courriel,
 * donc sans session, donc sous aucune de ces gardes.
 */
@Module({
  imports: [AuthModule],
  controllers: [ConservationController],
  providers: [DocumentsService, StockageService, ConservationService],
  exports: [DocumentsService, ConservationService],
})
export class DocumentsModule {}
