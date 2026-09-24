/**
 * Donnees structurees schema.org, en JSON-LD.
 *
 * Ce que les moteurs lisent du site en plus du texte : qui edite, quel est le
 * chemin de la page courante dans l'arborescence, quelles questions la FAQ
 * repond, quelles missions sont ouvertes. Google ne devine aucune de ces
 * choses ; declarees ici, elles autorisent le fil d'Ariane sous le resultat,
 * l'encart de marque et — pour les offres — la fiche d'emploi.
 *
 * Trois partis pris valables pour tout le fichier.
 *
 * 1. Fonctions pures : elles prennent l'URL du site en premier argument et ne
 *    touchent ni a `useRuntimeConfig` ni a la route. C'est ce qui les rend
 *    testables et reutilisables cote serveur (un futur `sitemap.xml` s'en
 *    servira sans contexte Nuxt).
 * 2. Adresses absolues partout. Un `@id` relatif ne vaut rien : c'est la cle
 *    qui permet a deux blocs — celui du gabarit et celui de la page — de
 *    parler du meme objet sans le decrire deux fois.
 * 3. Rien qui ne soit vrai. Aucune note moyenne, aucun avis, aucun chiffre
 *    d'affaires inventes : ce sont exactement les proprietes que les moteurs
 *    sanctionnent quand elles ne se retrouvent pas dans la page.
 */

import type { MissionVitrine } from '@releve/shared';

/** Un noeud schema.org. Le `@type` est le seul champ toujours present. */
export interface NoeudSchema {
  '@type': string | readonly string[];
  [cle: string]: unknown;
}

/** Une etape du fil d'Ariane. La derniere — la page courante — n'a pas de lien. */
export interface EtapeFilAriane {
  libelle: string;
  /** Chemin interne, `/offres` par exemple. Absent sur la page courante. */
  to?: string;
}

/**
 * Colle un chemin interne a la racine du site.
 *
 * Tolere le chemin vide et la barre de trop : les appels viennent de routes
 * Nuxt, ou `/` et `''` designent la meme page.
 */
export function urlAbsolue(site: string, chemin = '/'): string {
  const racine = site.replace(/\/+$/, '');
  const suite = chemin.startsWith('/') ? chemin : `/${chemin}`;

  return `${racine}${suite === '/' ? '/' : suite.replace(/\/+$/, '')}`;
}

/**
 * Identite de l'editeur, referencee par tout le reste.
 *
 * `EmploymentAgency` plutot que `Organization` : le type existe dans le
 * vocabulaire, il decrit exactement une agence de placement, et il porte le
 * lien avec les `JobPosting` que l'agence publie.
 *
 * Les mentions legales ne sont volontairement pas reprises ici. Elles sont
 * encore un jeu de demonstration — SIRET a zeros, TVA inventee, voir
 * `app/data/legal.ts` — et publier un numero faux dans des donnees lues par
 * une machine est pire que de n'en publier aucun. Quand `MENTIONS_DEMONSTRATION`
 * passera a `false`, ajouter ici `taxID`, `vatID` et l'`address` du siege.
 */
export function identiteOrganisation(site: string, courriel: string): NoeudSchema {
  return {
    '@type': 'EmploymentAgency',
    '@id': `${urlAbsolue(site)}#organisation`,
    name: 'Relève',
    url: urlAbsolue(site),
    slogan: 'Le soin, sans attendre',
    description:
      "Agence d'intérim spécialisée dans le soin : aides-soignants et accompagnants éducatifs et sociaux en EHPAD, hôpital et clinique.",
    email: courriel,
    areaServed: { '@type': 'Country', name: 'France' },
    knowsLanguage: 'fr-FR',
  };
}

/**
 * Le site lui-meme.
 *
 * Sans `potentialAction`/`SearchAction` : la « sitelinks searchbox » que cette
 * propriete alimentait a ete retiree des resultats Google en 2024. La declarer
 * aujourd'hui n'ajoute rien et laisse croire a une fonctionnalite morte.
 */
export function siteWeb(site: string): NoeudSchema {
  return {
    '@type': 'WebSite',
    '@id': `${urlAbsolue(site)}#site`,
    url: urlAbsolue(site),
    name: 'Relève',
    inLanguage: 'fr-FR',
    publisher: { '@id': `${urlAbsolue(site)}#organisation` },
  };
}

/**
 * Le chemin de la page dans l'arborescence — ce que Google affiche sous le
 * titre du resultat a la place de l'URL brute.
 *
 * L'ordre compte : `position` part de 1 a l'accueil et suit les etapes telles
 * qu'elles sont donnees. La derniere entree est la page courante ; son `item`
 * est quand meme renseigne, ce que la documentation de Google accepte et qui
 * evite un noeud a moitie vide.
 */
export function filAriane(
  site: string,
  cheminCourant: string,
  etapes: readonly EtapeFilAriane[],
): NoeudSchema {
  return {
    '@type': 'BreadcrumbList',
    '@id': `${urlAbsolue(site, cheminCourant)}#fil`,
    itemListElement: etapes.map((etape, rang) => ({
      '@type': 'ListItem',
      position: rang + 1,
      name: etape.libelle,
      item: urlAbsolue(site, etape.to ?? cheminCourant),
    })),
  };
}

/** Options communes aux pages decrites ci-dessous. */
export interface DescriptionPage {
  chemin: string;
  titre: string;
  description: string;
  /** `AboutPage`, `ContactPage`, `FAQPage`... `WebPage` par defaut. */
  type?: string;
  /**
   * Faux sur les pages sans `<AppFilAriane>` — l'accueil, seul cas a ce jour.
   * Le renvoi vers le fil serait sinon une reference vers un `@id` que rien ne
   * definit, ce que les validateurs signalent a juste titre.
   */
  filAriane?: boolean;
}

/**
 * La page courante, rattachee au site et a son editeur.
 *
 * Ce noeud n'allume aucun affichage particulier dans les resultats : il sert de
 * point d'ancrage. C'est lui qui permet au fil d'Ariane et, sur la FAQ, aux
 * questions, de se rattacher a quelque chose plutot que de flotter seuls.
 */
export function pageWeb(site: string, page: DescriptionPage): NoeudSchema {
  return {
    '@type': page.type ?? 'WebPage',
    '@id': `${urlAbsolue(site, page.chemin)}#page`,
    url: urlAbsolue(site, page.chemin),
    name: page.titre,
    description: page.description,
    inLanguage: 'fr-FR',
    isPartOf: { '@id': `${urlAbsolue(site)}#site` },
    about: { '@id': `${urlAbsolue(site)}#organisation` },
    ...(page.filAriane === false
      ? {}
      : { breadcrumb: { '@id': `${urlAbsolue(site, page.chemin)}#fil` } }),
  };
}

/**
 * Les questions de la FAQ.
 *
 * Seule condition posee par Google, et elle est tenue ici : chaque question et
 * chaque reponse balisees doivent etre visibles dans la page. Elles le sont —
 * les `<details>` sont replies, pas absents, et le texte est dans le document
 * des le rendu serveur.
 *
 * Depuis 2023, l'affichage enrichi des FAQ est reserve aux sites publics
 * reconnus dans leur domaine. Le balisage reste utile : il est lu par d'autres
 * moteurs et par les assistants, et il ne coute rien.
 */
export function pageQuestions(
  site: string,
  page: Omit<DescriptionPage, 'type'>,
  questions: readonly { question: string; reponse: string }[],
): NoeudSchema {
  return {
    ...pageWeb(site, { ...page, type: 'FAQPage' }),
    mainEntity: questions.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.reponse },
    })),
  };
}

/**
 * Une mission ouverte, en offre d'emploi.
 *
 * L'employeur declare est Releve, et c'est juridiquement exact : en interim,
 * le contrat de mission lie le salarie a l'agence, pas a l'etablissement. Ce
 * dernier n'apparait pas — la vitrine ne projette deja pas sa raison sociale,
 * voir `MissionVitrine` cote partage.
 *
 * LIMITE CONNUE — Google n'indexe une offre que si elle a sa propre adresse.
 * Les missions n'en ont pas : `/offres` les liste, et la fiche detaillee
 * demande une session. Le balisage est donc correct et lisible, mais il ne
 * produira de fiche d'emploi que le jour ou chaque mission aura une page
 * publique — `/offres/[reference]`. C'est le seul chantier SEO restant de
 * quelque ampleur.
 */
export function offreEmploi(site: string, chemin: string, mission: MissionVitrine): NoeudSchema {
  const adresse = urlAbsolue(site, chemin);

  return {
    '@type': 'JobPosting',
    '@id': `${adresse}#offre-${mission.reference}`,
    url: adresse,
    title: mission.metier,
    // La description est facultative en base et obligatoire pour le moteur :
    // a defaut, la phrase reconstruite dit le metier, le secteur et la ville,
    // ce qui est exactement ce que la carte affiche.
    description:
      mission.description ??
      `Mission d'intérim ${mission.metier} — ${mission.secteur}, ${mission.ville} (${mission.codePostal}).`,
    identifier: {
      '@type': 'PropertyValue',
      name: 'Relève',
      value: mission.reference,
    },
    datePosted: mission.datePublication,
    // Une offre expire quand la mission est finie : au-dela, la laisser
    // « ouverte » aux yeux du moteur vaut une penalite pour offre perimee.
    validThrough: mission.dateFin,
    employmentType: 'TEMPORARY',
    industry: 'Santé et action sociale',
    hiringOrganization: { '@id': `${urlAbsolue(site)}#organisation` },
    jobLocation: {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        addressLocality: mission.ville,
        postalCode: mission.codePostal,
        addressCountry: 'FR',
      },
    },
    jobStartDate: mission.dateDebut,
    ...(mission.travailNuit ? { workHours: `Nuit, ${mission.heureDebut}–${mission.heureFin}` } : {}),
    // Le taux est facultatif en base. Une remuneration absente vaut mieux
    // qu'un zero, qui s'afficherait « 0 € de l'heure » dans un resultat.
    ...(mission.tauxHoraire === null
      ? {}
      : {
          baseSalary: {
            '@type': 'MonetaryAmount',
            currency: 'EUR',
            value: {
              '@type': 'QuantitativeValue',
              value: mission.tauxHoraire,
              unitText: 'HOUR',
            },
          },
        }),
  };
}

/**
 * La liste des offres affichees, dans l'ordre de la page.
 *
 * `ItemList` decrit ce que la page est — un index — et non une offre unique.
 * Sans elle, les `JobPosting` du meme document se disputeraient le role de
 * sujet principal.
 */
export function listeOffres(
  site: string,
  chemin: string,
  missions: readonly MissionVitrine[],
): NoeudSchema {
  return {
    '@type': 'ItemList',
    '@id': `${urlAbsolue(site, chemin)}#liste`,
    name: "Offres d'intérim en EHPAD, hôpital et clinique",
    numberOfItems: missions.length,
    itemListElement: missions.map((mission, rang) => ({
      '@type': 'ListItem',
      position: rang + 1,
      item: offreEmploi(site, chemin, mission),
    })),
  };
}

/**
 * Serialise les noeuds en un seul bloc `@graph`.
 *
 * Un graphe plutot que N objets : les `@id` se resolvent alors entre eux, et
 * l'organisation n'est decrite qu'une fois pour toute la page.
 *
 * L'echappement de `<` n'est pas une precaution de principe. Le contenu vient
 * de la base — description d'une mission, reponse de FAQ — et une chaine
 * contenant `</script>` fermerait la balise au milieu du JSON, laissant le
 * reste s'executer comme du HTML. `<` est lu par `JSON.parse` comme le
 * caractere d'origine : le moteur voit le meme texte, le navigateur ne voit
 * plus de balise.
 */
export function serialiser(noeuds: readonly NoeudSchema[]): string {
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': noeuds }).replace(
    /</g,
    '\\u003c',
  );
}
