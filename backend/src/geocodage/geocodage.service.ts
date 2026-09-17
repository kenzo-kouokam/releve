import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AdresseASituer, AdresseLocalisee } from '@releve/shared';
import { PrismaService } from '../prisma/prisma.service';
import { BanClient } from './ban.client';

/** Les deux tables qui portent une adresse a situer. */
type TableSituee = 'candidat' | 'lieu_intervention';

export interface RapportGeocodage {
  examines: number;
  situes: number;
  echecs: number;
}

/**
 * Le geocodage des adresses de la plateforme.
 *
 * Sans lui, tout le volet geographique du matching est inerte : `rayonKm`, la
 * porte « hors-rayon », la composante « zone » du bareme et le tri « a
 * proximite » lisent tous `latitude` / `longitude`, et un candidat qui s'inscrit
 * depuis le site public n'en a aucune. Il est ecarte de toutes les missions,
 * avec le motif « coordonnees manquantes » — ce qui est exact, mais ce n'est
 * pas sa faute.
 *
 * Deux principes gouvernent ce service :
 *
 *  1. **Il n'echoue jamais l'ecriture qu'il accompagne.** Une personne doit
 *     pouvoir corriger son adresse meme si la BAN est indisponible. Le
 *     geocodage se rejoue en lot (`releve geocoder`), l'enregistrement non.
 *  2. **Une adresse qui change et qu'on ne sait pas situer efface les anciennes
 *     coordonnees.** Garder le point du precedent domicile serait pire que de
 *     n'en avoir aucun : la distance resterait mesurable, donc credible, et
 *     fausse.
 */
@Injectable()
export class GeocodageService {
  private readonly logger = new Logger(GeocodageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ban: BanClient,
  ) {}

  estActif(): boolean {
    return this.ban.estActif();
  }

  /** Deux adresses designent-elles le meme point a chercher ? */
  static memeAdresse(a: AdresseASituer, b: AdresseASituer): boolean {
    const forme = (valeur: string): string => valeur.trim().toLowerCase().replace(/\s+/g, ' ');

    return (
      forme(a.adresse) === forme(b.adresse) &&
      a.codePostal.trim() === b.codePostal.trim() &&
      forme(a.ville) === forme(b.ville)
    );
  }

  /**
   * Situe une adresse et reporte le resultat sur la ligne.
   *
   * Rend le point trouve, ou null. L'appelant n'a rien a en faire dans le cas
   * courant : la ligne est deja a jour quand la promesse se resout.
   */
  async situer(
    table: TableSituee,
    id: string,
    adresse: AdresseASituer,
  ): Promise<AdresseLocalisee | null> {
    // Service coupe : on ne touche a rien. Effacer les coordonnees existantes
    // reviendrait a faire d'un interrupteur une suppression de donnees — une
    // suite d'integration ou un environnement hors reseau rendrait tout le
    // vivier non matchable, et il faudrait un geocodage complet pour s'en
    // remettre.
    if (!this.ban.estActif()) {
      return null;
    }

    const point = await this.ban.situer(adresse);

    await this.ecrire(table, id, point);

    if (!point) {
      this.logger.warn(
        `Adresse non situee (${table} ${id}) : ${adresse.codePostal} ${adresse.ville}`,
      );
    }

    return point;
  }

  /**
   * Ecrit — ou efface — les coordonnees.
   *
   * En SQL brut parce que `geom` est une colonne PostGIS, que le client Prisma
   * declare `Unsupported` et refuse donc d'ecrire. Tout passe par une seule
   * instruction : `latitude`, `longitude` et `geom` doivent bouger ensemble,
   * sans quoi un index spatial finirait par designer un autre endroit que les
   * deux colonnes lues par le bareme.
   */
  private async ecrire(
    table: TableSituee,
    id: string,
    point: AdresseLocalisee | null,
  ): Promise<void> {
    const nom = Prisma.raw(`"${table}"`);

    try {
      if (!point) {
        await this.prisma.$executeRaw`
          UPDATE ${nom}
             SET latitude = NULL,
                 longitude = NULL,
                 geom = NULL,
                 "geocodeLe" = NULL,
                 "geocodePrecision" = NULL
           WHERE id = ${id}::uuid
        `;

        return;
      }

      await this.prisma.$executeRaw`
        UPDATE ${nom}
           SET latitude = ${point.latitude},
               longitude = ${point.longitude},
               geom = ST_SetSRID(ST_MakePoint(${point.longitude}, ${point.latitude}), 4326)::geography,
               "geocodeLe" = now(),
               "geocodePrecision" = ${point.precision}::"PrecisionGeocodage"
         WHERE id = ${id}::uuid
      `;
    } catch (cause) {
      // Une panne de geocodage ne doit pas faire echouer l'enregistrement
      // qu'elle accompagne : la fiche est deja ecrite, seule sa localisation
      // manque, et la commande de rattrapage la reprendra.
      this.logger.error(`Ecriture des coordonnees impossible (${table} ${id})`, cause as Error);
    }
  }

  /**
   * Reprend les fiches sans coordonnees.
   *
   * Sert au rattrapage de l'existant — toutes les fiches creees avant que ce
   * service n'existe — et aux adresses laissees de cote par une indisponibilite
   * de la BAN. Sequentiel et espace : le service est public, gratuit, et rien
   * ici n'est urgent au point de justifier de le marteler.
   */
  async rattraper(limite = 500, pauseMs = 50): Promise<RapportGeocodage> {
    const rapport: RapportGeocodage = { examines: 0, situes: 0, echecs: 0 };

    for (const table of ['candidat', 'lieu_intervention'] as const) {
      const lignes = await this.prisma.$queryRaw<
        { id: string; adresse: string; codePostal: string; ville: string }[]
      >`
        SELECT id, adresse, "codePostal", ville
          FROM ${Prisma.raw(`"${table}"`)}
         WHERE latitude IS NULL OR longitude IS NULL
         ORDER BY "createdAt"
         LIMIT ${limite}
      `;

      for (const ligne of lignes) {
        rapport.examines += 1;

        const point = await this.situer(table, ligne.id, ligne);

        if (point) {
          rapport.situes += 1;
        } else {
          rapport.echecs += 1;
        }

        if (pauseMs > 0) {
          await new Promise((suite) => setTimeout(suite, pauseMs));
        }
      }
    }

    return rapport;
  }
}
