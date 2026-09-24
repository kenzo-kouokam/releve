import { z } from 'zod';
import { MOTIF_DATE_ISO, MOTIF_HEURE } from './motifs';

const MINUTES_PAR_JOUR = 24 * 60;
const MINUTES_PAR_SEMAINE = 7 * MINUTES_PAR_JOUR;

export const JOURS_SEMAINE = [
  'lundi',
  'mardi',
  'mercredi',
  'jeudi',
  'vendredi',
  'samedi',
  'dimanche',
] as const;

export const disponibiliteSchema = z.object({
  /** 1 = lundi ... 7 = dimanche, comme ISO-8601. */
  jourSemaine: z.number().int().min(1).max(7),
  heureDebut: z.string().trim().regex(MOTIF_HEURE, 'Heure invalide (format 07:00)'),
  heureFin: z.string().trim().regex(MOTIF_HEURE, 'Heure invalide (format 07:00)'),
  recurrente: z.boolean().default(true),
  valideDu: z.string().trim().regex(MOTIF_DATE_ISO, 'Date invalide (format AAAA-MM-JJ)').optional(),
  valideAu: z.string().trim().regex(MOTIF_DATE_ISO, 'Date invalide (format AAAA-MM-JJ)').optional(),
});

export type Disponibilite = z.infer<typeof disponibiliteSchema>;

function enMinutes(heure: string): number {
  const [h, m] = heure.split(':');
  return Number(h) * 60 + Number(m);
}

/**
 * Intervalles absolus dans la semaine, en minutes depuis lundi 00:00.
 *
 * Un creneau dont la fin est anterieure au debut traverse minuit : c'est le cas
 * normal du travail de nuit en etablissement (20:00 - 07:00). Il devient alors
 * deux intervalles, et celui du dimanche soir repasse au lundi matin - d'ou le
 * modulo sur la semaine.
 */
function intervalles(creneau: Disponibilite): [number, number][] {
  const base = (creneau.jourSemaine - 1) * MINUTES_PAR_JOUR;
  const debut = base + enMinutes(creneau.heureDebut);
  const fin = base + enMinutes(creneau.heureFin);

  if (fin > debut) {
    return [[debut, fin]];
  }

  // Traverse minuit : jusqu'a la fin de la semaine, puis le reliquat au debut.
  const finAbsolue = fin + MINUTES_PAR_JOUR;

  return finAbsolue <= MINUTES_PAR_SEMAINE
    ? [[debut, finAbsolue]]
    : [
        [debut, MINUTES_PAR_SEMAINE],
        [0, finAbsolue - MINUTES_PAR_SEMAINE],
      ];
}

function seChevauchent(a: [number, number], b: [number, number]): boolean {
  return a[0] < b[1] && b[0] < a[1];
}

/**
 * Indices des creneaux qui se chevauchent.
 *
 * Deux disponibilites qui se recouvrent feraient compter deux fois le meme
 * interimaire sur la meme heure au moment du matching : c'est exactement le
 * genre de doublon le plus couteux ici : une intervenante promise deux fois.
 */
export function chevauchements(creneaux: Disponibilite[]): number[] {
  const fautifs = new Set<number>();

  const etendus = creneaux.map(intervalles);

  for (let i = 0; i < etendus.length; i += 1) {
    for (let j = i + 1; j < etendus.length; j += 1) {
      const collision = etendus[i]!.some((a) => etendus[j]!.some((b) => seChevauchent(a, b)));

      if (collision) {
        fautifs.add(i);
        fautifs.add(j);
      }
    }
  }

  return [...fautifs].sort((a, b) => a - b);
}

export const disponibilitesRemplaceSchema = z
  .object({
    disponibilites: z.array(disponibiliteSchema).max(50),
  })
  .superRefine((valeur, contexte) => {
    for (const [index, creneau] of valeur.disponibilites.entries()) {
      if (creneau.heureDebut === creneau.heureFin) {
        contexte.addIssue({
          code: 'custom',
          path: ['disponibilites', index, 'heureFin'],
          message: 'Le creneau est vide : heure de debut et de fin identiques',
        });
      }

      if (creneau.valideDu && creneau.valideAu && creneau.valideAu < creneau.valideDu) {
        contexte.addIssue({
          code: 'custom',
          path: ['disponibilites', index, 'valideAu'],
          message: 'La fin de validite precede le debut',
        });
      }
    }

    for (const index of chevauchements(valeur.disponibilites)) {
      contexte.addIssue({
        code: 'custom',
        path: ['disponibilites', index],
        message: 'Ce creneau en chevauche un autre',
      });
    }
  });

export type DisponibilitesRemplace = z.infer<typeof disponibilitesRemplaceSchema>;

export const indisponibiliteSchema = z
  .object({
    du: z.string().trim().regex(MOTIF_DATE_ISO, 'Date invalide (format AAAA-MM-JJ)'),
    au: z.string().trim().regex(MOTIF_DATE_ISO, 'Date invalide (format AAAA-MM-JJ)'),
    motif: z.string().trim().max(160).optional(),
  })
  .refine((valeur) => valeur.au >= valeur.du, {
    path: ['au'],
    message: 'La date de fin precede la date de debut',
  });

export type Indisponibilite = z.infer<typeof indisponibiliteSchema>;

export interface DisponibiliteResume extends Disponibilite {
  id: string;
}

export interface IndisponibiliteResume {
  id: string;
  du: string;
  au: string;
  motif: string | null;
}
