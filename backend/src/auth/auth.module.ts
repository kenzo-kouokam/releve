import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, type JwtModuleOptions } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { GeocodageModule } from '../geocodage/geocodage.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { InscriptionsService } from './inscriptions.service';
import { VerificationEmailService } from './verification-email.service';
import { ReinitialisationService } from './reinitialisation.service';
import { JetonsUsageUniqueService } from './jetons-usage-unique.service';
import { SessionsService } from './sessions.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { ServiceTokenGuard } from './service-token.guard';

/**
 * `expiresIn` est type par jsonwebtoken comme un litteral de duree ("15m",
 * "7d"...). La valeur vient d'une variable d'environnement, donc d'un `string`
 * simple : l'assertion est le seul point de contact entre les deux.
 */
type DureeJeton = NonNullable<NonNullable<JwtModuleOptions['signOptions']>['expiresIn']>;

@Module({
  imports: [
    ThrottlerModule.forRoot({
      // Interrupteur global. Les tests d'integration jouent des dizaines
      // d'appels depuis la meme adresse : sans cela, la limitation ferait
      // echouer des suites qui ne la testent pas. `skipIf` court-circuite aussi
      // les plafonds poses par @Throttle, ce qu'une garde surchargee ne fait pas.
      skipIf: () => process.env.THROTTLE_ACTIF === 'false',
      throttlers: [
        // Plafond general, large : il attrape un client devenu fou, pas un
        // attaquant. Les routes sensibles resserrent avec @Throttle.
        { name: 'defaut', limit: 300, ttl: 60_000 },
        { name: 'connexion', limit: 300, ttl: 60_000 },
      ],
    }),
    GeocodageModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>('JWT_SECRET');

        if (!secret) {
          throw new Error('JWT_SECRET est absent : copier .env.example vers backend/.env');
        }

        return {
          secret,
          signOptions: { expiresIn: (config.get<string>('JWT_EXPIRES_IN') ?? '15m') as DureeJeton },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    InscriptionsService,
    VerificationEmailService,
    ReinitialisationService,
    JetonsUsageUniqueService,
    SessionsService,
    // L'ordre compte : on limite le debit, puis on identifie, puis on verifie le role.
    // `ServiceTokenGuard` s'intercale avant l'identification : sur les routes
    // qu'il garde, il n'y a pas d'utilisateur a identifier — seulement un
    // appelant machine a reconnaitre, ou a refuser avant tout le reste.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: ServiceTokenGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  // `JetonsUsageUniqueService` sort du module : la conservation des pieces
  // emet elle aussi un lien a usage unique, et une seconde implementation du
  // meme mecanisme finirait par ne plus invalider les memes choses.
  exports: [AuthService, SessionsService, JetonsUsageUniqueService],
})
export class AuthModule {}
