import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MISSIONS_PAR_COURRIEL, type MissionAnnoncee, type RapportNotifications } from '@releve/shared';
import { PrismaService } from '../prisma/prisma.service';
import { MatchingService } from '../matching/matching.service';
import { MailService } from '../mail/mail.service';
import { courrielMissionsCorrespondantes } from '../mail/gabarits';

/**
 * Le courriel qui ramene un candidat sur la plateforme.
 *
 * Un dossier valide ne sert a rien si personne ne sait qu'une mission vient de
 * s'ouvrir. Ce balayage repond a ca : une fois par jour, il annonce a chacun
 * les missions publiees depuis son dernier message et pour lesquelles il est
 * eligible.
 *
 * Trois decisions valent d'etre nommees.
 *
 * **Un balayage, pas un declenchement a la publication.** Publier une mission
 * n'envoie rien. Sinon une agence qui depose huit besoins dans l'apres-midi
 * ferait huit courriels a la meme personne, et c'est ainsi qu'on se fait
 * classer en indesirable. Un message par jour au plus.
 *
 * **L'eligibilite, pas le score.** Le classement sert a ordonner ce qui reste,
 * mais ce qui decide de l'envoi est la porte d'eligibilite — le diplome verifie
 * et le rayon de deplacement. Annoncer une mission a quelqu'un dont la
 * candidature sera refusee d'office serait pire que de se taire.
 *
 * **La date de dernier envoi avance meme quand rien ne part.** Sans cela, une
 * personne sans mission correspondante serait reexaminee sur une fenetre qui
 * s'allonge indefiniment, et finirait par recevoir d'un coup des missions
 * vieilles de trois semaines.
 */
@Injectable()
export class NotificationsMissionsService {
  private readonly logger = new Logger(NotificationsMissionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly matching: MatchingService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  private get siteUrl(): string {
    return (this.config.get<string>('APP_URL') ?? 'http://localhost:3000').replace(/\/+$/, '');
  }

  async notifier(simulation: boolean): Promise<RapportNotifications> {
    /*
     * L'instant de reference, pris sur l'horloge du processus.
     *
     * Il est compare plus bas au `createdAt` des missions, que PostgreSQL pose
     * lui-meme : deux horloges, donc, et cela se remarque. Le remplacer par un
     * `SELECT now()` a ete essaye, et **c'est pire** — pour une raison qui ne
     * saute pas aux yeux. `now()` a une precision a la microseconde, la `Date`
     * de JavaScript s'arrete a la milliseconde : lire l'heure de la base puis
     * la reecrire par Prisma perd jusqu'a 999 microsecondes. La date de passage
     * retombe alors *avant* la creation d'une mission publiee dans la meme
     * milliseconde, et cette mission est reannoncee a chaque passage. Le test
     * « ne repete pas la meme mission au passage suivant » le prend a tous les
     * coups.
     *
     * Ce qui sauve la version actuelle n'est donc pas la chance : `new Date()`
     * est lu **apres** que les missions ont ete creees, et la troncature joue
     * dans le bon sens. L'ecart entre les deux horloges — mesure a 15 ms sur le
     * poste de developpement — reste couvert par le delai reel entre une
     * publication et le passage nocturne qui l'annonce.
     *
     * Le faire proprement supposerait de poser la date **en SQL**
     * (`SET "missionsNotifieesLe" = now()`), pour garder la pleine precision et
     * une seule horloge. C'est note dans les limites connues plutot que fait a
     * moitie.
     */
    const maintenant = new Date();

    // Seuls les candidats proposables : un dossier en verification ne peut pas
    // postuler, lui annoncer des missions serait lui montrer une porte fermee.
    const candidats = await this.prisma.candidat.findMany({
      where: {
        statut: 'ACTIF',
        utilisateur: { actif: true, notificationsEmail: true, emailVerifieLe: { not: null } },
      },
      select: {
        id: true,
        prenom: true,
        missionsNotifieesLe: true,
        utilisateur: { select: { email: true } },
      },
    });

    let avertis = 0;
    let missionsAnnoncees = 0;

    for (const candidat of candidats) {
      const correspondantes = await this.missionsPour(candidat.id, candidat.missionsNotifieesLe);

      if (correspondantes.length && !simulation) {
        await this.mail.envoyer(
          courrielMissionsCorrespondantes(
            candidat.utilisateur!.email,
            candidat.prenom,
            correspondantes,
            `${this.siteUrl}/missions`,
            (id) => `${this.siteUrl}/missions/${id}`,
          ),
        );
      }

      if (!simulation) {
        await this.prisma.candidat.update({
          where: { id: candidat.id },
          data: { missionsNotifieesLe: maintenant },
        });
      }

      if (correspondantes.length) {
        avertis += 1;
        missionsAnnoncees += correspondantes.length;
      }
    }

    this.logger.log(
      `Notifications missions : ${avertis} candidat(s) averti(s), ${missionsAnnoncees} mission(s)`,
    );

    return { examines: candidats.length, avertis, missions: missionsAnnoncees, simulation };
  }

  /**
   * Les missions a annoncer a une personne, les mieux classees d'abord.
   *
   * `depuis` est nul au premier passage — a la validation du dossier, la
   * plateforme pose la date, si bien qu'un nouveau venu n'herite pas de tout
   * l'historique des publications.
   */
  private async missionsPour(candidatId: string, depuis: Date | null): Promise<MissionAnnoncee[]> {
    const aujourdHui = new Date();
    aujourdHui.setHours(0, 0, 0, 0);

    const missions = await this.prisma.mission.findMany({
      where: {
        statut: 'PUBLIEE',
        // Une vacation dont la date est passee reste publiee tant que personne
        // n'a ete retenu ; elle n'a rien a faire dans une annonce.
        dateDebut: { gte: aujourdHui },
        ...(depuis ? { createdAt: { gt: depuis } } : {}),
        // Ne jamais reproposer une mission a qui a deja postule.
        propositions: { none: { candidatId } },
      },
      select: {
        id: true,
        dateDebut: true,
        heureDebut: true,
        heureFin: true,
        tauxHoraire: true,
        client: { select: { raisonSociale: true } },
        lieu: { select: { libelle: true, ville: true } },
      },
    });

    const retenues: MissionAnnoncee[] = [];

    for (const mission of missions) {
      const evaluation = await this.matching.evaluer(mission.id, candidatId);

      // Un seul motif d'exclusion suffit a taire la mission : la candidature
      // serait refusee par la meme regle, cote serveur.
      if (!evaluation || evaluation.motifs.length) {
        continue;
      }

      retenues.push({
        id: mission.id,
        client: mission.client.raisonSociale,
        lieu: `${mission.lieu.libelle} · ${mission.lieu.ville}`,
        dateDebut: mission.dateDebut.toISOString(),
        heureDebut: mission.heureDebut,
        heureFin: mission.heureFin,
        tauxHoraire: mission.tauxHoraire === null ? null : Number(mission.tauxHoraire),
        score: evaluation.score.total,
      });
    }

    return retenues
      .sort((a, b) => b.score - a.score || a.dateDebut.localeCompare(b.dateDebut))
      .slice(0, MISSIONS_PAR_COURRIEL);
  }
}
