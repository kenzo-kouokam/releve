import { hash } from '@node-rs/argon2';
import { PrismaClient, type RoleUtilisateur } from '@prisma/client';

const prisma = new PrismaClient();

// Comptes de demonstration : le mot de passe est volontairement le meme pour
// tous, et volontairement inutilisable ailleurs qu'en local.
const MOT_DE_PASSE_DEMO = 'Releve2026!';

// Le code ROME rattache chaque diplome au marche observe sur France Travail :
// J1501 pour les soins, K1304 pour les services a la personne. Ce sont les
// codes que la collecte importe.
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
    code: 'AVS',
    libelle: 'Auxiliaire de vie sociale',
    romeCode: 'K1304',
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

  // Un premier SAAD, oriente accompagnement du handicap : deux beneficiaires
  // suivis, des interventions longues et regulieres.
  const saadTilleuls = await prisma.client.upsert({
    where: { siret: '48291736500017' },
    // Un `update` vide ne converge jamais : une fiche de demonstration renommee
    // garderait son ancien nom a chaque reseed.
    update: {
      raisonSociale: 'Les Tilleuls (SAAD)',
      type: 'SAAD',
      statutReglementaire: 'AUTORISE_SAD_ESMS',
      numeroFiness: '440001234',
      arreteReference: 'ARR-2024-0117',
      arreteDate: new Date('2024-03-18'),
    },
    create: {
      agenceId: agence.id,
      raisonSociale: 'Les Tilleuls (SAAD)',
      siret: '48291736500017',
      type: 'SAAD',
      // Structure autorisee par le conseil departemental : elle releve alors de
      // l'article L. 312-1 du CASF, ce qui declenche la duree minimale
      // d'exercice prealable a l'interim pour ses mises a disposition.
      statutReglementaire: 'AUTORISE_SAD_ESMS',
      numeroFiness: '440001234',
      arreteReference: 'ARR-2024-0117',
      arreteDate: new Date('2024-03-18'),
      conventionCollective: 'Branche aide a domicile (BAD) - a confirmer avec la paie',
      contactNom: 'Responsable de secteur',
      contactEmail: 'secteur@les-tilleuls.example',
      contactTel: '0240000001',
      lieux: {
        create: [
          {
            type: 'DOMICILE_BENEFICIAIRE',
            libelle: 'Domicile - secteur Hauts-Paves',
            // Adresses reelles, et coordonnees qui leur correspondent vraiment.
            // Le seed les pose en dur pour rester deterministe et jouable sans
            // reseau — mais elles doivent rester geocodables, sinon
            // `pnpm cli geocoder` echouerait sur le jeu de demonstration et on
            // croirait a une panne du service.
            adresse: '12 rue de Strasbourg',
            codePostal: '44000',
            ville: 'Nantes',
            latitude: 47.215936,
            longitude: -1.551073,
            etage: '2e etage, aile est',
            consignes: 'Cle dans la boite a cle, code communique la veille.',
          },
        ],
      },
    },
  });

  // Un second SAAD : le client signe, l'intervention a lieu chez le beneficiaire.
  const saad = await prisma.client.upsert({
    where: { siret: '51938274600021' },
    update: {
      raisonSociale: 'Domicile Plus (SAAD)',
      type: 'SAAD',
      statutReglementaire: 'DECLARE_SAP',
      numeroSap: 'SAP519382746',
    },
    create: {
      agenceId: agence.id,
      raisonSociale: 'Domicile Plus (SAAD)',
      siret: '51938274600021',
      type: 'SAAD',
      // Simple declaration : l'autre regime, pour que la demonstration montre
      // les deux justificatifs plutot que deux fois le meme.
      statutReglementaire: 'DECLARE_SAP',
      numeroSap: 'SAP519382746',
      conventionCollective: 'Branche aide a domicile (BAD) - a confirmer avec la paie',
      contactNom: 'Responsable de secteur',
      contactEmail: 'secteur@domicile-plus.example',
      contactTel: '0240000002',
      lieux: {
        create: [
          {
            type: 'DOMICILE_BENEFICIAIRE',
            libelle: 'Domicile - secteur Doulon',
            adresse: '5 rue du Moulin',
            codePostal: '44300',
            ville: 'Nantes',
            latitude: 47.2401,
            longitude: -1.5122,
            etage: '3e sans ascenseur',
            codeAcces: 'A1234',
            beneficiaireRef: 'BEN-0147',
          },
          {
            type: 'DOMICILE_BENEFICIAIRE',
            libelle: 'Domicile - secteur Reze',
            adresse: '28 avenue des Sorinieres',
            codePostal: '44400',
            ville: 'Reze',
            latitude: 47.1836,
            longitude: -1.5494,
            beneficiaireRef: 'BEN-0233',
          },
        ],
      },
    },
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
      qualifications: ['AVS'],
      // Le profil le plus solide du jeu : huit ans de terrain, au-dela du
      // plafond de cinq ans, donc au maximum de la composante.
      experiences: [
        {
          employeur: 'ADMR Loire-Atlantique',
          intitule: 'Auxiliaire de vie',
          qualification: 'AVS',
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
      qualifications: ['AVS'],
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
          employeur: 'SAAD Les Glycines',
          intitule: 'Auxiliaire de vie sociale',
          qualification: 'AVS',
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
    { email: 'secteur@les-tilleuls.example', role: 'CLIENT', clientId: saadTilleuls.id },
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

  // Deux besoins ouverts, chez deux SAAD differents : un en soins, un en aide
  // a domicile, soit un par diplome du referentiel.
  const deas = await prisma.qualification.findUniqueOrThrow({ where: { code: 'DEAS' } });
  const avs = await prisma.qualification.findUniqueOrThrow({ where: { code: 'AVS' } });
  const lieuTilleuls = await prisma.lieuIntervention.findFirstOrThrow({
    where: { clientId: saadTilleuls.id },
  });
  const lieuDomicile = await prisma.lieuIntervention.findFirstOrThrow({
    where: { clientId: saad.id },
  });

  await prisma.mission.upsert({
    where: { reference: 'M-2026-0001' },
    // Le diplome exige est reecrit et pas seulement pose a la creation : sans
    // cela, une base semee avant la reduction du referentiel garderait un
    // rattachement vers une ligne que l'elagage ne pourrait plus retirer.
    update: { qualificationRequiseId: deas.id },
    create: {
      reference: 'M-2026-0001',
      agenceId: agence.id,
      clientId: saadTilleuls.id,
      lieuId: lieuTilleuls.id,
      qualificationRequiseId: deas.id,
      statut: 'PUBLIEE',
      dateDebut: new Date('2026-09-15'),
      dateFin: new Date('2026-09-19'),
      heureDebut: '06:45',
      heureFin: '14:15',
      motifRecours: "Remplacement d'un salarie absent",
      description: 'Accompagnement d une personne en situation de handicap, transfert au leve.',
      tauxHoraire: '13.5000',
      coefficient: '1.950',
    },
  });

  await prisma.mission.upsert({
    where: { reference: 'M-2026-0002' },
    update: { qualificationRequiseId: avs.id },
    create: {
      reference: 'M-2026-0002',
      agenceId: agence.id,
      clientId: saad.id,
      lieuId: lieuDomicile.id,
      qualificationRequiseId: avs.id,
      statut: 'PUBLIEE',
      dateDebut: new Date('2026-09-14'),
      dateFin: new Date('2026-09-20'),
      heureDebut: '08:00',
      heureFin: '11:00',
      motifRecours: 'Accroissement temporaire d activite',
      description: 'Aide au lever, toilette, preparation du repas. 3e sans ascenseur.',
      tauxHoraire: '12.2000',
      coefficient: '1.880',
    },
  });

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

  const compteurs = {
    qualifications: await prisma.qualification.count(),
    clients: await prisma.client.count(),
    lieux: await prisma.lieuIntervention.count(),
    candidats: await prisma.candidat.count(),
    experiences: await prisma.experienceProfessionnelle.count(),
    utilisateurs: await prisma.utilisateur.count(),
    missions: await prisma.mission.count(),
  };

  console.log('Jeu de donnees en place :', compteurs);
  console.log(`Comptes de demonstration : mot de passe "${MOT_DE_PASSE_DEMO}"`);
}

main()
  .catch((erreur) => {
    console.error(erreur);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
