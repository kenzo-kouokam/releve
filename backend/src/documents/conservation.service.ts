import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  DELAI_REPONSE_JOURS,
  DUREE_CONSERVATION_MOIS,
  TYPE_DOCUMENT_LIBELLES,
  type DecisionConservation,
  type DossierEnAttente,
  type RapportConservation,
  type TypeDocument,
} from '@releve/shared';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { JetonsUsageUniqueService } from '../auth/jetons-usage-unique.service';
import { lienCourriel } from '../auth/liens';
import { NotificationsCompteService } from '../mail/notifications-compte.service';
import { StockageService } from './stockage.service';
import { echeanceConservation, echeanceReponse } from './echeances';

/**
 * Le cycle de vie des pieces justificatives.
 *
 * Une piece deposee vit un an. Passe ce terme, la plateforme n'a plus de raison
 * de la garder sans le redemander : elle ecrit a la personne, qui repond en un
 * clic — je la garde, ou effacez-la. Sans reponse au bout de trente jours, la
 * piece est effacee. Le silence ne vaut pas accord, c'est tout le sujet.
 *
 * Rien ici ne se declenche tout seul : les deux balayages sont des commandes
 * (`pnpm cli conservation:relancer` et `conservation:purger`), appelees par
 * l'ordonnanceur. Une tache cachee dans le processus web s'executerait autant
 * de fois qu'il y a d'instances, et personne ne saurait quand elle a tourne.
 */
@Injectable()
export class ConservationService {
  private readonly logger = new Logger(ConservationService.name);

  /** Le lien de decision vit aussi longtemps que le delai de reponse. */
  private readonly dureeLienHeures = DELAI_REPONSE_JOURS * 24;

  constructor(
    private readonly prisma: PrismaService,
    private readonly stockage: StockageService,
    private readonly jetons: JetonsUsageUniqueService,
    private readonly notifications: NotificationsCompteService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Premier balayage : ecrire a qui a des pieces arrivees a terme.
   *
   * Un courriel par personne et non par piece. Recevoir cinq messages le meme
   * matin pour un meme dossier donnerait a la demande un air de panne, et la
   * reponse porte de toute facon sur l'ensemble.
   */
  async relancer(simulation: boolean): Promise<RapportConservation> {
    const echues = await this.prisma.documentCandidat.findMany({
      where: { conservationJusquAu: { lte: new Date() }, relanceEnvoyeeLe: null },
      select: { id: true, type: true, candidatId: true },
      orderBy: { conservationJusquAu: 'asc' },
    });

    const parDossier = new Map<string, { ids: string[]; types: TypeDocument[] }>();

    for (const piece of echues) {
      const dossier = parDossier.get(piece.candidatId) ?? { ids: [], types: [] };
      dossier.ids.push(piece.id);
      dossier.types.push(piece.type as TypeDocument);
      parDossier.set(piece.candidatId, dossier);
    }

    if (simulation) {
      return { dossiers: parDossier.size, pieces: echues.length, simulation: true };
    }

    let dossiersTraites = 0;
    let piecesTraitees = 0;

    for (const [candidatId, dossier] of parDossier) {
      const compte = await this.prisma.utilisateur.findFirst({
        where: { candidatId, actif: true },
        select: { id: true, email: true, candidat: { select: { prenom: true } } },
      });

      // Une fiche sans compte actif ne peut pas repondre : la relancer serait
      // sans effet, et marquer la piece comme relancee la ferait effacer trente
      // jours plus tard sans que personne n'ait rien recu. On la laisse donc en
      // etat, et le rapport ne la compte pas.
      if (!compte) {
        this.logger.warn(`Pieces echues sans compte actif pour le candidat ${candidatId}`);
        continue;
      }

      const relanceLe = new Date();
      const jeton = await this.jetons.emettre(
        compte.id,
        compte.email,
        'CONSERVATION_DOCUMENTS',
        this.dureeLienHeures,
      );

      await this.prisma.documentCandidat.updateMany({
        where: { id: { in: dossier.ids } },
        data: { relanceEnvoyeeLe: relanceLe },
      });

      await this.notifications.conservationDocuments({
        email: compte.email,
        prenom: compte.candidat?.prenom ?? null,
        pieces: dossier.types.map((type) => TYPE_DOCUMENT_LIBELLES[type]),
        effacementLe: echeanceReponse(relanceLe),
        lien: lienCourriel(this.config, 'conservation', jeton),
      });

      dossiersTraites += 1;
      piecesTraitees += dossier.ids.length;
    }

    this.logger.log(`Conservation : ${piecesTraitees} piece(s) relancee(s), ${dossiersTraites} dossier(s)`);

    return { dossiers: dossiersTraites, pieces: piecesTraitees, simulation: false };
  }

  /**
   * Second balayage : effacer ce qui est reste sans reponse.
   *
   * La ligne part avant le fichier, comme pour un retrait manuel : l'inverse
   * laisserait une piece que l'ecran annonce et que personne ne peut ouvrir.
   */
  async purgerSansReponse(simulation: boolean): Promise<RapportConservation> {
    const limite = new Date(Date.now() - DELAI_REPONSE_JOURS * 24 * 60 * 60 * 1000);

    const abandonnees = await this.prisma.documentCandidat.findMany({
      where: { relanceEnvoyeeLe: { lte: limite } },
      select: { id: true, candidatId: true, cheminStockage: true },
    });

    const dossiers = new Set(abandonnees.map((piece) => piece.candidatId)).size;

    if (simulation) {
      return { dossiers, pieces: abandonnees.length, simulation: true };
    }

    await this.effacer(abandonnees);
    this.logger.log(`Conservation : ${abandonnees.length} piece(s) effacee(s) faute de reponse`);

    return { dossiers, pieces: abandonnees.length, simulation: false };
  }

  /**
   * Ce que la page de decision montre avant de demander de trancher.
   *
   * Le jeton n'est pas consomme ici : ouvrir le courriel dans un client qui
   * precharge les liens brulerait sinon la decision de quelqu'un qui n'a encore
   * rien lu. Il ne l'est qu'a la reponse.
   */
  async dossierEnAttente(jeton: string): Promise<DossierEnAttente> {
    const compte = await this.resoudre(jeton);

    const pieces = await this.prisma.documentCandidat.findMany({
      where: { candidatId: compte.candidatId, relanceEnvoyeeLe: { not: null } },
      select: { type: true, relanceEnvoyeeLe: true },
      orderBy: { relanceEnvoyeeLe: 'asc' },
    });

    if (!pieces.length) {
      throw new NotFoundException('Aucune piece en attente de decision');
    }

    return {
      prenom: compte.prenom,
      pieces: pieces.map((piece) => TYPE_DOCUMENT_LIBELLES[piece.type as TypeDocument]),
      effacementLe: echeanceReponse(pieces[0]!.relanceEnvoyeeLe!).toISOString(),
    };
  }

  /**
   * La reponse de la personne.
   *
   * Le jeton est consomme d'abord : un lien ne sert qu'une fois, et deux clics
   * successifs sur « effacer » ne doivent pas pouvoir tomber l'un sur l'autre.
   */
  async repondre(jeton: string, decision: DecisionConservation): Promise<void> {
    const compte = await this.resoudre(jeton);
    const consomme = await this.jetons.consommer(jeton, 'CONSERVATION_DOCUMENTS');

    if (!consomme) {
      throw new NotFoundException('Lien expire ou deja utilise');
    }

    if (decision === 'CONSERVER') {
      await this.prisma.documentCandidat.updateMany({
        where: { candidatId: compte.candidatId, relanceEnvoyeeLe: { not: null } },
        data: { conservationJusquAu: echeanceConservation(), relanceEnvoyeeLe: null },
      });

      this.logger.log(`Conservation prolongee de ${DUREE_CONSERVATION_MOIS} mois : ${compte.email}`);

      return;
    }

    const aEffacer = await this.prisma.documentCandidat.findMany({
      where: { candidatId: compte.candidatId, relanceEnvoyeeLe: { not: null } },
      select: { id: true, cheminStockage: true },
    });

    await this.effacer(aEffacer);
    this.logger.log(`Effacement demande : ${aEffacer.length} piece(s) pour ${compte.email}`);
  }

  /**
   * Resout un jeton sans le consommer, et exige qu'il pende a une fiche
   * candidat : un compte d'agence n'a pas de dossier, et un lien qui aurait
   * change de main ne doit rien ouvrir.
   */
  private async resoudre(
    jeton: string,
  ): Promise<{ candidatId: string; email: string; prenom: string | null }> {
    const resolu = await this.jetons.resoudre(jeton, 'CONSERVATION_DOCUMENTS');

    if (!resolu) {
      throw new NotFoundException('Lien expire ou deja utilise');
    }

    const compte = await this.prisma.utilisateur.findUnique({
      where: { id: resolu.utilisateurId },
      select: { email: true, candidatId: true, candidat: { select: { prenom: true } } },
    });

    // Un compte d'agence n'a pas de dossier : le lien ne peut rien ouvrir.
    if (!compte?.candidatId) {
      throw new NotFoundException('Lien expire ou deja utilise');
    }

    return {
      candidatId: compte.candidatId,
      email: compte.email,
      prenom: compte.candidat?.prenom ?? null,
    };
  }

  /** Efface des lignes puis leurs binaires, dans cet ordre. */
  private async effacer(pieces: { id: string; cheminStockage: string }[]): Promise<void> {
    if (!pieces.length) {
      return;
    }

    await this.prisma.documentCandidat.deleteMany({
      where: { id: { in: pieces.map((piece) => piece.id) } },
    });

    for (const piece of pieces) {
      await this.stockage.effacer(piece.cheminStockage);
    }
  }
}
