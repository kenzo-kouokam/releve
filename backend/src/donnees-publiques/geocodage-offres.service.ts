import { Injectable, Logger } from '@nestjs/common';
import { StatutOffreCollectee } from '@prisma/client';
import { BanClient } from '../geocodage/ban.client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Pause entre deux appels a la Base Adresse Nationale.
 *
 * Meme valeur que le rattrapage des fiches candidats, et pour la meme raison :
 * le service est public, gratuit et sans cle. Rien ici n'est urgent au point de
 * justifier de le marteler.
 */
const PAUSE_MS = 50;

/**
 * Communes situees en une passe.
 *
 * Le rattrapage initial en demande un millier ; les balayages suivants n'en
 * amenent que quelques-unes, celles ou une agence vient de publier pour la
 * premiere fois. Le plafond evite qu'un import quotidien se transforme en
 * marathon si la liste explose.
 */
const COMMUNES_PAR_PASSE = 400;

export interface RapportGeocodageOffres {
  /** Communes distinctes qu'il restait a situer. */
  communesExaminees: number;
  communesSituees: number;
  communesIntrouvables: number;
  /** Offres qui ont recu des coordonnees a l'issue de la passe. */
  offresSituees: number;
}

/**
 * Situe les offres collectees a partir de leur commune.
 *
 * France Travail ne geolocalise qu'une annonce sur sept — 295 sur 2 020 lors
 * d'un import reel. Les autres portent pourtant leur commune et leur code
 * postal : il ne manque qu'une conversion, et c'est ce que fait ce service.
 *
 * Deux principes gouvernent tout le fichier.
 *
 * On geocode des communes, jamais des offres. Mille sept cents annonces sans
 * coordonnees ne representent que mille quarante couples code postal / commune
 * distincts : situer la commune une fois sert toutes ses offres, aujourd'hui et
 * aux imports suivants. Appeler la BAN offre par offre recalculerait sans cesse
 * les memes points.
 *
 * Et une coordonnee deduite ne se fait jamais passer pour une coordonnee de la
 * source. `origineCoordonnees` distingue les deux, pour que l'affichage puisse
 * ecrire « environ 12 km » la ou le point n'est que le centre d'une commune.
 */
@Injectable()
export class GeocodageOffresService {
  private readonly logger = new Logger(GeocodageOffresService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ban: BanClient,
  ) {}

  /**
   * Situe les communes encore inconnues, puis reporte les points sur les offres.
   *
   * Les deux etapes sont separees a dessein : la seconde s'execute meme quand
   * la premiere n'a rien eu a faire, ce qui permet a un import de situer
   * des offres nouvelles sur des communes deja connues sans rappeler la BAN.
   */
  async rattraper(plafond = COMMUNES_PAR_PASSE): Promise<RapportGeocodageOffres> {
    const rapport: RapportGeocodageOffres = {
      communesExaminees: 0,
      communesSituees: 0,
      communesIntrouvables: 0,
      offresSituees: 0,
    };

    if (this.ban.estActif()) {
      const aSituer = await this.communesASituer(plafond);

      rapport.communesExaminees = aSituer.length;

      for (const commune of aSituer) {
        // La BAN cherche une commune quand on ne lui donne pas de rue : le code
        // postal et le nom suffisent, et le client verifie lui-meme que le code
        // postal rendu correspond a celui demande.
        const point = await this.ban.situer({
          adresse: '',
          codePostal: commune.codePostal,
          ville: commune.nom,
        });

        await this.prisma.communeGeocodee.upsert({
          where: { codePostal_nom: { codePostal: commune.codePostal, nom: commune.nom } },
          update: {
            latitude: point?.latitude ?? null,
            longitude: point?.longitude ?? null,
            introuvable: !point,
            situeeLe: new Date(),
          },
          create: {
            codePostal: commune.codePostal,
            nom: commune.nom,
            latitude: point?.latitude ?? null,
            longitude: point?.longitude ?? null,
            introuvable: !point,
          },
        });

        if (point) {
          rapport.communesSituees += 1;
        } else {
          rapport.communesIntrouvables += 1;
        }

        if (PAUSE_MS > 0) {
          await new Promise((suite) => setTimeout(suite, PAUSE_MS));
        }
      }
    }

    rapport.offresSituees = await this.reporterSurLesOffres();

    this.logger.log(
      `Geocodage offres : ${rapport.communesSituees} commune(s) situee(s), ` +
        `${rapport.communesIntrouvables} introuvable(s), ${rapport.offresSituees} offre(s) situee(s)`,
    );

    return rapport;
  }

  /**
   * Communes portees par des offres sans coordonnees, et pas encore tentees.
   *
   * Les communes deja marquees introuvables sont exclues : les retenter a
   * chaque import couterait des centaines d'appels pour le meme echec.
   */
  private async communesASituer(plafond: number): Promise<{ codePostal: string; nom: string }[]> {
    const lignes = await this.prisma.$queryRaw<{ codePostal: string; nom: string }[]>`
      SELECT DISTINCT o."codePostal", o."communeNom" AS "nom"
        FROM "offre_collectee" o
        LEFT JOIN "commune_geocodee" c
               ON c."codePostal" = o."codePostal" AND c."nom" = o."communeNom"
       WHERE o."statut" = 'ACTIVE'
         AND o."latitude" IS NULL
         AND o."codePostal" IS NOT NULL
         AND o."communeNom" IS NOT NULL
         AND c."codePostal" IS NULL
       LIMIT ${plafond}
    `;

    return lignes;
  }

  /**
   * Reporte les coordonnees des communes sur les offres qui en manquent.
   *
   * En SQL plutot qu'en boucle : c'est une jointure sur deux colonnes, et la
   * faire ligne par ligne depuis Node ferait des milliers d'allers-retours pour
   * un travail que la base fait d'un seul coup.
   */
  private async reporterSurLesOffres(): Promise<number> {
    return this.prisma.$executeRaw`
      UPDATE "offre_collectee" o
         SET "latitude" = c."latitude",
             "longitude" = c."longitude",
             "origineCoordonnees" = 'COMMUNE'::"OrigineCoordonnees"
        FROM "commune_geocodee" c
       WHERE c."codePostal" = o."codePostal"
         AND c."nom" = o."communeNom"
         AND c."latitude" IS NOT NULL
         AND o."latitude" IS NULL
    `;
  }

  /**
   * Compte ce qui reste a faire, pour le journal d'import et la CLI.
   *
   * Sert surtout a rendre visible une derive : si le nombre d'offres non
   * situees remonte import apres import, c'est que la BAN ne repond plus ou que
   * la source a change la forme de ses lieux.
   */
  async couverture(): Promise<{ total: number; situees: number; part: number }> {
    const total = await this.prisma.offreCollectee.count({
      where: { statut: StatutOffreCollectee.ACTIVE },
    });
    const situees = await this.prisma.offreCollectee.count({
      where: { statut: StatutOffreCollectee.ACTIVE, latitude: { not: null } },
    });

    return { total, situees, part: total ? Math.round((situees / total) * 100) : 0 };
  }
}
