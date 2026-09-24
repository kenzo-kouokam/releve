/**
 * Mise en forme des missions.
 *
 * Les maquettes affichent des libelles deja rediges - « Aujourd'hui »,
 * « 4 heures », « 18,50 EUR/h ». L'API, elle, renvoie des donnees : une date
 * ISO, un nombre d'heures, un decimal. La traduction se fait ici, une fois,
 * plutot que dans chaque page - sinon deux ecrans finissent par arrondir le
 * meme taux differemment.
 */

const JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];

const MOIS = [
  'janv.',
  'fevr.',
  'mars',
  'avr.',
  'mai',
  'juin',
  'juil.',
  'aout',
  'sept.',
  'oct.',
  'nov.',
  'dec.',
];

/**
 * Le jour porte par une valeur ISO, dans le fuseau du navigateur.
 *
 * Deux formes arrivent ici et n'appellent pas le meme traitement. Une date
 * seule — « 2026-09-14 », une date de mission — n'a pas de fuseau : on la
 * decoupe et on pose minuit local, sinon `new Date()` la lirait en UTC et elle
 * reculerait d'un jour a l'ouest de Greenwich. Un horodatage complet —
 * « 2026-10-16T22:30:00.000Z », une echeance de conservation — designe au
 * contraire un instant, et c'est au fuseau de dire quel jour il tombe.
 *
 * Le decoupage applique a un horodatage rendait « 16T10:55:20.123Z » puis
 * `NaN`, donc une date invalide qui faisait tomber la page au rendu serveur.
 */
function jourLocal(dateIso: string): Date {
  if (dateIso.includes('T')) {
    return new Date(dateIso);
  }

  const [annee, mois, jour] = dateIso.split('-').map(Number);

  return new Date(annee ?? 1970, (mois ?? 1) - 1, jour ?? 1);
}

function minuitAujourdHui(): Date {
  const maintenant = new Date();
  maintenant.setHours(0, 0, 0, 0);

  return maintenant;
}

/** Ecart en jours entiers, pour distinguer aujourd'hui de demain. */
function ecartJours(dateIso: string): number {
  const millis = jourLocal(dateIso).getTime() - minuitAujourdHui().getTime();

  return Math.round(millis / (24 * 3600 * 1000));
}

/** Libelle court d'une carte de liste : « Aujourd'hui », « Sam. 19 sept. ». */
export function jourCourt(dateIso: string): string {
  const ecart = ecartJours(dateIso);

  if (ecart === 0) return "Aujourd'hui";
  if (ecart === 1) return 'Demain';
  if (ecart === -1) return 'Hier';

  const date = jourLocal(dateIso);
  const jour = JOURS[date.getDay()] ?? '';
  const capitalise = jour.charAt(0).toUpperCase() + jour.slice(1);

  return `${capitalise} ${date.getDate()} ${MOIS[date.getMonth()] ?? ''}`;
}

/** Libelle long d'une fiche : « lundi 14 septembre 2026 ». */
export function dateComplete(dateIso: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(jourLocal(dateIso));
}

export function horaires(heureDebut: string, heureFin: string): string {
  return `${heureDebut}-${heureFin}`;
}

/** « 7 heures », « 7 h 30 » : les minutes n'apparaissent que si elles existent. */
export function dureeLisible(heures: number): string {
  const entier = Math.floor(heures);
  const minutes = Math.round((heures - entier) * 60);

  if (minutes === 0) {
    return `${entier} heure${entier > 1 ? 's' : ''}`;
  }

  return `${entier} h ${String(minutes).padStart(2, '0')}`;
}

/** Virgule decimale et espace insecable avant l'unite, comme en typographie francaise. */
function montant(valeur: number): string {
  return valeur.toFixed(2).replace('.', ',');
}

export function tauxCourt(taux: number | null): string {
  return taux === null ? 'Taux a confirmer' : `${montant(taux)} €/h`;
}

export function remuneration(taux: number | null): string {
  return taux === null ? "Taux a confirmer avec l'agence" : `${montant(taux)} € brut / heure`;
}

/** Deux lettres pour une pastille : « Les Jardins d'Aurore » donne « LJ ». */
export function initiales(libelle: string): string {
  const mots = libelle
    .split(/[\s'-]+/)
    .filter((mot) => /[a-zA-ZÀ-ɏ]/.test(mot))
    .slice(0, 2);

  if (mots.length === 0) {
    return '?';
  }

  return mots.map((mot) => mot.charAt(0).toUpperCase()).join('');
}

/** Temps restant avant le debut : « 8 h 18 min », « 3 jours ». */
export function debutDans(dateIso: string, heureDebut: string): string {
  const [h, m] = heureDebut.split(':').map(Number);
  const debut = jourLocal(dateIso);
  debut.setHours(h ?? 0, m ?? 0, 0, 0);

  const minutes = Math.round((debut.getTime() - Date.now()) / 60000);

  if (minutes <= 0) return 'En cours';
  if (minutes < 60) return `${minutes} min`;

  const heures = Math.floor(minutes / 60);

  if (heures < 24) {
    return `${heures} h ${String(minutes % 60).padStart(2, '0')} min`;
  }

  const jours = Math.floor(heures / 24);

  return `${jours} jour${jours > 1 ? 's' : ''}`;
}

/**
 * Prenom lisible tire de l'adresse e-mail.
 *
 * Le modele ne porte pas le prenom sur le compte, seulement sur la fiche
 * candidat ou le contact client - deux allers-retours pour un mot d'accueil.
 * « sophie.marchand@example.org » donne donc « Sophie », ce qui est correct
 * dans l'immense majorite des cas et jamais choquant sinon.
 */
export function prenomAffiche(email: string | undefined): string {
  const local = (email ?? '').split('@')[0] ?? '';
  const premier = local.split(/[._+-]/)[0] ?? '';

  return premier ? premier.charAt(0).toUpperCase() + premier.slice(1) : '';
}
