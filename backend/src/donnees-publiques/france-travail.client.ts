import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { OffreBrute } from './normalisation';

const URL_JETON =
  'https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire';
const URL_RECHERCHE = 'https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search';

/** Portees minimales pour lire les offres. */
const PORTEES = 'api_offresdemploiv2 o2dsoffre';

/** Taille de page maximale acceptee par l'API. */
const PAGE = 150;

/**
 * L'API refuse les plages au-dela de ce rang. Inutile de tenter : une reponse
 * 400 en plein import est plus penible qu'un arret annonce.
 */
const RANG_MAX = 3000;

/** Marge retiree a la duree de vie du jeton, pour ne pas l'utiliser expire. */
const MARGE_JETON_MS = 30_000;

export interface CriteresRecherche {
  /** Codes ROME du secteur. */
  romes: string[];
  /** Departements, facultatif : sans filtre, la recherche est nationale. */
  departements?: string[];
  /** Ne remonter que les offres creees depuis N jours. */
  jours?: number;
  /** Plafond d'offres a rapatrier, toutes pages confondues. */
  max?: number;
}

/**
 * Acces a l'API Offres d'emploi de France Travail.
 *
 * Deux choses seulement sont faites ici : obtenir un jeton et rapatrier des
 * pages. Aucun nettoyage, aucune ecriture en base — c'est ce qui permet de
 * tester le nettoyage sans reseau, et de rejouer un import depuis un
 * instantane local.
 */
@Injectable()
export class FranceTravailClient {
  private readonly logger = new Logger(FranceTravailClient.name);

  private jeton: { valeur: string; expireLe: number } | null = null;

  constructor(private readonly config: ConfigService) {}

  estConfigure(): boolean {
    return Boolean(
      this.config.get<string>('FRANCE_TRAVAIL_CLIENT_ID') &&
      this.config.get<string>('FRANCE_TRAVAIL_CLIENT_SECRET'),
    );
  }

  /**
   * Jeton d'acces, garde en memoire tant qu'il est valide. Il vit environ
   * vingt-cinq minutes, et un import complet peut durer plus longtemps que ca :
   * la verification a chaque page evite un 401 au milieu du parcours.
   */
  private async obtenirJeton(): Promise<string> {
    if (this.jeton && Date.now() < this.jeton.expireLe) {
      return this.jeton.valeur;
    }

    const identifiant = this.config.get<string>('FRANCE_TRAVAIL_CLIENT_ID');
    const secret = this.config.get<string>('FRANCE_TRAVAIL_CLIENT_SECRET');

    if (!identifiant || !secret) {
      throw new ServiceUnavailableException(
        'Identifiants France Travail absents : renseigner FRANCE_TRAVAIL_CLIENT_ID et FRANCE_TRAVAIL_CLIENT_SECRET',
      );
    }

    const reponse = await fetch(URL_JETON, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: identifiant,
        client_secret: secret,
        scope: PORTEES,
      }),
    });

    if (!reponse.ok) {
      const detail = await reponse.text();
      this.logger.error(`Jeton refuse (${reponse.status}) : ${detail.slice(0, 200)}`);
      throw new ServiceUnavailableException("Authentification refusee par l'API France Travail");
    }

    const corps = (await reponse.json()) as { access_token: string; expires_in: number };

    this.jeton = {
      valeur: corps.access_token,
      expireLe: Date.now() + corps.expires_in * 1000 - MARGE_JETON_MS,
    };

    return this.jeton.valeur;
  }

  private parametres(criteres: CriteresRecherche, debut: number): URLSearchParams {
    const params = new URLSearchParams({
      codeROME: criteres.romes.join(','),
      // Le sujet porte sur l'interim : les autres contrats ne disent rien de la
      // tension sur le remplacement.
      typeContrat: 'MIS',
      range: `${debut}-${debut + PAGE - 1}`,
    });

    if (criteres.departements?.length) {
      params.set('departement', criteres.departements.join(','));
    }

    if (criteres.jours) {
      const depuis = new Date(Date.now() - criteres.jours * 24 * 3600 * 1000);

      // L'API veut des dates sans millisecondes, et refuse une borne sans
      // l'autre : « minCreationDate et maxCreationDate sont dependants et
      // doivent etre renseignes ensemble ».
      params.set('minCreationDate', `${depuis.toISOString().slice(0, 19)}Z`);
      params.set('maxCreationDate', `${new Date().toISOString().slice(0, 19)}Z`);
    }

    return params;
  }

  /**
   * Rapatrie les offres correspondant aux criteres, page par page.
   *
   * L'API repond 206 tant qu'il reste des pages et 204 quand il n'y a rien :
   * les deux sont des succes, et les traiter comme des erreurs ferait echouer
   * un import parfaitement normal.
   */
  async rechercher(criteres: CriteresRecherche): Promise<OffreBrute[]> {
    const plafond = Math.min(criteres.max ?? 1000, RANG_MAX);
    const offres: OffreBrute[] = [];
    let debut = 0;

    while (debut < plafond) {
      const jeton = await this.obtenirJeton();
      const url = `${URL_RECHERCHE}?${this.parametres(criteres, debut).toString()}`;

      const reponse = await fetch(url, { headers: { Authorization: `Bearer ${jeton}` } });

      if (reponse.status === 204) {
        break;
      }

      if (!reponse.ok && reponse.status !== 206) {
        const detail = await reponse.text();
        this.logger.error(`Recherche refusee (${reponse.status}) : ${detail.slice(0, 200)}`);
        throw new ServiceUnavailableException(`L'API France Travail a repondu ${reponse.status}`);
      }

      const corps = (await reponse.json()) as { resultats?: OffreBrute[] };
      const page = corps.resultats ?? [];

      offres.push(...page);
      this.logger.log(`Page ${debut}-${debut + page.length - 1} : ${page.length} offres`);

      // Page incomplete : il n'y a plus rien apres.
      if (page.length < PAGE) {
        break;
      }

      debut += PAGE;
    }

    return offres.slice(0, plafond);
  }
}
