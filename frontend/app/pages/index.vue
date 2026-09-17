<script setup lang="ts">
import type { CandidatResume, PageResultat } from '@releve/shared';

const { requete } = useApi();

const recherche = ref('');

const { data, status, error, refresh } = await useAsyncData<PageResultat<CandidatResume>>(
  'vivier',
  () =>
    requete<PageResultat<CandidatResume>>('/candidats', {
      query: {
        ...(recherche.value ? { recherche: recherche.value } : {}),
        limite: 20,
      },
    }),
  { watch: [recherche] },
);

const candidats = computed(() => data.value?.donnees ?? []);
const chargement = computed(() => status.value === 'pending');
</script>

<template>
  <section class="vivier">
    <div class="titre">
      <h1>Vivier candidats</h1>
      <p class="compte">{{ data?.total ?? 0 }} candidat(s)</p>
    </div>

    <form class="filtres" @submit.prevent="refresh()">
      <label class="grandir">
        <span>Recherche</span>
        <input
          id="filtre-recherche"
          v-model="recherche"
          type="search"
          placeholder="Nom, prenom, ville"
        />
      </label>

      <button type="submit">Filtrer</button>
    </form>

    <p v-if="error" class="alerte">
      API injoignable. Lancer <code>pnpm infra:up</code> puis <code>pnpm dev:backend</code>, et
      verifier que la base est migree (<code>pnpm db:migrate</code>).
    </p>

    <p v-else-if="chargement" class="vide">Chargement...</p>

    <p v-else-if="!candidats.length" class="vide">
      Aucun candidat. Charger le jeu de donnees avec <code>pnpm db:seed</code>.
    </p>

    <ul v-else class="liste">
      <li v-for="candidat in candidats" :key="candidat.id" class="carte">
        <div class="identite">
          <NuxtLink class="nom" :to="`/candidats/${candidat.id}`">
            {{ candidat.prenom }} {{ candidat.nom }}
          </NuxtLink>
          <p class="lieu">
            {{ candidat.codePostal }} {{ candidat.ville }} &middot; rayon {{ candidat.rayonKm }} km
          </p>
        </div>

        <p class="qualifs">
          <span v-for="code in candidat.qualifications" :key="code" class="qualif">{{ code }}</span>
          <span v-if="!candidat.qualifications.length" class="qualif vide-qualif"
            >aucune qualification verifiee</span
          >
        </p>

        <p class="mobilite">
          {{ candidat.permisB ? 'Permis B' : 'Sans permis' }}
          <template v-if="candidat.vehicule"> &middot; vehicule</template>
        </p>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.vivier {
  padding-block: 32px 0;
}

.titre {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px 14px;
  margin-bottom: 20px;
}

h1 {
  margin: 0;
  font-size: 1.6rem;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.compte {
  margin: 0;
  font-family: var(--mono);
  font-size: 12px;
  color: var(--muted);
}

.filtres {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: end;
  padding: 16px;
  background: var(--surface);
  border: 1px solid var(--line);
  margin-bottom: 22px;
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

.filtres .grandir {
  flex: 1;
  min-width: 180px;
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

button:hover {
  opacity: 0.9;
}

.liste {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 1px;
  background: var(--line);
  border: 1px solid var(--line);
}

.carte {
  background: var(--surface);
  padding: 16px 18px;
  display: grid;
  grid-template-columns: minmax(180px, 2fr) auto minmax(140px, 1fr) auto;
  gap: 10px 18px;
  align-items: center;
}

@media (max-width: 720px) {
  .carte {
    grid-template-columns: 1fr;
    align-items: start;
  }
}

.nom {
  font-weight: 700;
  color: var(--ink);
  text-decoration: none;
}

.nom:hover {
  color: var(--dom);
  text-decoration: underline;
}

.lieu,
.mobilite {
  margin: 0;
  font-family: var(--mono);
  font-size: 11.5px;
  color: var(--muted);
}

.pastilles {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.pastille {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 3px 8px;
  border-radius: 2px;
  border: 1px solid;
}

.pastille.dom {
  color: var(--dom);
  background: var(--dom-soft);
  border-color: var(--dom);
}

.pastille.eta {
  color: var(--eta);
  background: var(--eta-soft);
  border-color: var(--eta);
}

.qualifs {
  margin: 0;
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.qualif {
  font-family: var(--mono);
  font-size: 11px;
  padding: 2px 7px;
  background: var(--surface-2);
  border-radius: 2px;
}

.vide-qualif {
  color: var(--muted);
  background: transparent;
  border: 1px dashed var(--line);
}

.vide,
.alerte {
  font-size: 0.92rem;
  color: var(--muted);
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
