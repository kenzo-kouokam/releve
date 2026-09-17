import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { MailModule } from './mail/mail.module';
import { HealthModule } from './health/health.module';
import { CandidatsModule } from './candidats/candidats.module';
import { ContactModule } from './contact/contact.module';
import { DocumentsModule } from './documents/documents.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ClientsModule } from './clients/clients.module';
import { QualificationsModule } from './qualifications/qualifications.module';
import { UtilisateursModule } from './utilisateurs/utilisateurs.module';
import { DonneesPubliquesModule } from './donnees-publiques/donnees-publiques.module';
import { MatchingModule } from './matching/matching.module';
import { MissionsModule } from './missions/missions.module';
import { MonProfilModule } from './mon-profil/mon-profil.module';
import { PropositionsModule } from './propositions/propositions.module';
import { EvenementsModule } from './evenements/evenements.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Les taches planifiees ne partent qu'avec IMPORT_OFFRES_AUTOMATIQUE=true :
    // enregistrer le module ici ne declenche rien par lui-meme.
    ScheduleModule.forRoot(),
    PrismaModule,
    MailModule,
    AuthModule,
    HealthModule,
    CandidatsModule,
    ClientsModule,
    QualificationsModule,
    UtilisateursModule,
    DonneesPubliquesModule,
    MatchingModule,
    MissionsModule,
    ContactModule,
    DocumentsModule,
    NotificationsModule,
    MonProfilModule,
    PropositionsModule,
    EvenementsModule,
  ],
})
export class AppModule {}
