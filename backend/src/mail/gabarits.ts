import type { MissionAnnoncee } from '@releve/shared';
import type { Courriel } from './mail.service';

/**
 * Les courriels transactionnels, en clair.
 *
 * Aucun moteur de gabarit : deux messages ne justifient pas une dependance de
 * plus, et un envoi lisible dans le code se relit sans lancer l'application.
 * Chaque message porte ses deux versions — une messagerie qui bloque le HTML ne
 * doit pas laisser la personne sans lien.
 */

/** Echappement minimal : rien de ce qui suit n'est saisi librement, mais le nom l'est. */
function echapper(valeur: string): string {
  return valeur
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const PIED = `Releve — mise a disposition de personnel soignant en EHPAD, hopital et clinique`;

function enveloppe(titre: string, corps: string): string {
  return `<!doctype html>
<html lang="fr">
<body style="margin:0;padding:24px;background:#f5f5f4;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#1c1917">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:32px">
    <h1 style="margin:0 0 20px;font-size:20px;font-weight:600">${echapper(titre)}</h1>
    ${corps}
    <p style="margin:32px 0 0;padding-top:16px;border-top:1px solid #e7e5e4;font-size:12px;color:#78716c">
      ${PIED}
    </p>
  </div>
</body>
</html>`;
}

/**
 * Confirmation d'adresse.
 *
 * Le lien complet est repete en clair sous le bouton : un client de messagerie
 * qui n'affiche pas le HTML laisserait sinon un bouton mort, et la personne ne
 * pourrait pas se connecter du tout — c'est le seul chemin d'acces.
 */
export function courrielVerification(
  destinataire: string,
  prenom: string | null,
  lien: string,
  heures: number,
): Courriel {
  const bonjour = prenom ? `Bonjour ${prenom},` : 'Bonjour,';
  const titre = 'Confirmez votre adresse e-mail';

  const texte = [
    bonjour,
    '',
    'Votre compte Releve est cree. Il reste a confirmer cette adresse pour y acceder :',
    '',
    lien,
    '',
    `Ce lien est valable ${heures} heures et ne fonctionne qu'une fois.`,
    "Si vous n'etes pas a l'origine de cette inscription, ignorez ce message : sans ce clic, le compte reste inaccessible.",
    '',
    PIED,
  ].join('\n');

  const html = enveloppe(
    titre,
    `<p style="margin:0 0 16px;line-height:1.6">${echapper(bonjour)}</p>
     <p style="margin:0 0 24px;line-height:1.6">
       Votre compte Releve est cree. Il reste a confirmer cette adresse pour y acceder.
     </p>
     <p style="margin:0 0 24px">
       <a href="${echapper(lien)}"
          style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600">
         Confirmer mon adresse
       </a>
     </p>
     <p style="margin:0 0 8px;font-size:13px;color:#57534e;line-height:1.6">
       Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br>
       <span style="word-break:break-all;color:#0f766e">${echapper(lien)}</span>
     </p>
     <p style="margin:24px 0 0;font-size:13px;color:#57534e;line-height:1.6">
       Ce lien est valable ${heures} heures et ne fonctionne qu'une fois.
       Si vous n'etes pas a l'origine de cette inscription, ignorez ce message :
       sans ce clic, le compte reste inaccessible.
     </p>`,
  );

  return { destinataire, sujet: `Releve — ${titre}`, texte, html };
}

/**
 * Avertissement apres un changement de mot de passe.
 *
 * C'est le seul message de la plateforme qui ne sert a rien quand tout va
 * bien. Sa valeur est entiere dans le cas contraire : quelqu'un qui prend un
 * compte commence par en changer le mot de passe, et sans cet avertissement le
 * proprietaire ne l'apprend qu'en se retrouvant dehors, sans savoir pourquoi ni
 * quand. Il est donc envoye meme — surtout — quand le changement est legitime.
 *
 * Il ne contient jamais le mot de passe, ni ancien ni nouveau : un courriel
 * traverse des serveurs qu'on ne maitrise pas et reste dans une boite pour
 * toujours.
 */
export function courrielMotDePasseChange(
  destinataire: string,
  prenom: string | null,
  origine: 'compte' | 'agence',
): Courriel {
  const bonjour = prenom ? `Bonjour ${prenom},` : 'Bonjour,';
  const titre =
    origine === 'agence'
      ? 'Votre mot de passe a ete reinitialise'
      : 'Votre mot de passe a ete modifie';

  const fait =
    origine === 'agence'
      ? 'Votre agence vient de reinitialiser le mot de passe de votre compte Releve. Le nouveau mot de passe vous est communique par elle, jamais par courriel.'
      : 'Le mot de passe de votre compte Releve vient d etre modifie.';

  const alerte =
    origine === 'agence'
      ? "Si vous n'avez rien demande, contactez votre agence : elle seule a pu faire cette operation."
      : "Si vous n'etes pas a l'origine de ce changement, contactez immediatement votre agence : votre compte est probablement compromis.";

  const texte = [
    bonjour,
    '',
    fait,
    'Toutes vos sessions ont ete fermees : il faut vous reconnecter sur chacun de vos appareils.',
    '',
    alerte,
    '',
    PIED,
  ].join('\n');

  const html = enveloppe(
    titre,
    `<p style="margin:0 0 16px;line-height:1.6">${echapper(bonjour)}</p>
     <p style="margin:0 0 16px;line-height:1.6">${echapper(fait)}</p>
     <p style="margin:0 0 24px;line-height:1.6">
       Toutes vos sessions ont ete fermees : il faut vous reconnecter sur chacun de vos appareils.
     </p>
     <p style="margin:0;padding:12px 14px;line-height:1.6;font-size:13px;background:#fef2f2;border-radius:8px">
       ${echapper(alerte)}
     </p>`,
  );

  return { destinataire, sujet: `Releve — ${titre}`, texte, html };
}

/**
 * Lien de reinitialisation du mot de passe.
 *
 * Le message est ecrit pour quelqu'un qui n'a peut-etre rien demande : c'est un
 * formulaire public, donc n'importe qui peut saisir l'adresse d'un tiers. D'ou
 * le rappel explicite qu'ignorer le courriel suffit — sans clic, rien ne change,
 * et l'ancien mot de passe continue de fonctionner.
 */
export function courrielReinitialisation(
  destinataire: string,
  prenom: string | null,
  lien: string,
  heures: number,
): Courriel {
  const bonjour = prenom ? `Bonjour ${prenom},` : 'Bonjour,';
  const titre = 'Reinitialiser votre mot de passe';
  const validite =
    heures <= 1 ? 'Ce lien est valable une heure' : `Ce lien est valable ${heures} heures`;

  const texte = [
    bonjour,
    '',
    'Une reinitialisation du mot de passe a ete demandee pour votre compte Releve.',
    'Pour en choisir un nouveau, ouvrez ce lien :',
    '',
    lien,
    '',
    `${validite} et ne fonctionne qu'une fois.`,
    "Si vous n'avez rien demande, ignorez ce message : sans ce clic, rien ne change et votre mot de passe actuel reste valable.",
    '',
    PIED,
  ].join('\n');

  const html = enveloppe(
    titre,
    `<p style="margin:0 0 16px;line-height:1.6">${echapper(bonjour)}</p>
     <p style="margin:0 0 24px;line-height:1.6">
       Une reinitialisation du mot de passe a ete demandee pour votre compte Releve.
       Pour en choisir un nouveau&nbsp;:
     </p>
     <p style="margin:0 0 24px">
       <a href="${echapper(lien)}"
          style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600">
         Choisir un nouveau mot de passe
       </a>
     </p>
     <p style="margin:0 0 8px;font-size:13px;color:#57534e;line-height:1.6">
       Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur&nbsp;:<br>
       <span style="word-break:break-all;color:#0f766e">${echapper(lien)}</span>
     </p>
     <p style="margin:24px 0 0;font-size:13px;color:#57534e;line-height:1.6">
       ${echapper(validite)} et ne fonctionne qu'une fois.
       Si vous n'avez rien demande, ignorez ce message : sans ce clic, rien ne change
       et votre mot de passe actuel reste valable.
     </p>`,
  );

  return { destinataire, sujet: `Releve — ${titre}`, texte, html };
}

/**
 * Fin de conservation des pieces justificatives.
 *
 * Ce message n'annonce pas une bonne nouvelle : sans reponse, les pieces
 * seront effacees. Il dit donc, dans cet ordre, ce qui est concerne, ce qui se
 * passe si la personne ne fait rien, et jusqu'a quand elle peut repondre. Un
 * seul lien, qui mene a une page ou elle choisit — plutot que deux liens dans
 * un courriel, ou le clic irreversible se trouverait a deux centimetres de
 * l'autre.
 */
export function courrielConservationDocuments(
  destinataire: string,
  prenom: string | null,
  pieces: string[],
  lien: string,
  effacementLe: string,
): Courriel {
  const bonjour = prenom ? `Bonjour ${prenom},` : 'Bonjour,';
  const titre = 'Vos pieces justificatives arrivent a un an';

  const texte = [
    bonjour,
    '',
    "Les pieces suivantes de votre dossier Releve ont ete deposees il y a un an :",
    '',
    ...pieces.map((piece) => `  - ${piece}`),
    '',
    'Souhaitez-vous que nous les conservions ? Repondez en ouvrant ce lien :',
    '',
    lien,
    '',
    `Sans reponse de votre part avant le ${effacementLe}, elles seront effacees.`,
    "Vous pourrez les redeposer a tout moment depuis votre profil ; nous ne gardons rien d'autre de ces fichiers.",
    '',
    PIED,
  ].join('\n');

  const liste = pieces
    .map(
      (piece) =>
        `<li style="margin:0 0 6px">${echapper(piece)}</li>`,
    )
    .join('');

  const html = enveloppe(
    titre,
    `<p style="margin:0 0 16px;line-height:1.6">${echapper(bonjour)}</p>
     <p style="margin:0 0 12px;line-height:1.6">
       Les pieces suivantes de votre dossier Releve ont ete deposees il y a un an&nbsp;:
     </p>
     <ul style="margin:0 0 24px;padding-left:20px;line-height:1.6">${liste}</ul>
     <p style="margin:0 0 24px;line-height:1.6">
       Souhaitez-vous que nous les conservions&nbsp;?
     </p>
     <p style="margin:0 0 24px">
       <a href="${echapper(lien)}"
          style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600">
         Repondre
       </a>
     </p>
     <p style="margin:0 0 8px;font-size:13px;color:#57534e;line-height:1.6">
       Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur&nbsp;:<br>
       <span style="word-break:break-all;color:#0f766e">${echapper(lien)}</span>
     </p>
     <p style="margin:24px 0 0;font-size:13px;color:#57534e;line-height:1.6">
       Sans reponse de votre part avant le ${echapper(effacementLe)}, ces pieces seront
       effacees. Vous pourrez les redeposer a tout moment depuis votre profil&nbsp;; nous
       ne gardons rien d'autre de ces fichiers.
     </p>`,
  );

  return { destinataire, sujet: `Releve — ${titre}`, texte, html };
}

/**
 * Message du formulaire de contact, relaye a l'agence.
 *
 * Deux precautions, parce que tout ici est saisi par un inconnu. Le corps est
 * echappe avant d'entrer dans le HTML — un nom contenant du balisage
 * s'afficherait sinon comme du balisage dans la boite de l'agence. Et
 * l'adresse saisie ne devient jamais l'expediteur : elle part en `replyTo`,
 * pose par l'appelant. Usurper l'expediteur ferait rejeter le message par
 * n'importe quel relais qui verifie SPF, et ouvrirait le site a l'envoi de
 * courrier au nom de n'importe qui.
 */
export function courrielContact(
  destinataire: string,
  demande: { prenom: string; nom: string; email: string; sujet: string; message: string },
): Courriel {
  const identite = `${demande.prenom} ${demande.nom}`.trim();
  const titre = `Message du site : ${demande.sujet}`;

  const texte = [
    `De     ${identite}`,
    `Adresse ${demande.email}`,
    `Sujet  ${demande.sujet}`,
    '',
    demande.message,
    '',
    'Repondre a ce courriel repond directement a la personne.',
    '',
    PIED,
  ].join('\n');

  const lignes = demande.message
    .split('\n')
    .map((ligne) => echapper(ligne))
    .join('<br>');

  const html = enveloppe(
    titre,
    `<table style="margin:0 0 20px;font-size:14px;line-height:1.6;border-collapse:collapse">
       <tr>
         <td style="padding:2px 16px 2px 0;color:#78716c">De</td>
         <td style="padding:2px 0;font-weight:600">${echapper(identite)}</td>
       </tr>
       <tr>
         <td style="padding:2px 16px 2px 0;color:#78716c">Adresse</td>
         <td style="padding:2px 0"><a href="mailto:${echapper(demande.email)}">${echapper(demande.email)}</a></td>
       </tr>
       <tr>
         <td style="padding:2px 16px 2px 0;color:#78716c">Sujet</td>
         <td style="padding:2px 0">${echapper(demande.sujet)}</td>
       </tr>
     </table>
     <div style="padding:16px 18px;background:#f5f5f4;border-radius:10px;line-height:1.65">${lignes}</div>
     <p style="margin:20px 0 0;font-size:13px;color:#57534e;line-height:1.6">
       Repondre a ce courriel repond directement a la personne.
     </p>`,
  );

  return { destinataire, sujet: `Releve — ${titre}`, texte, html, repondreA: demande.email };
}

/**
 * Le dossier vient d'etre valide par l'agence.
 *
 * Le moment compte : jusque-la, la personne voyait des missions sans pouvoir y
 * postuler, et l'ecran le lui disait sans qu'elle sache quand cela changerait.
 * Ce courriel est la reponse a cette attente, et il annonce la suite — a partir
 * de maintenant, les missions qui lui correspondent lui sont signalees.
 */
export function courrielDossierValide(
  destinataire: string,
  prenom: string | null,
  lien: string,
): Courriel {
  const bonjour = prenom ? `Bonjour ${prenom},` : 'Bonjour,';
  const titre = 'Votre dossier est validé';

  const texte = [
    bonjour,
    '',
    "L'agence a verifie votre dossier. Vous pouvez desormais postuler aux missions",
    'qui correspondent a vos diplomes, a votre secteur et a vos disponibilites.',
    '',
    lien,
    '',
    'Nous vous signalerons par courriel les nouvelles missions qui vous correspondent.',
    'Ce reglage se coupe a tout moment depuis « Mon compte ».',
    '',
    PIED,
  ].join('\n');

  const html = enveloppe(
    titre,
    `<p style="margin:0 0 16px;line-height:1.6">${echapper(bonjour)}</p>
     <p style="margin:0 0 24px;line-height:1.6">
       L'agence a verifie votre dossier. Vous pouvez desormais postuler aux missions qui
       correspondent a vos diplomes, a votre secteur et a vos disponibilites.
     </p>
     <p style="margin:0 0 24px">
       <a href="${echapper(lien)}"
          style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600">
         Voir les missions
       </a>
     </p>
     <p style="margin:24px 0 0;font-size:13px;color:#57534e;line-height:1.6">
       Nous vous signalerons par courriel les nouvelles missions qui vous correspondent.
       Ce reglage se coupe a tout moment depuis «&nbsp;Mon compte&nbsp;».
     </p>`,
  );

  return { destinataire, sujet: `Releve — ${titre}`, texte, html };
}

/**
 * Annonce a un etablissement que l'agence a lu son autorisation et active sa
 * fiche.
 *
 * C'est le pendant exact de `courrielDossierValide` cote candidat, et le
 * dernier maillon d'un parcours qui s'arretait sinon en silence : la structure
 * s'inscrivait, confirmait son adresse, puis n'entendait plus parler de rien
 * jusqu'a ce qu'elle rappelle pour demander ou en etait son dossier.
 *
 * Le message nomme la piece qui a ete lue. Ce n'est pas une formalite : c'est
 * ce qui distingue « votre compte fonctionne » de « nous avons verifie que vous
 * avez le droit d'accueillir », et l'etablissement doit pouvoir le classer.
 */
export function courrielEtablissementActive(
  destinataire: string,
  contactNom: string | null,
  raisonSociale: string,
  piece: string,
  lien: string,
): Courriel {
  const bonjour = contactNom ? `Bonjour ${contactNom},` : 'Bonjour,';
  const titre = 'Votre etablissement est active';

  const texte = [
    bonjour,
    '',
    `Nous avons verifie l'autorisation de ${raisonSociale} — ${piece} — et active sa fiche.`,
    'Vous pouvez desormais deposer vos besoins de remplacement :',
    '',
    lien,
    '',
    'Chaque besoin depose est rapproche des interimaires dont les diplomes ont deja',
    'ete controles par l agence. Vous recevez les profils retenus, vous tranchez.',
    '',
    PIED,
  ].join('\n');

  const html = enveloppe(
    titre,
    `<p style="margin:0 0 16px;line-height:1.6">${echapper(bonjour)}</p>
     <p style="margin:0 0 24px;line-height:1.6">
       Nous avons verifie l'autorisation de <strong>${echapper(raisonSociale)}</strong>
       — ${echapper(piece)} — et active sa fiche. Vous pouvez desormais deposer vos besoins de
       remplacement.
     </p>
     <p style="margin:0 0 24px">
       <a href="${echapper(lien)}"
          style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600">
         Deposer un besoin
       </a>
     </p>
     <p style="margin:24px 0 0;font-size:13px;color:#57534e;line-height:1.6">
       Chaque besoin depose est rapproche des interimaires dont les diplomes ont deja ete
       controles par l'agence. Vous recevez les profils retenus, vous tranchez.
     </p>`,
  );

  return { destinataire, sujet: `Releve — ${titre}`, texte, html };
}

/**
 * Les missions publiees depuis le dernier envoi qui correspondent au profil.
 *
 * Le courriel annonce, il ne decide pas : aucune candidature n'est envoyee
 * depuis la boite de reception. Chaque ligne mene a la fiche de la mission,
 * ou la personne lit les conditions completes avant de postuler.
 */
export function courrielMissionsCorrespondantes(
  destinataire: string,
  prenom: string | null,
  missions: MissionAnnoncee[],
  lienListe: string,
  lienMission: (id: string) => string,
): Courriel {
  const bonjour = prenom ? `Bonjour ${prenom},` : 'Bonjour,';
  const pluriel = missions.length > 1;
  const titre = pluriel
    ? `${missions.length} missions correspondent a votre profil`
    : 'Une mission correspond a votre profil';

  const ligneTexte = (mission: MissionAnnoncee): string =>
    [
      `  ${mission.client} — ${mission.lieu}`,
      `  ${jourLisible(mission.dateDebut)}, ${mission.heureDebut}-${mission.heureFin}` +
        (mission.tauxHoraire === null ? '' : ` — ${montantLisible(mission.tauxHoraire)} brut / heure`),
      `  ${lienMission(mission.id)}`,
    ].join('\n');

  const texte = [
    bonjour,
    '',
    pluriel
      ? `${missions.length} missions publiees depuis notre dernier message correspondent a votre profil :`
      : 'Une mission publiee depuis notre dernier message correspond a votre profil :',
    '',
    missions.map(ligneTexte).join('\n\n'),
    '',
    'Toutes vos missions : ' + lienListe,
    '',
    'Pour ne plus recevoir ces messages, decochez « Notifications par e-mail » dans « Mon compte ».',
    '',
    PIED,
  ].join('\n');

  const cartes = missions
    .map(
      (mission) => `
      <tr>
        <td style="padding:14px 16px;border:1px solid #e7e5e4;border-radius:10px">
          <div style="font-size:15px;font-weight:600">${echapper(mission.client)}</div>
          <div style="font-size:13px;color:#57534e;margin-top:2px">${echapper(mission.lieu)}</div>
          <div style="font-size:13px;color:#57534e;margin-top:8px">
            ${echapper(jourLisible(mission.dateDebut))},
            ${echapper(`${mission.heureDebut}-${mission.heureFin}`)}${
              mission.tauxHoraire === null
                ? ''
                : ` &middot; <strong>${echapper(montantLisible(mission.tauxHoraire))} brut / heure</strong>`
            }
          </div>
          <div style="margin-top:10px">
            <a href="${echapper(lienMission(mission.id))}" style="font-size:13px;font-weight:600;color:#0f766e">
              Voir la mission
            </a>
          </div>
        </td>
      </tr>
      <tr><td style="height:10px"></td></tr>`,
    )
    .join('');

  const html = enveloppe(
    titre,
    `<p style="margin:0 0 16px;line-height:1.6">${echapper(bonjour)}</p>
     <p style="margin:0 0 20px;line-height:1.6">
       ${
         pluriel
           ? `${missions.length} missions publiees depuis notre dernier message correspondent a votre profil&nbsp;:`
           : 'Une mission publiee depuis notre dernier message correspond a votre profil&nbsp;:'
       }
     </p>
     <table style="width:100%;border-collapse:collapse">${cartes}</table>
     <p style="margin:16px 0 0">
       <a href="${echapper(lienListe)}" style="font-size:14px;font-weight:600;color:#0f766e">
         Toutes vos missions
       </a>
     </p>
     <p style="margin:24px 0 0;font-size:13px;color:#57534e;line-height:1.6">
       Pour ne plus recevoir ces messages, decochez «&nbsp;Notifications par e-mail&nbsp;» dans
       «&nbsp;Mon compte&nbsp;».
     </p>`,
  );

  return { destinataire, sujet: `Releve — ${titre}`, texte, html };
}

/** « lundi 28 septembre », sans l'annee quand elle est evidente. */
function jourLisible(dateIso: string): string {
  return new Date(dateIso).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

function montantLisible(taux: number): string {
  return `${taux.toFixed(2).replace('.', ',')} €`;
}

/** Ce qu'un courriel d'alerte ou de cloture dit d'une mission. */
export interface MissionCourriel {
  reference: string;
  client: string;
  lieu: string;
  /** Date de debut au format ISO. */
  dateDebut: string;
  heureDebut: string;
  heureFin: string;
  tauxHoraire: number | null;
}

function ligneMission(mission: MissionCourriel): string {
  return (
    `  ${mission.client} — ${mission.lieu}\n` +
    `  ${jourLisible(mission.dateDebut)}, ${mission.heureDebut}-${mission.heureFin}` +
    (mission.tauxHoraire === null ? '' : ` — ${montantLisible(mission.tauxHoraire)} brut / heure`)
  );
}

function carteMission(mission: MissionCourriel): string {
  return `
    <table style="width:100%;border-collapse:collapse">
      <tr>
        <td style="padding:14px 16px;border:1px solid #e7e5e4;border-radius:10px">
          <div style="font-size:15px;font-weight:600">${echapper(mission.client)}</div>
          <div style="font-size:13px;color:#57534e;margin-top:2px">${echapper(mission.lieu)}</div>
          <div style="font-size:13px;color:#57534e;margin-top:8px">
            ${echapper(jourLisible(mission.dateDebut))},
            ${echapper(`${mission.heureDebut}-${mission.heureFin}`)}${
              mission.tauxHoraire === null
                ? ''
                : ` &middot; <strong>${echapper(montantLisible(mission.tauxHoraire))} brut / heure</strong>`
            }
          </div>
        </td>
      </tr>
    </table>`;
}

/**
 * Mission urgente : elle commence dans moins de deux jours.
 *
 * Message court et seul, contrairement au recapitulatif qui en liste cinq :
 * l'urgence ne se lit pas dans une liste. Il reste un courriel de service — la
 * preference « Notifications par e-mail » le coupe — et le dit, sinon la
 * personne ne saurait pas d'ou il sort ni comment l'arreter.
 */
export function courrielMissionUrgente(
  destinataire: string,
  prenom: string | null,
  mission: MissionCourriel,
  lienMission: string,
): Courriel {
  const bonjour = prenom ? `Bonjour ${prenom},` : 'Bonjour,';
  const titre = 'Une mission a pourvoir rapidement';

  const texte = [
    bonjour,
    '',
    'Une mission qui correspond a votre profil commence dans moins de 48 heures :',
    '',
    ligneMission(mission),
    '',
    'Y repondre : ' + lienMission,
    '',
    'Pour ne plus recevoir ces alertes, decochez « Notifications par e-mail » dans « Mon compte ».',
    '',
    PIED,
  ].join('\n');

  const html = enveloppe(
    titre,
    `<p style="margin:0 0 16px;line-height:1.6">${echapper(bonjour)}</p>
     <p style="margin:0 0 20px;line-height:1.6">
       Une mission qui correspond a votre profil commence dans <strong>moins de 48&nbsp;heures</strong>&nbsp;:
     </p>
     ${carteMission(mission)}
     <p style="margin:20px 0 0">
       <a href="${echapper(lienMission)}" style="display:inline-block;padding:10px 18px;background:#0f766e;color:#fff;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none">
         Voir la mission
       </a>
     </p>
     <p style="margin:24px 0 0;font-size:13px;color:#57534e;line-height:1.6">
       Pour ne plus recevoir ces alertes, decochez «&nbsp;Notifications par e-mail&nbsp;» dans
       «&nbsp;Mon compte&nbsp;».
     </p>`,
  );

  return { destinataire, sujet: `Releve — ${titre}`, texte, html };
}

/**
 * La candidature n'aboutira pas : la mission est pourvue, ou annulee.
 *
 * Envoye quelle que soit la preference de notification, et c'est voulu : ce
 * n'est pas un service rendu, c'est la suite de la demarche de la personne.
 * Se taire lui laisserait garder une date libre pour rien.
 */
export function courrielMissionCloturee(
  destinataire: string,
  prenom: string | null,
  mission: MissionCourriel,
  motif: 'pourvue' | 'annulee',
  lienListe: string,
): Courriel {
  const bonjour = prenom ? `Bonjour ${prenom},` : 'Bonjour,';
  const titre = motif === 'pourvue' ? 'Mission pourvue' : 'Mission annulee';

  const explication =
    motif === 'pourvue'
      ? 'La mission pour laquelle vous vous etiez porte candidat a ete pourvue par un autre profil.'
      : 'La mission pour laquelle vous vous etiez porte candidat a ete annulee.';

  const texte = [
    bonjour,
    '',
    explication,
    '',
    ligneMission(mission),
    '',
    'Votre disponibilite est a nouveau libre de notre cote. D autres missions vous attendent : ' +
      lienListe,
    '',
    PIED,
  ].join('\n');

  const html = enveloppe(
    titre,
    `<p style="margin:0 0 16px;line-height:1.6">${echapper(bonjour)}</p>
     <p style="margin:0 0 20px;line-height:1.6">${echapper(explication)}</p>
     ${carteMission(mission)}
     <p style="margin:20px 0 0;line-height:1.6">
       Votre disponibilite est a nouveau libre de notre cote.
     </p>
     <p style="margin:16px 0 0">
       <a href="${echapper(lienListe)}" style="font-size:14px;font-weight:600;color:#0f766e">
         Voir les missions ouvertes
       </a>
     </p>`,
  );

  return { destinataire, sujet: `Releve — ${titre}`, texte, html };
}

/**
 * Confirmation au candidat retenu.
 *
 * Transactionnel : il engage la personne sur un creneau, et porte la reference
 * de mission qu'elle citera en cas de question. La preference de notification
 * ne s'y applique pas — la couper reviendrait a laisser quelqu'un ignorer qu'il
 * travaille mardi.
 */
export function courrielConfirmationMission(
  destinataire: string,
  prenom: string | null,
  mission: MissionCourriel,
  lienMission: string,
): Courriel {
  const bonjour = prenom ? `Bonjour ${prenom},` : 'Bonjour,';
  const titre = 'Votre mission est confirmee';

  const texte = [
    bonjour,
    '',
    `Vous etes retenu pour la mission ${mission.reference}. Elle est confirmee :`,
    '',
    ligneMission(mission),
    '',
    'Le detail : ' + lienMission,
    '',
    'En cas d empechement, prevenez l agence des que possible en citant la reference ' +
      mission.reference +
      '.',
    '',
    PIED,
  ].join('\n');

  const html = enveloppe(
    titre,
    `<p style="margin:0 0 16px;line-height:1.6">${echapper(bonjour)}</p>
     <p style="margin:0 0 20px;line-height:1.6">
       Vous etes retenu pour la mission <strong>${echapper(mission.reference)}</strong>. Elle est confirmee&nbsp;:
     </p>
     ${carteMission(mission)}
     <p style="margin:20px 0 0">
       <a href="${echapper(lienMission)}" style="display:inline-block;padding:10px 18px;background:#0f766e;color:#fff;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none">
         Voir le detail
       </a>
     </p>
     <p style="margin:24px 0 0;font-size:13px;color:#57534e;line-height:1.6">
       En cas d empechement, prevenez l agence des que possible en citant la reference
       ${echapper(mission.reference)}.
     </p>`,
  );

  return { destinataire, sujet: `Releve — ${titre}`, texte, html };
}
