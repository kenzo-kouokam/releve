import type { ConfigService } from '@nestjs/config';

/**
 * Fabrique l'adresse sur laquelle la personne va cliquer.
 *
 * `APP_URL` designe le **front**, pas l'API : le lien s'ouvre dans un
 * navigateur et doit tomber sur une page Nuxt, qui appellera ensuite l'API par
 * le relais. Pointer l'API ici donnerait un JSON brut a quelqu'un qui releve
 * ses courriels.
 */
export function lienCourriel(config: ConfigService, page: string, jeton: string): string {
  const base = config.get<string>('APP_URL') ?? 'http://localhost:3000';

  return `${base.replace(/\/+$/, '')}/${page}?jeton=${encodeURIComponent(jeton)}`;
}
