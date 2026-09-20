import { Injectable, Logger } from '@nestjs/common';
import type { CompetenceResume, CompetencesQuery, RapportCompetences } from '@releve/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ROMES_SECTEUR } from '../donnees-publiques/offres.service';
import { agreger, cleCompetence, ecrire } from './agregation';

@Injectable()
export class CompetencesService {
  private readonly logger = new Logger(CompetencesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Reconstruit le referentiel depuis les offres actives.
   *
   * Reconstruction complete et non incrementale, a dessein. Le referentiel est
   * une photographie du marche : une competence qui n'est plus demandee doit
   * voir ses occurrences tomber, ce qu'un cumul ne ferait jamais. Le cout est
   * negligeable — quelques milliers d'offres, une seule passe — et l'operation
   * est idempotente, donc rejouable sans precaution.
   *
   * Le calcul lui-meme vit dans `agregation.ts`, hors de Nest : le seed doit
   * produire exactement le meme referentiel, et il tourne avec un
   * `PrismaClient` nu. Deux implementations divergeraient.
   */
  async reconstruire(): Promise<RapportCompetences> {
    const offres = await this.prisma.offreCollectee.findMany({
      where: { statut: 'ACTIVE', romeCode: { in: [...ROMES_SECTEUR] } },
      select: {
        romeCode: true,
        intitule: true,
        description: true,
        qualificationLibelle: true,
        competences: true,
      },
    });

    const rapport = await ecrire(this.prisma, agreger(offres), offres.length);

    this.logger.log(
      `Referentiel reconstruit : ${rapport.competences} competences, ` +
        `${rapport.rattachements} rattachements, ${rapport.nouvelles} nouvelles, ` +
        `${rapport.retombeesAZero} retombees a zero`,
    );

    return rapport;
  }

  /**
   * Liste les competences, classees par ce que le marche demande le plus.
   *
   * Le classement par occurrences est ce qui distingue cette liste d'un menu
   * deroulant. Un etablissement qui depose un besoin voit d'abord ce que les
   * autres EHPAD exigent reellement sur ce metier — l'ordre porte autant
   * d'information que le contenu.
   */
  async lister(query: CompetencesQuery): Promise<CompetenceResume[]> {
    // Sans metier, on somme sur tous : c'est le mode de la recherche par
    // mots-cles, ou l'on cherche une competence et non un classement.
    const filtreMetier = query.rome ? { romeCode: query.rome } : {};

    const lignes = await this.prisma.competence.findMany({
      where: {
        ...(query.rome ? { metiers: { some: { romeCode: query.rome } } } : {}),
        ...(query.recherche ? { cle: { contains: cleCompetence(query.recherche) } } : {}),
      },
      select: {
        id: true,
        libelle: true,
        code: true,
        metiers: { where: filtreMetier, select: { occurrences: true } },
      },
    });

    return (
      lignes
        .map((ligne) => ({
          id: ligne.id,
          libelle: ligne.libelle,
          code: ligne.code,
          occurrences: ligne.metiers.reduce((total, metier) => total + metier.occurrences, 0),
        }))
        // Le tri est fait ici et non en base : `occurrences` est une somme sur
        // les metiers retenus, que la requete ne connait pas. Le referentiel
        // compte quelques centaines de lignes, la difference n'est pas mesurable.
        .sort((a, b) => b.occurrences - a.occurrences || a.libelle.localeCompare(b.libelle, 'fr'))
        .slice(0, query.limite)
    );
  }

  /**
   * Verifie que des identifiants designent bien des competences du referentiel.
   *
   * Rendu sous forme d'ensemble plutot que de booleen : l'appelant a besoin de
   * nommer ce qui manque, pas seulement de savoir que quelque chose manque.
   */
  async existantes(ids: string[]): Promise<Set<string>> {
    if (!ids.length) {
      return new Set();
    }

    const lignes = await this.prisma.competence.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });

    return new Set(lignes.map((ligne) => ligne.id));
  }
}
