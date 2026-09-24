import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

/** Vrai pour '1', 'true', 'oui' — et faux pour tout le reste, y compris rien. */
function actif(valeur: string | undefined, defaut = false): boolean {
  if (valeur === undefined || valeur === '') {
    return defaut;
  }

  return ['1', 'true', 'oui'].includes(valeur.toLowerCase());
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const production = process.env.NODE_ENV === 'production';

  /**
   * La documentation n'est pas ouverte par defaut en production.
   *
   * `/api/docs` publie la carte complete de la surface d'API : chaque route,
   * chaque parametre, chaque forme de reponse. Ce n'est pas un secret — une
   * API se devine — mais l'offrir dressee et a jour fait gagner a qui cherche
   * exactement le temps qu'on a mis a l'ecrire. Elle reste allumee ailleurs,
   * ou elle sert tous les jours, et `API_DOCS=true` la rouvre explicitement
   * pour une recette.
   */
  const docsOuvertes = actif(process.env.API_DOCS, !production);

  /**
   * En-tetes de securite.
   *
   * L'API ne rend que du JSON et un fichier en piece jointe : la plupart des
   * en-tetes d'helmet n'y changent rien. Trois comptent vraiment ici —
   * `X-Content-Type-Options: nosniff`, qui empeche un navigateur de requalifier
   * un document televerse en HTML ; `Strict-Transport-Security`, qui evite le
   * premier aller-retour en clair ; et `hidePoweredBy`, qui cesse d'annoncer
   * Express et sa version.
   *
   * La politique de contenu, elle, ne sert qu'a la page de documentation, seule
   * page HTML servie par l'API. Swagger UI se charge en styles et scripts
   * inline : sous la politique par defaut d'helmet, elle s'affiche blanche. On
   * la desserre donc juste assez, et seulement quand la page existe.
   */
  app.use(
    helmet({
      contentSecurityPolicy: docsOuvertes
        ? {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'", "'unsafe-inline'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              imgSrc: ["'self'", 'data:'],
              objectSrc: ["'none'"],
              frameAncestors: ["'none'"],
            },
          }
        : undefined,
      // Une reponse de l'API n'a jamais a etre chargee comme sous-ressource
      // par un autre site : le relais Nitro l'appelle de serveur a serveur.
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );

  /**
   * Adresse du client derriere un reverse proxy.
   *
   * La limitation de debit compte par adresse IP. Derriere un proxy qui ne
   * serait pas declare, Express voit l'adresse du proxy et non celle du client :
   * tout le monde partage alors le meme compteur, et le premier a le saturer
   * ferme la porte a tous les autres. Declare a tort, l'inverse se produit —
   * `X-Forwarded-For` devient falsifiable et le compteur ne compte plus rien.
   * D'ou un reglage explicite, faux par defaut : seul celui qui deploie sait
   * s'il y a un proxy devant.
   */
  if (actif(process.env.TRUST_PROXY)) {
    app.set('trust proxy', 1);
  }

  app.setGlobalPrefix('api');
  app.enableCors({
    origin: (process.env.API_CORS_ORIGIN ?? 'http://localhost:3000').split(','),
    credentials: true,
  });

  if (docsOuvertes) {
    const config = new DocumentBuilder()
      .setTitle('Relève API')
      .setDescription("API de la plateforme d'interim en EHPAD, hopital et clinique")
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));
  }

  const port = Number(process.env.API_PORT ?? 3001);
  await app.listen(port);

  const logger = new Logger('Bootstrap');
  logger.log(`API : http://localhost:${port}/api`);
  logger.log(docsOuvertes ? `Doc : http://localhost:${port}/api/docs` : 'Doc : fermee (API_DOCS)');
}

void bootstrap();
