import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { FranceTravailClient } from './france-travail.client';
import { GeocodageOffresService } from './geocodage-offres.service';
import { OffresService, ROMES_SECTEUR } from './offres.service';

/**
 * Plafond de rapatriement du balayage planifie.
 *
 * Il faut qu'il depasse largement le catalogue reel, sinon le balayage est
 * tronque et l'expiration des offres disparues se bloque d'elle-meme. Le
 * secteur pese environ deux mille quatre cents offres d'interim ; l'API refuse
 * de toute facon d'aller au-dela du rang 3000.
 */
const PLAFOND_BALAYAGE = 3000;

/**
 * Fenetre de collecte, en jours.
 *
 * Plus large que les trente jours du barometre : une offre publiee il y a six
 * semaines et toujours en ligne est toujours une offre a afficher. Trop large,
 * en revanche, et le balayage depasse le rang maximal de l'API.
 */
const JOURS_COLLECTE = 60;

/**
 * Import automatique des offres publiques.
 *
 * La licence de reutilisation de la base d'offres France Travail impose
 * d'interroger l'API au moins toutes les vingt-quatre heures, pour que les
 * creations, modifications et suppressions se repercutent ici. Deux passages
 * par jour laissent donc de la marge si l'un echoue.
 *
 * Les heures sont choisies creuses : l'import ecrit quelques milliers de lignes
 * et invalide le cache du barometre, autant que ca ne tombe pas au milieu d'une
 * journee de travail de l'agence.
 */
@Injectable()
export class ImportPlanifieService {
  private readonly logger = new Logger(ImportPlanifieService.name);

  /**
   * Garde-fou contre le recouvrement. Un balayage complet dure plusieurs
   * minutes ; si le precedent n'est pas fini, deux imports concurrents se
   * disputeraient les memes lignes et fausseraient la detection des
   * disparitions — chacun expirant ce que l'autre n'a pas encore revu.
   */
  private enCours = false;

  constructor(
    private readonly config: ConfigService,
    private readonly client: FranceTravailClient,
    private readonly offres: OffresService,
    private readonly geocodage: GeocodageOffresService,
  ) {}

  /**
   * L'import ne tourne que la ou on le demande explicitement.
   *
   * Sans ce verrou, chaque poste de developpement taperait l'API deux fois par
   * jour et ecrirait dans sa base locale — du quota consomme pour rien, et des
   * imports concurrents partant de plusieurs machines vers la meme base de
   * recette.
   */
  private actif(): boolean {
    return this.config.get<string>('IMPORT_OFFRES_AUTOMATIQUE') === 'true';
  }

  @Cron(CronExpression.EVERY_DAY_AT_5AM, { name: 'import-offres-matin' })
  async balayageMatin(): Promise<void> {
    await this.balayer('matin');
  }

  @Cron(CronExpression.EVERY_DAY_AT_1PM, { name: 'import-offres-midi' })
  async balayageMidi(): Promise<void> {
    await this.balayer('midi');
  }

  private async balayer(moment: string): Promise<void> {
    if (!this.actif()) {
      return;
    }

    if (!this.client.estConfigure()) {
      this.logger.warn(
        `Balayage ${moment} ignore : identifiants France Travail absents. ` +
          'Les offres affichees vont vieillir sans que rien ne le signale.',
      );
      return;
    }

    if (this.enCours) {
      this.logger.warn(`Balayage ${moment} ignore : le precedent n'est pas termine.`);
      return;
    }

    this.enCours = true;
    const debut = Date.now();

    try {
      const rapport = await this.offres.importerDepuisApi(
        {
          romes: [...ROMES_SECTEUR],
          jours: JOURS_COLLECTE,
          max: PLAFOND_BALAYAGE,
        },
        false,
        // Balayage complet : c'est ce qui autorise l'expiration des offres
        // disparues, sous reserve du seuil verifie dans le service.
        true,
      );

      // Situer les communes nouvelles dans la foulee, et pas plus tard : une
      // offre sans coordonnees est invisible du rapprochement candidat, et la
      // laisser attendre le balayage suivant la ferait rater sa fenetre utile.
      const geocodage = await this.geocodage.rattraper();
      const couverture = await this.geocodage.couverture();

      this.logger.log(
        `Balayage ${moment} termine en ${Math.round((Date.now() - debut) / 1000)} s : ` +
          `${rapport.enregistrees} offres a jour, ${rapport.expirees} retirees, ` +
          `${geocodage.communesSituees} commune(s) situee(s). ` +
          `Couverture geographique : ${couverture.part} %.`,
      );
    } catch (erreur) {
      // Avalee volontairement : une API indisponible ne doit pas faire tomber
      // l'application. Le prochain passage reessaiera, et les offres deja en
      // base restent affichees en attendant.
      this.logger.error(
        `Balayage ${moment} echoue : ${erreur instanceof Error ? erreur.message : erreur}`,
      );
    } finally {
      this.enCours = false;
    }
  }
}
