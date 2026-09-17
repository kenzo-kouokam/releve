import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AdresseASituer, AdresseLocalisee, PrecisionGeocodage } from '@releve/shared';

/**
 * Base Adresse Nationale, service de recherche.
 *
 * Choisie plutot qu'un geocodeur commercial pour trois raisons qui tiennent
 * toutes au contexte : c'est le referentiel officiel francais, il est gratuit
 * et sans cle — donc rien a renouveler ni a facturer —, et surtout les donnees
 * ne quittent pas le pays. Une adresse de domicile est une donnee personnelle ;
 * l'envoyer chez un tiers hors UE ajouterait un sous-traitant au registre pour
 * un resultat moins bon sur la France.
 */
const URL_PAR_DEFAUT = 'https://api-adresse.data.gouv.fr/search/';

/**
 * Au-dela, la personne attend devant un formulaire qui ne rend pas la main. Le
 * geocodage n'est jamais bloquant : mieux vaut abandonner et reessayer en lot.
 */
const DELAI_MS = 5_000;

/**
 * En dessous, la BAN reconnait n'avoir rien trouve de convaincant et rend le
 * resultat le moins mauvais. Le retenir placerait un candidat a un endroit ou
 * il n'habite pas, ce qui est pire que de ne pas le placer du tout : une fiche
 * sans coordonnees est ecartee *en le disant*, une fiche mal placee remonte en
 * tete d'un classement sans que personne ne s'en apercoive.
 */
const CONFIANCE_MINIMALE = 0.4;

/** Les types de resultat de la BAN, traduits dans le vocabulaire du domaine. */
const PRECISIONS: Record<string, PrecisionGeocodage> = {
  housenumber: 'NUMERO',
  street: 'RUE',
  locality: 'LIEU_DIT',
  municipality: 'COMMUNE',
};

interface TraitBan {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    label?: string;
    score?: number;
    type?: string;
    postcode?: string;
  };
}

export interface ReponseBan {
  features?: TraitBan[];
}

/**
 * Lecture d'une reponse BAN, sans reseau ni Nest.
 *
 * Isolee pour la meme raison que le nettoyage des offres : les regles de rejet
 * se testent sur un objet ecrit a la main, pas sur un appel HTTP qui passerait
 * ou non selon la disponibilite d'un service public.
 */
export function lireReponseBan(
  corps: ReponseBan,
  codePostalAttendu?: string,
): AdresseLocalisee | null {
  const trait = corps.features?.[0];
  const coordonnees = trait?.geometry?.coordinates;

  if (!trait || !coordonnees || coordonnees.length < 2) {
    return null;
  }

  const confiance = trait.properties?.score ?? 0;

  if (confiance < CONFIANCE_MINIMALE) {
    return null;
  }

  const precision = PRECISIONS[trait.properties?.type ?? ''];

  if (!precision) {
    return null;
  }

  // La BAN repond volontiers sur une commune homonyme a l'autre bout du pays
  // quand la rue est mal orthographiee. Le code postal est la seule partie de
  // la saisie qu'on peut confronter au resultat : s'ils divergent, c'est que la
  // recherche a glisse vers une autre ville, et le point ne vaut rien.
  const codePostalTrouve = trait.properties?.postcode;

  if (codePostalAttendu && codePostalTrouve && codePostalTrouve !== codePostalAttendu) {
    return null;
  }

  // GeoJSON ordonne en longitude puis latitude. L'inversion est l'erreur
  // classique du geocodage, et elle est silencieuse : le point tombe dans
  // l'ocean Indien sans qu'aucun type ne proteste.
  const [longitude, latitude] = coordonnees;

  return {
    latitude,
    longitude,
    precision,
    libelle: trait.properties?.label ?? '',
    confiance,
  };
}

/**
 * Acces au service de recherche de la BAN.
 *
 * Ce client ne fait qu'interroger et lire. Aucune ecriture en base, aucune
 * decision sur ce qu'il faut faire d'un echec : c'est le service appelant qui
 * tranche, et c'est ce qui permet de le rejouer en lot depuis la CLI.
 */
@Injectable()
export class BanClient {
  private readonly logger = new Logger(BanClient.name);

  constructor(private readonly config: ConfigService) {}

  /**
   * Interrupteur, pour les suites d'integration et les environnements coupes du
   * reseau. Sans lui, chaque test qui enregistre une fiche appellerait un
   * service public : les tests deviendraient lents, intermittents, et
   * impolis.
   */
  estActif(): boolean {
    return this.config.get<string>('GEOCODAGE_ACTIF') !== 'false';
  }

  async situer(adresse: AdresseASituer): Promise<AdresseLocalisee | null> {
    if (!this.estActif()) {
      return null;
    }

    const base = this.config.get<string>('BAN_URL') ?? URL_PAR_DEFAUT;

    const parametres = new URLSearchParams({
      q: `${adresse.adresse} ${adresse.ville}`.trim(),
      // Le code postal est passe en filtre plutot que dans la requete libre :
      // la BAN s'en sert pour restreindre, au lieu de le traiter comme un mot
      // de plus a faire correspondre.
      postcode: adresse.codePostal,
      limit: '1',
      autocomplete: '0',
    });

    let reponse: Response;

    try {
      reponse = await fetch(`${base}?${parametres.toString()}`, {
        signal: AbortSignal.timeout(DELAI_MS),
        headers: { Accept: 'application/json' },
      });
    } catch (cause) {
      this.logger.warn(`BAN injoignable : ${(cause as Error).message}`);

      return null;
    }

    if (!reponse.ok) {
      this.logger.warn(`BAN a repondu ${reponse.status} pour ${adresse.codePostal}`);

      return null;
    }

    try {
      return lireReponseBan((await reponse.json()) as ReponseBan, adresse.codePostal);
    } catch (cause) {
      this.logger.warn(`Reponse BAN illisible : ${(cause as Error).message}`);

      return null;
    }
  }
}
