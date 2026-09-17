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
        "Les missions d'intérim en aide à domicile et en établissement proposées par Relève : aide-soignant, auxiliaire de vie.",
    },
  ],
});

const { requete } = useApi();

const departement = ref('');
const ville = ref('');
const metier = ref('');
const page = ref(1);

const { data: options } = await useAsyncData('offres-options', () =>
  requete<OptionsVitrine>('/offres/options'),
);

const { data, pending, error, refresh } = await useAsyncData(
  'offres-missions',
  () =>
    requete<PageResultat<MissionVitrine>>('/offres', {
      query: {
        page: page.value,
        limite: 20,
        ...(departement.value ? { departement: departement.value } : {}),
        ...(ville.value ? { ville: ville.value } : {}),
        ...(metier.value ? { metier: metier.value } : {}),
      },
    }),
  { watch: [page] },
);

const missions = computed(() => data.value?.donnees ?? []);
const total = computed(() => data.value?.total ?? 0);
const pages = computed(() => Math.max(1, Math.ceil(total.value / (data.value?.limite || 20))));

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

/** Un changement de filtre repart de la première page : sinon la liste s'ouvre
 * sur une page qui n'existe plus dans le nouveau résultat. */
function filtrer() {
  page.value = 1;
  refresh();
}

function reinitialiser() {
  departement.value = '';
  ville.value = '';
  metier.value = '';
  filtrer();
}

const filtresActifs = computed(() => Boolean(departement.value || ville.value || metier.value));

function allerA(cible: number) {
  page.value = Math.min(pages.value, Math.max(1, cible));
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

function taux(mission: MissionVitrine): string {
  return mission.tauxHoraire === null
    ? 'Rémunération selon profil'
    : `${mission.tauxHoraire.toFixed(2).replace('.', ',')} € brut / heure`;
}
</script>

<template>
  <main class="vitrine offres">
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

    <p v-else-if="pending" class="vide">Chargement des offres…</p>

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
            <li v-if="mission.typeLieu === 'ETABLISSEMENT'">En établissement</li>
            <li v-else>À domicile</li>
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

      <nav v-if="pages > 1" class="pagination" aria-label="Pages d'offres">
        <button type="button" :disabled="page <= 1" @click="allerA(page - 1)">Précédent</button>
        <span>Page {{ page }} sur {{ pages }}</span>
        <button type="button" :disabled="page >= pages" @click="allerA(page + 1)">Suivant</button>
      </nav>
    </template>
  </main>
</template>

<style scoped>
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

.filtres label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
}

.filtres select {
  min-width: 190px;
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
