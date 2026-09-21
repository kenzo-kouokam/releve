import { hash } from '@node-rs/argon2';
import { Prisma, PrismaClient, type RoleUtilisateur } from '@prisma/client';
import { readFile } from 'node:fs/promises';
import { agreger, ecrire } from '../src/competences/agregation';
import { preparerLot, type OffreBrute } from '../src/donnees-publiques/normalisation';

const prisma = new PrismaClient();

// Comptes de demonstration : le mot de passe est volontairement le meme pour
// tous, et volontairement inutilisable ailleurs qu'en local.
const MOT_DE_PASSE_DEMO = 'Releve2026!';

// Le code ROME rattache chaque diplome au marche observe sur France Travail :
// J1501 pour les soins, K1302 pour l'accompagnement. Ce sont les codes que la
// collecte importe, et ceux dont le referentiel de competences est tire.
//
// Le referentiel se limite a ces deux diplomes : ce sont ceux sur lesquels
// l'agence sait recruter et verifier une piece. En lister davantage revenait a
// laisser declarer des titres que personne ne controle, et a publier des
// missions qu'aucun profil ne peut satisfaire. Toute ligne absente de cette
// liste est retiree de la base a la fin du seed (voir `elaguerReferentiel`).
const QUALIFICATIONS: { code: string; libelle: string; romeCode: string }[] = [
  {
    code: 'DEAS',
    libelle: "Diplôme d'État d'aide-soignant",
    romeCode: 'J1501',
  },
  {
    code: 'DEAES',
    libelle: "Diplôme d'État d'accompagnant éducatif et social",
    romeCode: 'K1302',
  },
];

/**
 * Retire de la base les diplomes qui ne sont plus au referentiel.
 *
 * Le seed pose les lignes voulues mais ne savait pas defaire : une base semee
 * avant la reduction gardait les six diplomes d'origine, et la liste deroulante
 * du profil continuait de les proposer. Les cles etrangeres sont en
 * `Restrict`, donc l'ordre compte : on detache d'abord, on supprime ensuite.
 *
 * Un rattachement candidat est supprime plutot que reporte sur un autre
 * diplome : deplacer un titre d'une personne reviendrait a lui attribuer
 * quelque chose qu'elle n'a pas declare. Une mission, elle, ne peut pas se
 * passer de son diplome requis — si une mission hors seed en exige un retire,
 * on laisse la ligne en place et on le dit, plutot que de casser la mission.
 */
async function elaguerReferentiel(): Promise<void> {
  const retenus = QUALIFICATIONS.map((qualification) => qualification.code);

  const obsoletes = await prisma.qualification.findMany({
    where: { code: { notIn: retenus } },
    select: { id: true, code: true, _count: { select: { missions: true } } },
  });

  if (!obsoletes.length) return;

  const retenues = obsoletes.filter((qualification) => qualification._count.missions > 0);
  const aRetirer = obsoletes.filter((qualification) => qualification._count.missions === 0);

  if (retenues.length) {
    console.warn(
      'Diplomes conserves malgre leur retrait du referentiel, des missions les exigent :',
      retenues.map((qualification) => qualification.code).join(', '),
    );
  }

  if (!aRetirer.length) return;

  const identifiants = aRetirer.map((qualification) => qualification.id);

  await prisma.qualificationCandidat.deleteMany({
    where: { qualificationId: { in: identifiants } },
  });

  // Un poste garde sa duree et son employeur : il perd seulement sa
  // correspondance au referentiel, et compte des lors pour moitie.
  await prisma.experienceProfessionnelle.updateMany({
    where: { qualificationId: { in: identifiants } },
    data: { qualificationId: null },
  });

  await prisma.qualification.deleteMany({ where: { id: { in: identifiants } } });

  console.log(
    'Diplomes retires du referentiel :',
    aRetirer.map((qualification) => qualification.code).join(', '),
  );
}

async function main(): Promise<void> {
  const agence = await prisma.agence.upsert({
    where: { id: '00000000-0000-4000-8000-000000000001' },
    update: { nom: 'Relève - agence pilote' },
    create: {
      id: '00000000-0000-4000-8000-000000000001',
      nom: 'Relève - agence pilote',
      ville: 'Nantes',
    },
  });

  for (const qualification of QUALIFICATIONS) {
    await prisma.qualification.upsert({
      where: { code: qualification.code },
      update: {
        libelle: qualification.libelle,
        romeCode: qualification.romeCode,
      },
      create: qualification,
    });
  }

  // Un premier EHPAD, associatif : un seul site, hebergement classique.
  const ehpadTilleuls = await prisma.client.upsert({
    where: { siret: '48291736500017' },
    // Un `update` vide ne converge jamais : une fiche de demonstration renommee
    // garderait son ancien nom a chaque reseed.
    update: {
      raisonSociale: 'EHPAD Les Tilleuls',
      type: 'EHPAD',
      statutJuridique: 'PRIVE_NON_LUCRATIF',
      numeroFiness: '440001234',
      arreteReference: 'ARR-2024-0117',
      arreteDate: new Date('2024-03-18'),
    },
    create: {
      agenceId: agence.id,
      raisonSociale: 'EHPAD Les Tilleuls',
      siret: '48291736500017',
      type: 'EHPAD',
      // Gestionnaire associatif : convention collective de branche. Tout EHPAD
      // releve de l'article L. 312-1 du CASF, donc la duree minimale d'exercice
      // prealable a l'interim s'applique a toutes ses mises a disposition.
      statutJuridique: 'PRIVE_NON_LUCRATIF',
      numeroFiness: '440001234',
      arreteReference: 'ARR-2024-0117',
      arreteDate: new Date('2024-03-18'),
      conventionCollective: 'CCN 51 (FEHAP) - a confirmer avec la paie',
      contactNom: 'Cadre de sante',
      contactEmail: 'cadre@les-tilleuls.example',
      contactTel: '0240000001',
    },
  });

  await poserLieu(ehpadTilleuls.id, {
    type: 'ETABLISSEMENT',
    libelle: 'Les Tilleuls - hebergement, secteur Hauts-Paves',
    // Adresses reelles, et coordonnees qui leur correspondent vraiment. Le seed
    // les pose en dur pour rester deterministe et jouable sans reseau — mais
    // elles doivent rester geocodables, sinon `pnpm cli geocoder` echouerait sur
    // le jeu de demonstration et on croirait a une panne du service.
    adresse: '12 rue de Strasbourg',
    codePostal: '44000',
    ville: 'Nantes',
    latitude: 47.215936,
    longitude: -1.551073,
    etage: '2e etage, aile est',
    consignes: 'Badge a retirer a l accueil, contre piece d identite.',
  });

  // Un second EHPAD, commercial : c'est lui qui porte l'unite protegee, pour
  // que la demonstration montre les deux types de lieu.
  const ehpad = await prisma.client.upsert({
    where: { siret: '51938274600021' },
    update: {
      raisonSociale: 'EHPAD Les Sorinieres',
      type: 'EHPAD',
      statutJuridique: 'PRIVE_COMMERCIAL',
      numeroFiness: '440005678',
      arreteReference: 'ARR-2021-0442',
      arreteDate: new Date('2021-09-06'),
    },
    create: {
      agenceId: agence.id,
      raisonSociale: 'EHPAD Les Sorinieres',
      siret: '51938274600021',
      type: 'EHPAD',
      // Gestionnaire commercial : l'autre cadre salarial, pour que la
      // demonstration ne montre pas deux fois le meme.
      statutJuridique: 'PRIVE_COMMERCIAL',
      numeroFiness: '440005678',
      arreteReference: 'ARR-2021-0442',
      arreteDate: new Date('2021-09-06'),
      conventionCollective: 'IDCC 2264 - a confirmer avec la paie',
      idcc: '2264',
      contactNom: 'Directrice adjointe',
      contactEmail: 'direction@les-sorinieres.example',
      contactTel: '0240000002',
    },
  });

  await poserLieu(ehpad.id, {
    type: 'ETABLISSEMENT',
    libelle: 'Les Sorinieres - hebergement, secteur Doulon',
    adresse: '5 rue du Moulin',
    codePostal: '44300',
    ville: 'Nantes',
    latitude: 47.2401,
    longitude: -1.5122,
    etage: '3e etage',
    codeAcces: 'A1234',
  });

  await poserLieu(ehpad.id, {
    type: 'UNITE_PROTEGEE',
    libelle: 'Les Sorinieres - unite protegee, secteur Reze',
    adresse: '28 avenue des Sorinieres',
    codePostal: '44400',
    ville: 'Reze',
    latitude: 47.1836,
    longitude: -1.5494,
    consignes: 'Unite fermee : sas d acces, ne jamais laisser une porte ouverte.',
  });

  const candidats: {
    email: string;
    nom: string;
    prenom: string;
    telephone: string;
    ville: string;
    codePostal: string;
    adresse: string;
    latitude: number;
    longitude: number;
    rayonKm: number;
    permisB: boolean;
    vehicule: boolean;
    qualifications: string[];
    /**
     * Parcours professionnel. Les durees sont volontairement contrastees :
     * sans cela, le classement rendrait quatre scores identiques et ne
     * montrerait pas ce que le bareme sait faire.
     */
    experiences: {
      employeur: string;
      intitule: string;
      qualification: string | null;
      debutLe: string;
      finLe: string | null;
      quotitePourcent: number;
      verifiee: boolean;
    }[];
  }[] = [
    {
      email: 'nadia.benali@example.org',
      nom: 'Benali',
      prenom: 'Nadia',
      telephone: '0612345601',
      adresse: '9 rue de la Paix',
      codePostal: '44300',
      ville: 'Nantes',
      latitude: 47.2438,
      longitude: -1.5261,
      rayonKm: 25,
      permisB: true,
      vehicule: true,
      qualifications: ['DEAES'],
      // Le profil le plus solide du jeu : huit ans de terrain, au-dela du
      // plafond de cinq ans, donc au maximum de la composante.
      experiences: [
        {
          employeur: 'EHPAD Le Grand Chene',
          intitule: 'Accompagnante educative et sociale',
          qualification: 'DEAES',
          debutLe: '2018-01-08',
          finLe: null,
          quotitePourcent: 100,
          verifiee: true,
        },
      ],
    },
    {
      email: 'marc.leroy@example.org',
      nom: 'Leroy',
      prenom: 'Marc',
      telephone: '0612345602',
      adresse: '3 boulevard Gabriel Lauriol',
      codePostal: '44000',
      ville: 'Nantes',
      latitude: 47.2299,
      longitude: -1.5471,
      rayonKm: 15,
      permisB: false,
      vehicule: false,
      qualifications: ['DEAS'],
      // Un poste declare mais pas encore controle par l'agence : il s'affiche
      // sur la fiche et ne rapporte rien. C'est le cas qui rend l'invariant
      // visible dans la demo.
      experiences: [
        {
          employeur: 'EHPAD Bel Air',
          intitule: 'Aide-soignant',
          qualification: 'DEAS',
          debutLe: '2022-09-01',
          finLe: null,
          quotitePourcent: 100,
          verifiee: false,
        },
      ],
    },
    {
      // Le cas qui justifie de ne pas dupliquer la fiche.
      email: 'sophie.marchand@example.org',
      nom: 'Marchand',
      prenom: 'Sophie',
      telephone: '0612345603',
      adresse: '17 rue de Reze',
      codePostal: '44400',
      ville: 'Reze',
      latitude: 47.1902,
      longitude: -1.5583,
      rayonKm: 30,
      permisB: true,
      vehicule: true,
      qualifications: ['DEAES'],
      // Une reconversion : trois ans de caisse, puis deux ans dans le metier.
      // Le hors-referentiel compte pour moitie.
      experiences: [
        {
          employeur: 'Supermarche Coeur de Reze',
          intitule: 'Hotesse de caisse',
          qualification: null,
          debutLe: '2019-02-01',
          finLe: '2022-01-31',
          quotitePourcent: 100,
          verifiee: true,
        },
        {
          employeur: 'EHPAD Les Glycines',
          intitule: 'Accompagnante educative et sociale',
          qualification: 'DEAES',
          debutLe: '2022-03-01',
          finLe: null,
          quotitePourcent: 60,
          verifiee: true,
        },
      ],
    },
    {
      email: 'karim.ferreira@example.org',
      nom: 'Ferreira',
      prenom: 'Karim',
      telephone: '0612345604',
      adresse: '44 route de Vannes',
      codePostal: '44800',
      ville: 'Saint-Herblain',
      latitude: 47.2296,
      longitude: -1.6108,
      rayonKm: 20,
      permisB: true,
      vehicule: false,
      qualifications: ['DEAS'],
      // Aucune experience : le profil eligible qui marque zero sur la
      // composante la plus lourde. C'est l'etat de depart de toute inscription.
      experiences: [],
    },
  ];

  for (const donnees of candidats) {
    const { qualifications, experiences, ...candidat } = donnees;

    const enregistre = await prisma.candidat.upsert({
      where: { email: candidat.email },
      update: {},
      create: {
        ...candidat,
        agenceId: agence.id,
        statut: 'ACTIF',
        disponibilites: {
          create: [
            { jourSemaine: 1, heureDebut: '07:00', heureFin: '13:00' },
            { jourSemaine: 2, heureDebut: '07:00', heureFin: '13:00' },
            { jourSemaine: 4, heureDebut: '14:00', heureFin: '20:00' },
          ],
        },
      },
    });

    // Les experiences sont reecrites a chaque seed : elles n'ont pas de cle
    // naturelle sur laquelle poser un upsert, et les laisser s'accumuler
    // fausserait le classement au deuxieme passage.
    await prisma.experienceProfessionnelle.deleteMany({ where: { candidatId: enregistre.id } });

    for (const poste of experiences) {
      const rattachement = poste.qualification
        ? await prisma.qualification.findUniqueOrThrow({ where: { code: poste.qualification } })
        : null;

      await prisma.experienceProfessionnelle.create({
        data: {
          candidatId: enregistre.id,
          employeur: poste.employeur,
          intitule: poste.intitule,
          qualificationId: rattachement?.id ?? null,
          debutLe: new Date(`${poste.debutLe}T00:00:00.000Z`),
          finLe: poste.finLe ? new Date(`${poste.finLe}T00:00:00.000Z`) : null,
          quotitePourcent: poste.quotitePourcent,
          ...(poste.verifiee ? { verifieeLe: new Date(), verifieePar: 'seed' } : {}),
        },
      });
    }

    for (const code of qualifications) {
      const referentiel = await prisma.qualification.findUniqueOrThrow({ where: { code } });
      await prisma.qualificationCandidat.upsert({
        where: {
          candidatId_qualificationId: {
            candidatId: enregistre.id,
            qualificationId: referentiel.id,
          },
        },
        update: {},
        create: {
          candidatId: enregistre.id,
          qualificationId: referentiel.id,
          obtenueLe: new Date('2021-06-30'),
          verifieeLe: new Date(),
          verifieePar: 'seed',
        },
      });
    }
  }

  // --- comptes de demonstration, un par role
  const sophie = await prisma.candidat.findUniqueOrThrow({
    where: { email: 'sophie.marchand@example.org' },
  });

  const empreinte = await hash(MOT_DE_PASSE_DEMO);

  const comptes: {
    email: string;
    role: RoleUtilisateur;
    agenceId?: string;
    clientId?: string;
    candidatId?: string;
  }[] = [
    { email: 'admin@releve.example', role: 'ADMIN_AGENCE', agenceId: agence.id },
    { email: 'charge@releve.example', role: 'CHARGE_RECRUTEMENT', agenceId: agence.id },
    // Prepares pour les lots 2 et 3 : les espaces client et candidat n'ont pas
    // encore d'ecran, mais le jeton porte deja le bon rattachement.
    { email: 'secteur@les-tilleuls.example', role: 'CLIENT', clientId: ehpadTilleuls.id },
    { email: 'sophie.marchand@example.org', role: 'CANDIDAT', candidatId: sophie.id },
  ];

  for (const compte of comptes) {
    // On reecrit le mot de passe a chaque seed : en dev, relancer `db:seed` est
    // la facon la plus simple de recuperer un acces.
    // `emailVerifieLe` est pose d'office : ces comptes viennent du seed, pas du
    // site public. La confirmation d'adresse atteste que celui qui s'inscrit
    // possede l'adresse qu'il declare — un compte de demonstration n'a personne
    // a qui le prouver, et sans cette ligne la demo serait inconnectable.
    await prisma.utilisateur.upsert({
      where: { email: compte.email },
      update: {
        motDePasse: empreinte,
        role: compte.role,
        actif: true,
        emailVerifieLe: new Date(),
      },
      create: { ...compte, motDePasse: empreinte, emailVerifieLe: new Date() },
    });
  }

  // Deux besoins ouverts, chez deux EHPAD differents : un en soins, un en
  // accompagnement, soit un par diplome du referentiel.
  const deas = await prisma.qualification.findUniqueOrThrow({ where: { code: 'DEAS' } });
  const deaes = await prisma.qualification.findUniqueOrThrow({ where: { code: 'DEAES' } });
  const lieuTilleuls = await prisma.lieuIntervention.findFirstOrThrow({
    where: { clientId: ehpadTilleuls.id },
  });
  // L'unite protegee : c'est la qu'atterrit le besoin en accompagnement, et
  // c'est ce qui donnera son sens a l'exigence de formation specifique.
  const lieuUnite = await prisma.lieuIntervention.findFirstOrThrow({
    where: { clientId: ehpad.id, type: 'UNITE_PROTEGEE' },
  });

  await poserMission({
    reference: 'DEMO-2026-0001',
    agenceId: agence.id,
    clientId: ehpadTilleuls.id,
    lieuId: lieuTilleuls.id,
    qualificationRequiseId: deas.id,
    statut: 'PUBLIEE',
    dateDebut: new Date('2026-09-15'),
    dateFin: new Date('2026-09-19'),
    heureDebut: '06:45',
    heureFin: '14:15',
    motifRecours: "Remplacement d'un salarie absent",
    description:
      'Aide aux soins d hygiene et au lever, service du petit dejeuner, unite de 28 residents.',
    tauxHoraire: '13.5000',
    coefficient: '1.950',
  });

  await poserMission({
    reference: 'DEMO-2026-0002',
    agenceId: agence.id,
    clientId: ehpad.id,
    lieuId: lieuUnite.id,
    qualificationRequiseId: deaes.id,
    statut: 'PUBLIEE',
    dateDebut: new Date('2026-09-14'),
    dateFin: new Date('2026-09-20'),
    heureDebut: '08:00',
    heureFin: '11:00',
    motifRecours: 'Accroissement temporaire d activite',
    description:
      'Accompagnement en unite protegee : lever, repas, animation adaptee aux troubles cognitifs.',
    tauxHoraire: '12.2000',
    coefficient: '1.880',
  });

  await poserLeReste(agence.id, deas.id, deaes.id);

  // Mission dediee a la demonstration de WF2 (relance automatique), dans un
  // futur proche pour que missionsNonPourvues() la voie. Son evenement de
  // publication est antidate de 2 h : avec RELANCE_SEUIL_MIN=1, WF2 la relance
  // des son premier passage.
  await poserMission({
    reference: 'DEMO-2026-RELANCE',
    agenceId: agence.id,
    clientId: ehpadTilleuls.id,
    lieuId: lieuTilleuls.id,
    qualificationRequiseId: deas.id,
    statut: 'PUBLIEE',
    dateDebut: new Date('2026-10-14'),
    dateFin: new Date('2026-10-16'),
    heureDebut: '09:00',
    heureFin: '13:00',
    motifRecours: "Remplacement d'un salarie absent",
    description: 'Aide au lever et assistance aux repas. Mission de demonstration de la relance.',
    tauxHoraire: '12.5000',
    coefficient: '1.900',
  });
  const missionRelance = await prisma.mission.findUniqueOrThrow({
    where: { reference: 'DEMO-2026-RELANCE' },
  });
  const dejaPubliee = await prisma.evenementMission.findFirst({
    where: { missionId: missionRelance.id, type: 'mission.publiee' },
  });
  if (!dejaPubliee) {
    await prisma.evenementMission.create({
      data: {
        missionId: missionRelance.id,
        type: 'mission.publiee',
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      },
    });
  }

  // Le seed pose latitude / longitude en dur, pour rester deterministe et
  // jouable sans reseau. La colonne PostGIS, elle, n'est ecrite qu'en SQL brut :
  // sans cette mise en accord, l'index spatial designerait le vide alors que le
  // bareme, lui, trouverait des coordonnees.
  for (const table of ['candidat', 'lieu_intervention']) {
    await prisma.$executeRawUnsafe(`
      UPDATE "${table}"
         SET geom = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
       WHERE latitude IS NOT NULL AND longitude IS NOT NULL
    `);
  }

  await elaguerReferentiel();
  const marche = await amorcerLeMarche();

  const compteurs = {
    qualifications: await prisma.qualification.count(),
    clients: await prisma.client.count(),
    lieux: await prisma.lieuIntervention.count(),
    candidats: await prisma.candidat.count(),
    experiences: await prisma.experienceProfessionnelle.count(),
    utilisateurs: await prisma.utilisateur.count(),
    missions: await prisma.mission.count(),
    offresCollectees: await prisma.offreCollectee.count(),
    competences: await prisma.competence.count(),
  };

  console.log('Jeu de donnees en place :', compteurs);

  if (marche) {
    console.log(
      `Referentiel de competences : ${marche.competences} lignes tirees de ` +
        `${marche.offresLues} offres France Travail`,
    );
  }
  console.log(`Comptes de demonstration : mot de passe "${MOT_DE_PASSE_DEMO}"`);
}

/**
 * Les autres etablissements de la demonstration.
 *
 * Deux EHPAD dans la meme agglomeration ne suffisaient pas a la vitrine : ses
 * trois menus deroulants — departement, ville, metier — sont construits sur les
 * missions **reellement ouvertes** et non sur une liste figee des cent une
 * divisions francaises. Ce choix est le bon (proposer « Cantal » dans un menu
 * qui ne rendrait jamais rien ferait perdre le visiteur), mais il a une
 * consequence mecanique : avec deux missions a Nantes et a Reze, le menu des
 * departements n'offrait que « 44 ».
 *
 * Ces quatre etablissements couvrent donc quatre departements et six communes,
 * de quoi eprouver le filtrage — le chainage departement / ville compris, qui
 * ne se voit pas tant qu'il n'y a qu'un departement.
 *
 * Coordonnees reelles, comme partout dans ce seed : elles doivent rester
 * geocodables, sinon `pnpm cli geocoder` echouerait sur le jeu de demonstration
 * et on croirait a une panne du service.
 */
const AUTRES_EHPAD = [
  {
    siret: '40355499000016',
    raisonSociale: 'EHPAD Les Charmilles',
    statutJuridique: 'PUBLIC_TERRITORIAL' as const,
    numeroFiness: '490001122',
    arreteReference: 'ARR-2019-0231',
    convention: 'Fonction publique territoriale',
    lieu: {
      type: 'ETABLISSEMENT' as const,
      libelle: 'Les Charmilles - hebergement',
      adresse: '14 rue Saint-Laud',
      codePostal: '49000',
      ville: 'Angers',
      latitude: 47.4712,
      longitude: -0.5518,
    },
    mission: {
      reference: 'DEMO-2026-0003',
      qualification: 'DEAS' as const,
      dateDebut: '2026-09-21',
      dateFin: '2026-09-25',
      heureDebut: '06:30',
      heureFin: '14:00',
      motifRecours: "Remplacement d'un salarie absent",
      description:
        'Poste du matin sur un secteur de 22 residents : lever, soins d hygiene, service du petit dejeuner.',
      tauxHoraire: '13.8000',
    },
  },
  {
    siret: '51234567800019',
    raisonSociale: 'EHPAD Le Clos Fleuri',
    statutJuridique: 'PRIVE_NON_LUCRATIF' as const,
    numeroFiness: '850003344',
    arreteReference: 'ARR-2022-0087',
    convention: 'CCN 51 (FEHAP)',
    lieu: {
      type: 'UNITE_PROTEGEE' as const,
      libelle: 'Le Clos Fleuri - unite protegee',
      adresse: '3 rue Gaston Ramon',
      codePostal: '85000',
      ville: 'La Roche-sur-Yon',
      latitude: 46.6705,
      longitude: -1.4266,
    },
    mission: {
      reference: 'DEMO-2026-0004',
      qualification: 'DEAES' as const,
      dateDebut: '2026-09-22',
      dateFin: '2026-09-26',
      heureDebut: '13:30',
      heureFin: '21:00',
      motifRecours: 'Accroissement temporaire d activite',
      description:
        'Unite protegee de 14 places : accompagnement des repas, activites adaptees, coucher.',
      tauxHoraire: '12.9000',
    },
  },
  {
    siret: '78245698100011',
    raisonSociale: 'EHPAD Bellevue',
    statutJuridique: 'PRIVE_COMMERCIAL' as const,
    numeroFiness: '350005566',
    arreteReference: 'ARR-2020-0455',
    convention: 'IDCC 2264',
    lieu: {
      type: 'ETABLISSEMENT' as const,
      libelle: 'Bellevue - hebergement',
      adresse: '9 rue de Chatillon',
      codePostal: '35000',
      ville: 'Rennes',
      latitude: 48.0961,
      longitude: -1.6789,
    },
    mission: {
      reference: 'DEMO-2026-0005',
      qualification: 'DEAS' as const,
      dateDebut: '2026-09-23',
      dateFin: '2026-09-23',
      heureDebut: '21:00',
      heureFin: '07:00',
      motifRecours: "Remplacement d'un salarie absent",
      description:
        'Nuit en binome avec l infirmiere d astreinte : rondes, changes, surveillance de l etat general.',
      tauxHoraire: '15.2000',
    },
  },
  {
    siret: '44455667700011',
    raisonSociale: 'EHPAD Les Salines',
    statutJuridique: 'PUBLIC_HOSPITALIER' as const,
    numeroFiness: '440007788',
    arreteReference: 'ARR-2018-0912',
    convention: 'Fonction publique hospitaliere',
    lieu: {
      type: 'ETABLISSEMENT' as const,
      libelle: 'Les Salines - hebergement',
      adresse: '11 rue du Croisic',
      codePostal: '44600',
      ville: 'Saint-Nazaire',
      latitude: 47.2735,
      longitude: -2.2138,
    },
    mission: {
      reference: 'DEMO-2026-0006',
      qualification: 'DEAS' as const,
      dateDebut: '2026-09-24',
      dateFin: '2026-09-28',
      heureDebut: '07:00',
      heureFin: '14:30',
      motifRecours: 'Accroissement temporaire d activite',
      description:
        'Renfort sur le secteur hebergement pendant les conges : soins d hygiene, transferts, transmissions.',
      tauxHoraire: '14.1000',
    },
  },
];

/** Cree les quatre autres etablissements et leur mission ouverte. */
async function poserLeReste(agenceId: string, deas: string, deaes: string): Promise<void> {
  for (const fiche of AUTRES_EHPAD) {
    const identite = {
      raisonSociale: fiche.raisonSociale,
      type: 'EHPAD' as const,
      statutJuridique: fiche.statutJuridique,
      numeroFiness: fiche.numeroFiness,
      arreteReference: fiche.arreteReference,
      conventionCollective: `${fiche.convention} - a confirmer avec la paie`,
    };

    const client = await prisma.client.upsert({
      where: { siret: fiche.siret },
      update: identite,
      create: { ...identite, siret: fiche.siret, agenceId },
    });

    await poserLieu(client.id, fiche.lieu);

    const lieu = await prisma.lieuIntervention.findFirstOrThrow({
      where: { clientId: client.id, libelle: fiche.lieu.libelle },
      select: { id: true },
    });

    await poserMission({
      reference: fiche.mission.reference,
      agenceId,
      clientId: client.id,
      lieuId: lieu.id,
      qualificationRequiseId: fiche.mission.qualification === 'DEAS' ? deas : deaes,
      statut: 'PUBLIEE',
      dateDebut: new Date(fiche.mission.dateDebut),
      dateFin: new Date(fiche.mission.dateFin),
      heureDebut: fiche.mission.heureDebut,
      heureFin: fiche.mission.heureFin,
      // Le travail de nuit n'est pas saisi : il se deduit des horaires, comme
      // le fait le service quand un etablissement depose un besoin.
      travailNuit: fiche.mission.heureFin < fiche.mission.heureDebut,
      motifRecours: fiche.mission.motifRecours,
      description: fiche.mission.description,
      tauxHoraire: fiche.mission.tauxHoraire,
    });
  }
}

/**
 * Pose une mission de demonstration, et la fait converger entierement.
 *
 * ## Deux defauts reunis, et un prefixe qui les regle
 *
 * L'upsert precedent ne reecrivait que le diplome exige. Une base semee avant
 * un changement gardait donc son ancienne description : au passage a l'EHPAD,
 * la vitrine a continue d'annoncer « 3e sans ascenseur » sur une mission qui se
 * deroule desormais en unite protegee. Invisible sur une base neuve,
 * systematique sur celle des developpeurs.
 *
 * Le second defaut etait plus grave. Les missions du seed portaient des
 * references de la forme `M-2026-000N`, c'est-a-dire **exactement** celles que
 * `referenceSuivante()` attribue aux missions creees par l'API. Une
 * demonstration qui deposait un besoin recevait `M-2026-0003` ; le reseed
 * suivant la reecrivait de fond en comble, la deplacant chez un autre
 * etablissement. Le cas s'est produit.
 *
 * Le prefixe `DEMO-` regle les deux. Le generateur ne regarde que les
 * references commencant par `M-<annee>-` : les missions du seed lui sont
 * invisibles, il ne peut plus les heurter, et le seed ne peut plus heurter les
 * siennes. C'est aussi plus honnete a l'ecran — ces missions sont des fixtures,
 * et la reference le dit.
 *
 * Tout converge alors, y compris le statut : rejouer le seed, c'est ramener la
 * demonstration a son etat initial. Le candidat retenu est remis a null avec le
 * reste, sans quoi une mission redevenue PUBLIEE garderait un titulaire.
 */
async function poserMission(donnees: Prisma.MissionUncheckedCreateInput): Promise<void> {
  await prisma.mission.upsert({
    where: { reference: donnees.reference },
    create: donnees,
    update: { ...donnees, candidatRetenuId: null },
  });
}

/**
 * Pose un lieu d'intervention, sans le dupliquer a chaque passage.
 *
 * Les lieux etaient jusqu'ici crees dans la branche `create` de l'upsert du
 * client. Une base deja semee ne les revoyait donc jamais : le passage a
 * l'EHPAD a ajoute une unite protegee que le reseed n'a pas creee, et la
 * mission qui devait s'y derouler a echoue a la trouver. C'est exactement le
 * defaut que le commentaire de l'upsert du client mettait en garde contre, une
 * ligne plus haut.
 *
 * Le `libelle` sert de cle metier a defaut d'unicite en base : deux lieux du
 * meme client ne portent pas le meme nom, sinon l'agence ne saurait pas les
 * distinguer dans une liste deroulante.
 */
async function poserLieu(
  clientId: string,
  donnees: Omit<Prisma.LieuInterventionUncheckedCreateInput, 'clientId'>,
): Promise<void> {
  const existant = await prisma.lieuIntervention.findFirst({
    where: { clientId, libelle: donnees.libelle },
    select: { id: true },
  });

  if (existant) {
    await prisma.lieuIntervention.update({ where: { id: existant.id }, data: donnees });

    return;
  }

  await prisma.lieuIntervention.create({ data: { ...donnees, clientId } });
}

/**
 * Amorce le marche : quelques offres France Travail reelles, puis le
 * referentiel de competences qu'on en tire.
 *
 * L'echantillon est un instantane de l'API, produit par
 * `pnpm cli exporter:offres` et versionne dans `backend/donnees/`. Il est rejoue
 * ici pour que la demonstration tienne sans reseau et sans identifiants
 * France Travail — sans lui, une installation neuve afficherait un formulaire
 * de depot de besoin dont la liste de competences serait vide, ce qui donnerait
 * a croire que la fonctionnalite n'existe pas.
 *
 * Le nettoyage et l'agregation sont ceux de la production, importes et non
 * recopies : `preparerLot` pour l'un, `agreger` / `ecrire` pour l'autre. Un
 * seed qui aurait sa propre version finirait par produire une base qui ne
 * ressemble plus a rien de reel.
 *
 * Rend `null` si l'echantillon est absent : l'amorce est un confort, pas une
 * dependance, et un seed qui echouerait pour cela serait plus penible qu'utile.
 */
async function amorcerLeMarche() {
  let brutes: OffreBrute[];

  try {
    const contenu = await readFile(new URL('../donnees/offres-echantillon.json', import.meta.url), 'utf8');

    brutes = (JSON.parse(contenu) as { resultats?: OffreBrute[] }).resultats ?? [];
  } catch {
    console.warn('Echantillon d offres absent : le referentiel de competences reste vide.');

    return null;
  }

  const { offres } = preparerLot(brutes);

  for (const offre of offres) {
    const { id, ...reste } = offre;

    await prisma.offreCollectee.upsert({
      where: { id },
      create: { id, ...reste },
      update: reste,
    });
  }

  const lues = await prisma.offreCollectee.findMany({
    where: { statut: 'ACTIVE' },
    select: {
      romeCode: true,
      intitule: true,
      description: true,
      qualificationLibelle: true,
      competences: true,
    },
  });

  return ecrire(prisma, agreger(lues), lues.length);
}

main()
  .catch((erreur) => {
    console.error(erreur);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
