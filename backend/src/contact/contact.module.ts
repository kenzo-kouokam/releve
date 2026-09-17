import { Module } from '@nestjs/common';
import { ContactController } from './contact.controller';
import { ContactService } from './contact.service';

/**
 * `MailModule` est global : rien a importer ici. Le module n'existe que pour
 * tenir ensemble la route publique et le relais, sans les accrocher a un
 * domaine metier — un message de contact n'appartient ni au vivier, ni aux
 * missions.
 */
@Module({
  controllers: [ContactController],
  providers: [ContactService],
})
export class ContactModule {}
