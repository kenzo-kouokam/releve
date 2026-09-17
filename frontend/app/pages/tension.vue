<script setup lang="ts">
import type { Barometre } from '@releve/shared';

useHead({ title: 'Tension du marché — Relève' });

const { requete } = useApi();

const jours = ref(30);
const departement = ref('');

const { data, pending, error, refresh } = await useAsyncData(
  'tension',
  () =>
    requete<Barometre>('/tension', {
      query: {
        jours: jours.value,
        ...(departement.value ? { departement: departement.value } : {}),
      },
    }),
  { watch: [jours] },
);

const metiers = computed(() => data.value?.metiers ?? []);

const total = computed(() =>
  metiers.value.reduce(
    (cumul, metier) => ({
      offres: cumul.offres + metier.offres,
      sansSalaire: cumul.sansSalaire + metier.offresSansSalaire,
    }),
    { offres: 0, sansSalaire: 0 },
  ),
);

/** Part du marche sur laquelle la mediane est reellement calculee. */
const couverture = computed(() =>
  total.value.offres
    ? Math.round(((total.value.offres - total.value.sansSalaire) / total.value.offres) * 100)
    : 0,
);

function largeurBarre(offres: number): string {
  const maximum = Math.max(...metiers.value.map((metier) => metier.offres), 1);

  return `${Math.max(4, Math.round((offres / maximum) * 100))}%`;
}
</script>

<template>
  <section class="tension">
    <div class="titre">
      <h1>Tension du marché</h1>
      <p class="source">
        Offres d'intérim publiées sur France Travail &middot; métiers du secteur
        <span v-if="data?.depuisLeCache" class="cache">servi par le cache</span>
      </p>
    </div>

    <form class="filtres" @submit.prevent="refresh()">
      <label>
        <span>Période</span>
        <select id="jours" v-model.number="jours">
          <option :value="7">7 jours</option>
          <option :value="30">30 jours</option>
          <option :value="90">90 jours</option>
        </select>
      </label>

      <label>
        <span>Département</span>
        <input
          id="departement"
          v-model="departement"
          type="text"
          inputmode="numeric"
          placeholder="44"
          maxlength="3"
        />
      </label>

      <button type="submit">Filtrer</button>
    </form>

    <p v-if="error" class="alerte">
      Baromètre indisponible. Lancer un import avec
      <code>pnpm cli importer:offres</code>.
    </p>

    <p v-else-if="pending" class="vide">Calcul en cours...</p>

    <p v-else-if="!metiers.length" class="vide">
      Aucune offre collectée sur cette période. Lancer
      <code>pnpm cli importer:offres --jours 30</code>, ou rejouer l'instantané livré avec
      <code>--fichier donnees/offres-echantillon.json</code>.
    </p>

    <template v-else>
      <p class="couverture">
        <strong>{{ total.offres }} offres</strong> retenues après nettoyage et dédoublonnage. La
        médiane ne porte que sur les <strong>{{ couverture }} %</strong> qui annoncent une
        rémunération — sur ce secteur, plus de la moitié des offres n'en affichent aucune.
      </p>

      <div class="scroller">
        <table>
          <thead>
            <tr>
              <th scope="col">Métier</th>
              <th scope="col">Dép.</th>
              <th scope="col" class="nombre">Offres</th>
              <th scope="col" class="nombre">Postes</th>
              <th scope="col" class="nombre">Médiane</th>
              <th scope="col">Fourchette</th>
              <th scope="col" class="nombre">Expérience</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="metier in metiers" :key="`${metier.romeCode}-${metier.departement}`">
              <th scope="row">
                <span class="rome">{{ metier.romeCode }}</span>
                {{ (metier.romeLibelle.split('/')[0] ?? metier.romeLibelle).trim() }}
              </th>
              <td class="dept">{{ metier.departement }}</td>
              <td class="nombre">
                <span class="barre" :style="{ width: largeurBarre(metier.offres) }"></span>
                {{ metier.offres }}
              </td>
              <td class="nombre">{{ metier.postes }}</td>
              <td class="nombre median">
                <template v-if="metier.tauxHoraireMedian">
                  {{ metier.tauxHoraireMedian.toFixed(2) }} €
                </template>
                <span
                  v-else
                  class="absent"
                  :title="`${metier.offresSansSalaire} offres sans salaire annoncé`"
                >
                  —
                </span>
              </td>
              <td class="fourchette">
                <template v-if="metier.tauxHoraireMin && metier.tauxHoraireMax">
                  {{ metier.tauxHoraireMin.toFixed(2) }} – {{ metier.tauxHoraireMax.toFixed(2) }} €
                </template>
                <span v-else class="absent">—</span>
              </td>
              <td class="nombre">{{ metier.partExperienceExigee }} %</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p class="note">
        Ces médianes alimentent le taux horaire proposé à l'entreprise au moment où elle crée une
        mission : elle voit ce que paie le marché autour d'elle plutôt que de deviner.
      </p>
    </template>
  </section>
</template>

<style scoped>
.tension {
  padding-block: 32px 0;
}

.titre {
  margin-bottom: 20px;
}

h1 {
  margin: 0 0 4px;
  font-size: 1.6rem;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.source {
  margin: 0;
  font-family: var(--mono);
  font-size: 12px;
  color: var(--muted);
}

.cache {
  margin-left: 8px;
  padding: 1px 7px;
  border-radius: 2px;
  background: var(--dom-soft);
  color: var(--dom);
}

.filtres {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: end;
  padding: 16px;
  background: var(--surface);
  border: 1px solid var(--line);
  margin-bottom: 18px;
}

.filtres label {
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}

select,
input {
  font-family: var(--sans);
  font-size: 0.92rem;
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-radius: 3px;
  background: var(--ground);
  color: var(--ink);
}

button {
  font-family: var(--sans);
  font-size: 0.9rem;
  font-weight: 700;
  padding: 9px 18px;
  border: 0;
  border-radius: 3px;
  background: var(--dom);
  color: var(--surface);
  cursor: pointer;
}

.couverture {
  margin: 0 0 16px;
  font-size: 0.9rem;
  color: var(--muted);
  line-height: 1.55;
  max-width: 72ch;
}

.couverture strong {
  color: var(--ink);
}

.scroller {
  overflow-x: auto;
  border: 1px solid var(--line);
  background: var(--surface);
}

table {
  border-collapse: collapse;
  width: 100%;
  min-width: 640px;
  font-size: 0.88rem;
}

th,
td {
  text-align: left;
  padding: 10px 14px;
  border-bottom: 1px solid var(--line);
}

thead th {
  font-family: var(--mono);
  font-size: 10.5px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-weight: 500;
  color: var(--muted);
  background: var(--surface-2);
}

tbody th {
  font-weight: 700;
  color: var(--ink);
}

.rome {
  font-family: var(--mono);
  font-size: 10.5px;
  color: var(--muted);
  margin-right: 8px;
}

.dept {
  font-family: var(--mono);
  font-size: 12px;
}

.nombre {
  text-align: right;
  font-variant-numeric: tabular-nums;
  position: relative;
}

.median {
  font-weight: 700;
  color: var(--dom);
}

.fourchette {
  font-family: var(--mono);
  font-size: 11.5px;
  color: var(--muted);
  white-space: nowrap;
}

/* La barre situe le volume d'un coup d'oeil, sans ajouter de colonne. */
.barre {
  position: absolute;
  left: 6px;
  bottom: 4px;
  height: 3px;
  background: var(--dom);
  opacity: 0.35;
  border-radius: 2px;
}

.absent {
  color: var(--muted);
}

tbody tr:last-child th,
tbody tr:last-child td {
  border-bottom: 0;
}

.note,
.vide,
.alerte {
  font-size: 0.88rem;
  color: var(--muted);
  line-height: 1.5;
}

.note {
  margin-top: 16px;
  max-width: 72ch;
}

.vide,
.alerte {
  padding: 18px;
  background: var(--surface);
  border: 1px solid var(--line);
}

.alerte {
  border-left: 3px solid var(--eta);
}

code {
  font-family: var(--mono);
  font-size: 0.86em;
  background: var(--surface-2);
  padding: 1px 5px;
  border-radius: 2px;
}
</style>
