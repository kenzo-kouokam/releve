<script setup lang="ts">
import type { MissionVitrine, OptionsVitrine, PageResultat } from '@releve/shared';

/**
 * Nos offres d'emploi : les missions déposées par les établissements clients.
 *
 * Page publique et ouverte, c'est tout son intérêt — un candidat doit pouvoir
 * voir ce qui se cherche autour de lui avant de créer un compte.
 *
 * Elle ne montre que des missions Relève. Les offres collectées sur France
 * Travail ne s'affichent pas ici : elles appartiennent à d'autres employeurs et
 * apparaissent seulement, source citée, dans l'espace d'un candidat identifié.
 */

useHead({
  title: "Nos offres d'emploi — Relève",
  meta: [
    {
      name: 'description',
      content:
        "Les missions d'intérim en EHPAD, hôpital et clinique proposées par Relève : aide-soignant, accompagnant éducatif et social.",
    },
  ],
});

const { requete } = useApi();

const departement = ref('');
const ville = ref('');
const metier = ref('');

/**
 * Chargement progressif plutôt que pagination numérotée.
 *
 * Trois offres d'abord, puis trois de plus à chaque clic. La liste publique
 * n'est pas un catalogue à parcourir : elle doit donner envie de créer un
 * compte, et une première page courte le fait mieux qu'un mur de vingt cartes.
 * « Page 2 sur 4 » posait en plus une question que le visiteur n'a pas — il ne
 * cherche pas une page, il cherche à en voir un peu plus.
 *
 * Le nombre visible sert directement de `limite`, et la requête repart toujours
 * de la première page. Le résultat est donc reconstruit en entier à chaque
 * clic : quelques dizaines de lignes, aucune accumulation à gérer côté client,
 * et pas de risque de doublon si une mission est publiée entre deux clics.
 */
const PAR_FOURNEE = 3;

const visibles = ref(PAR_FOURNEE);

const { data: options } = await useAsyncData('offres-options', () =>
  requete<OptionsVitrine>('/offres/options'),
);

const { data, pending, error, refresh } = await useAsyncData(
  'offres-missions',
  () =>
    requete<PageResultat<MissionVitrine>>('/offres', {
      query: {
        page: 1,
        limite: visibles.value,
        ...(departement.value ? { departement: departement.value } : {}),
        ...(ville.value ? { ville: ville.value } : {}),
        ...(metier.value ? { metier: metier.value } : {}),
      },
    }),
  { watch: [visibles] },
);

const missions = computed(() => data.value?.donnees ?? []);
const total = computed(() => data.value?.total ?? 0);

/** Reste-t-il quelque chose à montrer ? Sinon le bouton n'a pas lieu d'être. */
const encore = computed(() => missions.value.length < total.value);

/** Ce que le bouton annonce : « Voir les 4 offres suivantes », pas « Suivant ». */
const restantes = computed(() => Math.min(PAR_FOURNEE, total.value - missions.value.length));

/**
 * Les villes proposées suivent le département choisi. Sans ce filtrage, le menu
 * afficherait des communes qui, combinées au département retenu, ne rendraient
 * jamais rien.
 */
const villesProposees = computed(() => {
  const toutes = options.value?.villes ?? [];

  return departement.value
    ? toutes.filter((lieu) => lieu.departement === departement.value)
    : toutes;
});

/** Changer de département invalide la ville retenue si elle n'y est plus. */
watch(departement, () => {
  if (ville.value && !villesProposees.value.some((lieu) => lieu.nom === ville.value)) {
    ville.value = '';
  }
});

/** Un changement de filtre repart d'une fournée : sinon la liste garderait la
 * hauteur qu'elle avait pour un résultat qui n'a plus rien à voir. */
function filtrer() {
  if (visibles.value === PAR_FOURNEE) {
    // `watch` ne se déclenche pas sur une valeur inchangée, et un filtre
    // appliqué depuis la première fournée ne rendrait alors rien de nouveau.
    refresh();

    return;
  }

  visibles.value = PAR_FOURNEE;
}

function reinitialiser() {
  departement.value = '';
  ville.value = '';
  metier.value = '';
  filtrer();
}

const filtresActifs = computed(() => Boolean(departement.value || ville.value || metier.value));

function voirPlus() {
  visibles.value += PAR_FOURNEE;
}

const jourCourt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });

/** Une mission d'un seul jour ne mérite pas « du 23 sept. au 23 sept. ». */
function periode(mission: MissionVitrine): string {
  const debut = new Date(mission.dateDebut);
  const fin = new Date(mission.dateFin);

  return debut.getTime() === fin.getTime()
    ? jourCourt.format(debut)
    : `${jourCourt.format(debut)} → ${jourCourt.format(fin)}`;
}

/**
 * Les offres affichees, balisees en `JobPosting`.
 *
 * Reactif et non fige : la liste s'allonge au fil des clics sur « voir plus »
 * et se refait a chaque filtre. Un balisage calcule une seule fois decrirait
 * alors trois offres quand la page en montre neuf — un ecart entre ce que la
 * page dit et ce qu'elle montre, qui est exactement ce que les moteurs
 * penalisent.
 *
 * `useDonneesStructurees` relit donc la fonction a chaque changement, et rien
 * n'est emis tant que l'API n'a pas repondu.
 */
const site = useUrlSite();

/** Le chemin affiche en tete de page, et balise par le composant. */
const FIL = [{ libelle: 'Accueil', to: '/accueil' }, { libelle: "Nos offres d'emploi" }];

useDonneesStructurees(() => [
  pageWeb(site, {
    chemin: '/offres',
    type: 'CollectionPage',
    titre: "Nos offres d'emploi en intérim — Relève",
    description:
      "Les missions d'intérim en EHPAD, hôpital et clinique proposées par Relève : aide-soignant, accompagnant éducatif et social.",
  }),
  ...(missions.value.length ? [listeOffres(site, '/offres', missions.value)] : []),
]);

function taux(mission: MissionVitrine): string {
  return mission.tauxHoraire === null
    ? 'Rémunération selon profil'
    : `${mission.tauxHoraire.toFixed(2).replace('.', ',')} € brut / heure`;
}
</script>

<template>
  <main class="vitrine offres">
    <AppFilAriane :etapes="FIL" />

    <p class="vitrine-accroche">Nos offres</p>
    <h1 class="vitrine-titre">Les offres d'intérim du secteur</h1>
    <p class="vitrine-chapeau">
      Les missions d'intérim de l'aide à la personne proposées par Relève.
      <NuxtLink to="/fonctionnement">Voir comment postuler avec Relève</NuxtLink>.
    </p>

    <form class="filtres" @submit.prevent="filtrer()">
      <label>
        <span>Département</span>
        <select v-model="departement">
          <option value="">Tous les départements</option>
          <option
            v-for="option in options?.departements ?? []"
            :key="option.code"
            :value="option.code"
          >
            {{ option.libelle }} ({{ option.missions }})
          </option>
        </select>
      </label>

      <label>
        <span>Ville</span>
        <select v-model="ville">
          <option value="">Toutes les villes</option>
          <option v-for="option in villesProposees" :key="option.nom" :value="option.nom">
            {{ option.nom }} ({{ option.missions }})
          </option>
        </select>
      </label>

      <label>
        <span>Métier</span>
        <select v-model="metier">
          <option value="">Tous les métiers</option>
          <option v-for="option in options?.metiers ?? []" :key="option.code" :value="option.code">
            {{ option.libelle }} ({{ option.missions }})
          </option>
        </select>
      </label>

      <button type="submit">Filtrer</button>
      <button v-if="filtresActifs" type="button" class="effacer" @click="reinitialiser()">
        Effacer
      </button>
    </form>

    <p v-if="error" class="alerte">
      Les offres sont momentanément indisponibles. Réessayer dans un instant.
    </p>

    <p v-else-if="pending && !missions.length" class="vide">Chargement des offres…</p>

    <p v-else-if="!missions.length" class="vide">
      <template v-if="filtresActifs">
        Aucune mission ne correspond à ces critères.
        <button type="button" class="lien-effacer" @click="reinitialiser()">
          Voir toutes les offres
        </button>
      </template>
      <template v-else>
        Aucune mission ouverte pour le moment.
        <NuxtLink to="/inscription/interimaire">Créer un compte</NuxtLink>
        pour être prévenu dès qu'une mission correspond à votre profil.
      </template>
    </p>

    <template v-else>
      <p class="compte">
        <strong>{{ total }}</strong> mission{{ total > 1 ? 's' : '' }} ouverte{{
          total > 1 ? 's' : ''
        }}
      </p>

      <ul class="liste">
        <li v-for="mission in missions" :key="mission.id" class="mission">
          <div class="entete">
            <h2>{{ mission.metier }}</h2>
            <span class="periode">{{ periode(mission) }}</span>
          </div>

          <p class="lieu">
            {{ mission.secteur }} &middot; {{ mission.ville }} ({{ mission.departement }})
          </p>

          <ul class="attributs">
            <li>{{ mission.heureDebut }} – {{ mission.heureFin }}</li>
            <li v-if="mission.travailNuit">Travail de nuit</li>
            <li v-if="mission.typeLieu === 'UNITE_PROTEGEE'">Unité protégée</li>
            <li v-else>Hébergement</li>
          </ul>

          <p v-if="mission.description" class="description">{{ mission.description }}</p>

          <div class="pied">
            <span class="taux" :class="{ absent: mission.tauxHoraire === null }">
              {{ taux(mission) }}
            </span>
            <NuxtLink to="/connexion" class="postuler">Postuler</NuxtLink>
          </div>
        </li>
      </ul>

      <!--
        `aria-live` sur le compte plus haut ne suffirait pas : c'est la liste qui
        s'allonge, et une personne au lecteur d'écran doit savoir combien de
        lignes viennent d'apparaître sans avoir à la reparcourir.
      -->
      <div v-if="encore" class="voir-plus">
        <button type="button" :disabled="pending" @click="voirPlus()">
          {{ pending ? 'Chargement…' : `Voir ${restantes} offre${restantes > 1 ? 's' : ''} de plus` }}
        </button>
        <p class="reste">{{ missions.length }} sur {{ total }} affichées</p>
      </div>

      <p v-else-if="total > PAR_FOURNEE" class="reste fin">
        Toutes les offres ouvertes sont affichées.
      </p>
    </template>
  </main>
</template>

<style scoped>
.voir-plus {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
  margin-top: 28px;
}

.voir-plus button {
  padding: 11px 22px;
  font: inherit;
  font-weight: 600;
  color: var(--text);
  cursor: pointer;
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 10px;
}

.voir-plus button:hover:not(:disabled) {
  border-color: var(--dom);
}

.voir-plus button:disabled {
  color: var(--muted);
  cursor: default;
}

.reste {
  margin: 0;
  font-size: 12px;
  color: var(--muted);
  text-align: center;
}

.reste.fin {
  margin-top: 28px;
}

.filtres {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: flex-end;
  margin-bottom: 32px;
  padding: 20px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 14px;
}

/* `min-width: 0` n'est pas une precaution : un item de flex refuse par defaut
 * de descendre sous la largeur de son contenu, et le contenu d un menu
 * deroulant, c'est sa plus longue option — ici « Diplôme d'État d'accompagnant
 * éducatif et social ». Sans cette ligne, le bloc mesurait 374 px et debordait
 * de 35 px sur un ecran de 360 px. */
.filtres label {
  display: flex;
  flex: 1 1 190px;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  font-size: 13px;
  font-weight: 600;
}

.filtres select {
  width: 100%;
  min-width: 0;
  padding: 9px 12px;
  font: inherit;
  font-weight: 400;
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 9px;
}

.filtres button {
  padding: 10px 20px;
  font: inherit;
  font-weight: 600;
  color: var(--surface);
  background: var(--dom);
  border: 0;
  border-radius: 9px;
  cursor: pointer;
}

.filtres .effacer {
  color: var(--muted);
  background: transparent;
  border: 1px solid var(--line);
}

.compte {
  margin: 0 0 16px;
  font-size: 14px;
  color: var(--muted);
}

.liste {
  display: grid;
  gap: 14px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.mission {
  padding: 20px 22px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 14px;
}

.entete {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: baseline;
  justify-content: space-between;
}

.mission h2 {
  margin: 0;
  font-size: 17px;
  font-weight: 650;
  line-height: 1.3;
}

.periode {
  padding: 4px 11px;
  font-size: 12.5px;
  font-weight: 600;
  background: var(--bg);
  border-radius: 999px;
}

.lieu {
  margin: 6px 0 12px;
  font-size: 14px;
  color: var(--muted);
}

.attributs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0 0 12px;
  padding: 0;
  list-style: none;
}

.attributs li {
  padding: 4px 10px;
  font-size: 12.5px;
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 999px;
}

.description {
  margin: 0 0 14px;
  font-size: 14.5px;
  line-height: 1.6;
  color: var(--muted);
}

.pied {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
}

.taux {
  font-size: 15px;
  font-weight: 650;
}

.taux.absent {
  font-weight: 400;
  color: var(--muted);
}

.postuler {
  padding: 9px 20px;
  font-size: 14px;
  font-weight: 600;
  color: var(--surface);
  text-decoration: none;
  background: var(--dom);
  border-radius: 9px;
}

.pagination {
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: center;
  margin-top: 28px;
  font-size: 14px;
}

.pagination button {
  padding: 9px 18px;
  font: inherit;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 9px;
  cursor: pointer;
}

.pagination button:disabled {
  opacity: 0.45;
  cursor: default;
}

.lien-effacer {
  font: inherit;
  color: var(--dom);
  text-decoration: underline;
  background: none;
  border: 0;
  cursor: pointer;
}

.vide,
.alerte {
  padding: 28px;
  text-align: center;
  color: var(--muted);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 14px;
}
</style>
