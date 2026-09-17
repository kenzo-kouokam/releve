import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { messageContactSchema, type MessageContact } from '@releve/shared';
import { Public } from '../auth/auth.decorateurs';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ContactService } from './contact.service';

@ApiTags('contact')
@Controller('contact')
export class ContactController {
  constructor(private readonly contact: ContactService) {}

  /**
   * Route publique qui fait partir un courriel : c'est exactement le genre
   * qu'on trouve en quelques heures et qu'on transforme en robinet a spam.
   * D'ou trois barrieres, et pas une seule — le plafond de debit par adresse,
   * les bornes de longueur du schema partage, et le piege a robots du
   * formulaire.
   *
   * Trois messages par quart d'heure : au-dela, ce n'est plus quelqu'un qui
   * ecrit a son agence.
   */
  @Public()
  @Throttle({ defaut: { limit: 3, ttl: 900_000 } })
  @Post()
  @HttpCode(202)
  @ApiOperation({ summary: "Relaie un message du formulaire de contact a l'agence" })
  async envoyer(
    @Body(new ZodValidationPipe(messageContactSchema)) demande: MessageContact,
  ): Promise<void> {
    await this.contact.relayer(demande);
  }
}
