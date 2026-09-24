import type { PrismaClient } from '@prisma/client';
import type { RapportCompetences } from '@releve/shared';
import { LEXIQUE_METIER } from './lexique';

/**
 * Le coeur de la reconstruction du referentiel, sans Nest ni injection.
 *
 * Extrait du service pour une raison precise : le seed doit produire exactement
 * le meme referentiel que `pnpm cli competences`, et il tourne avec un
 * `PrismaClient` nu, hors du conteneur. Deux implementations divergeraient — la
 * base de demonstration finirait par ne plus ressembler a la base de
 * production, ce qui est le meilleur moyen de ne decouvrir un bug qu'apres la
 * demonstration.
 *
 * `PrismaService` etend `PrismaClient` : les deux appelants passent le meme
 * type, sans adaptateur.
 */

/**
 * Forme sous laquelle les competences structurees dorment dans
 * `offre_collectee`.
 *
 * Json plutot qu'une table fille au moment de l'import, parce que rien ne les
 * interrogeait alors. Ce module leur donne une existence interrogeable sans
 * rien recollecter — et decouvre au passage qu'elles sont presque toujours
 * absentes : voir `lexique.ts`.
 */
export interface CompetenceBrute {
  code?: string | null;
  libelle?: string | null;
  exigence?: string | null;
}

/** Ce qu'il faut d'une offre pour en tirer des competences. */
export interface OffreLue {
  romeCode: string | null;
  intitule: string;
  description: string | null;
  qualificationLibelle: string | null;
  competences: unknown;
}

/**
 * Cle de dedoublonnage d'une competence.
 *
 * Les employeurs ecrivent la meme chose de six facons : « Aide a la toilette »,
 * « aide à la toilette », « Aide  à  la toilette », « AIDE A LA TOILETTE ».
 * Compter ces lignes separement donnerait six competences rares la ou il y en a
 * une tres demandee — exactement l'inverse de ce que le referentiel doit dire.
 *
 * La normalisation est la meme que celle de `empreinteOffre` : minuscules, sans
 * accents, tout ce qui n'est ni lettre ni chiffre ramene a une espace. Elle est
 * volontairement brutale. Elle ne rapprochera jamais « aide a la toilette » de
 * « toilette du patient », et ce n'est pas son role : rapprocher des formules
 * differentes demanderait un modele de langue, et une erreur y serait invisible.
 *
 * C'est aussi la fonction qui prepare le texte des annonces avant la recherche
 * des variantes du lexique — les deux cotes de la comparaison doivent passer
 * par le meme filtre, sinon « Aide à la toilette » ne trouverait jamais
 * « aide a la toilette ».
 */
export function cleCompetence(libelle: string): string {
  return libelle
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Ce qu'on retient d'une competence pendant l'agregation, avant ecriture. */
export interface Agregat {
  /**
   * Libelle d'affichage. Fige des qu'il vient du lexique — c'est la forme
   * relue et correctement accentuee — et sinon choisi parmi les graphies
   * rencontrees dans les offres.
   */
  libelleImpose: string | null;
  graphies: Map<string, number>;
  code: string | null;
  /** Occurrences par code ROME. */
  parMetier: Map<string, number>;
}

export interface ResultatAgregation {
  agregats: Map<string, Agregat>;
  /** Mentions rencontrees, avant dedoublonnage entre offres. */
  mentions: number;
}

/**
 * Lit un lot d'offres et en tire des competences comptees par metier.
 *
 * Deux sources, dans la meme passe :
 *
 * 1. le champ `competences` de l'offre, quand la source le renseigne. Il est
 *    propre et deja normalise par France Travail, donc pris tel quel ;
 * 2. le lexique metier cherche dans le titre, la description et le libelle de
 *    qualification. C'est de la que vient l'essentiel du volume, parce que le
 *    premier champ est presque toujours vide — voir `lexique.ts` pour le detail
 *    de cette mesure et le raisonnement qu'elle impose.
 *
 * Une entree ne compte **qu'une fois par offre**, quel que soit le nombre de
 * variantes trouvees et le nombre de repetitions dans le texte. Sans cette
 * regle, une annonce bavarde qui repete « transmissions » quatre fois peserait
 * autant que quatre etablissements qui le demandent chacun une fois — et le
 * classement mesurerait le style redactionnel plutot que le marche.
 */
export function agreger(offres: readonly OffreLue[]): ResultatAgregation {
  const agregats = new Map<string, Agregat>();
  let mentions = 0;

  const compter = (
    cle: string,
    rome: string,
    libelleImpose: string | null,
    graphie: string,
    code: string | null,
  ) => {
    const agregat = agregats.get(cle) ?? {
      libelleImpose: null,
      graphies: new Map<string, number>(),
      code: null,
      parMetier: new Map<string, number>(),
    };

    agregat.libelleImpose ??= libelleImpose;
    agregat.graphies.set(graphie, (agregat.graphies.get(graphie) ?? 0) + 1);
    agregat.code ??= code;
    agregat.parMetier.set(rome, (agregat.parMetier.get(rome) ?? 0) + 1);

    agregats.set(cle, agregat);
    mentions += 1;
  };

  for (const offre of offres) {
    if (!offre.romeCode) {
      continue;
    }

    const rome = offre.romeCode;
    const structurees = (offre.competences ?? []) as CompetenceBrute[];

    // Les cles deja comptees pour cette offre : c'est ce Set qui porte la
    // regle « une fois par offre ».
    const vues = new Set<string>();

    // --- source 1 : le champ structure, quand il existe
    for (const brute of structurees) {
      const libelle = brute.libelle?.trim();
      const cle = libelle ? cleCompetence(libelle) : '';

      // Un libelle fait uniquement de ponctuation se normalise en chaine vide.
      // Le laisser passer creerait une ligne sans nom, impossible a cocher et
      // impossible a comprendre.
      if (!libelle || !cle || vues.has(cle)) {
        continue;
      }

      vues.add(cle);
      compter(cle, rome, null, libelle, brute.code?.trim() || null);
    }

    // --- source 2 : le lexique, cherche dans le texte libre
    const texte = cleCompetence(
      [
        offre.intitule,
        offre.description ?? '',
        offre.qualificationLibelle ?? '',
        ...structurees.map((brute) => brute.libelle ?? ''),
      ].join(' '),
    );

    for (const entree of LEXIQUE_METIER) {
      if (!entree.romes.includes(rome)) {
        continue;
      }

      const cle = cleCompetence(entree.libelle);

      if (vues.has(cle) || !entree.variantes.some((variante) => texte.includes(variante))) {
        continue;
      }

      vues.add(cle);
      compter(cle, rome, entree.libelle, entree.libelle, null);
    }
  }

  return { agregats, mentions };
}

/**
 * Ecrit le resultat de l'agregation.
 *
 * Rien n'est supprime. Une competence disparue du marche garde sa ligne, ses
 * rattachements vers les missions passees et vers les profils qui l'ont
 * declaree ; seules ses occurrences retombent a zero. Supprimer reecrirait
 * l'histoire : une mission de l'an dernier a bien exige cette competence-la.
 */
export async function ecrire(
  prisma: PrismaClient,
  resultat: ResultatAgregation,
  offresLues: number,
): Promise<RapportCompetences> {
  const passage = new Date();
  let nouvelles = 0;
  let rattachements = 0;

  for (const [cle, agregat] of resultat.agregats) {
    const libelle = agregat.libelleImpose ?? libelleDominant(agregat.graphies);

    const existante = await prisma.competence.findUnique({ where: { cle }, select: { id: true } });

    const competence = await prisma.competence.upsert({
      where: { cle },
      create: { cle, libelle, code: agregat.code, vueLe: passage },
      // Le libelle d'affichage est reecrit a chaque passage : la forme dominante
      // peut changer quand le marche renouvelle ses annonces, et c'est celle-la
      // qu'on veut montrer.
      update: { libelle, code: agregat.code, vueLe: passage },
      select: { id: true },
    });

    if (!existante) {
      nouvelles += 1;
    }

    for (const [rome, occurrences] of agregat.parMetier) {
      await prisma.competenceMetier.upsert({
        where: { competenceId_romeCode: { competenceId: competence.id, romeCode: rome } },
        create: { competenceId: competence.id, romeCode: rome, occurrences },
        update: { occurrences },
      });

      rattachements += 1;
    }
  }

  // Tout ce que ce passage n'a pas vu retombe a zero, sans disparaitre.
  const { count: retombeesAZero } = await prisma.competenceMetier.updateMany({
    where: { competence: { vueLe: { lt: passage } }, occurrences: { gt: 0 } },
    data: { occurrences: 0 },
  });

  return {
    offresLues,
    mentions: resultat.mentions,
    competences: resultat.agregats.size,
    rattachements,
    nouvelles,
    retombeesAZero,
  };
}

/**
 * Le libelle a afficher, parmi toutes les graphies rencontrees.
 *
 * La plus frequente l'emporte, et a egalite la premiere dans l'ordre
 * alphabetique — pour que deux executions sur les memes donnees rendent le meme
 * resultat. Sans ce departage, l'ordre de parcours d'une `Map` deciderait de ce
 * que lisent les utilisateurs, et le referentiel changerait sans raison d'un
 * import a l'autre.
 */
function libelleDominant(graphies: Map<string, number>): string {
  return [...graphies.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fr'))[0]![0];
}
