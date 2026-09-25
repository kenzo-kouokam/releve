<script setup lang="ts">
import type { MissionResume, PageResultat, StatutMission } from '@releve/shared';

/**
 * Les besoins déposés, vus par l'agence.
 *
 * Cet écran manquait, et son absence se voyait à l'usage : le moteur de
 * rapprochement était écrit, testé et exposé par l'API, mais aucune page ne
 * l'appelait. L'agence pouvait consulter son vivier et ses clients, jamais les
 * besoins à pourvoir — le seul chemin qui fonctionnait dans le produit était
 * candidat → établissement, l'intermédiaire restant spectateur.
 */
useHead({ title: 'Besoins à pourvoir - Relève' });

const { requete } = useApi();

/** Les états où une mission cherche encore quelqu'un. */
const OUVERTS: StatutMission[] = ['PUBLIEE', 'EN_MATCHING', 'PROPOSEE'];

const statut = ref<StatutMission | ''>('');

const { data, status } = await useAsyncData<PageResultat<MissionResume>>(
  'besoins',
  () =>
    requete<PageResultat<MissionResume>>('/missions', {
      query: { ...(statut.value ? { statut: statut.value } : {}), limite: 50 },
    }),
  { watch: [statut] },
);

const missions = computed(() => data.value?.donnees ?? []);
const chargement = computed(() => status.value === 'pending');

/** À pourvoir d'abord, et parmi elles les plus proches : c'est l'ordre du travail. */
const ordonnees = computed(() =>
  [...missions.value].sort((a, b) => {
    const urgence = Number(OUVERTS.includes(b.statut)) - Number(OUVERTS.includes(a.statut));

    return urgence !== 0 ? urgence : a.dateDebut.localeCompare(b.dateDebut);
  }),
);

const aPourvoir = computed(() => missions.value.filter((m) => OUVERTS.includes(m.statut)).length);

/** Dans combien de jours, pour repérer l'urgence sans compter sur ses doigts. */
function echeance(dateDebut: string): { texte: string; urgent: boolean } {
  const jours = Math.round(
    (new Date(`${dateDebut}T00:00:00`).getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000,
  );

  if (jours < 0) return { texte: 'passée', urgent: false };
  if (jours === 0) return { texte: "aujourd'hui", urgent: true };
  if (jours === 1) return { texte: 'demain', urgent: true };

  return { texte: `dans ${jours} jours`, urgent: jours <= 2 };
}
</script>

<template>
  <section class="besoins">
    <header class="tete">
      <div>
        <h1>Besoins à pourvoir</h1>
        <p class="compte">
          {{ aPourvoir }} ouvert{{ aPourvoir > 1 ? 's' : '' }} sur {{ missions.length }} affiché{{
            missions.length > 1 ? 's' : ''
          }}
        </p>
      </div>

      <label class="filtre">
        <span>Statut</span>
        <select v-model="statut">
          <option value="">Tous</option>
          <option value="PUBLIEE">Publiée</option>
          <option value="PROPOSEE">Proposée</option>
          <option value="VALIDEE">Pourvue</option>
          <option value="ANNULEE">Annulée</option>
        </select>
      </label>
    </header>

    <p v-if="chargement" class="vide">Chargement…</p>
    <p v-else-if="!missions.length" class="vide">Aucun besoin ne correspond à ce filtre.</p>

    <ul v-else class="liste">
      <li v-for="mission in ordonnees" :key="mission.id">
        <NuxtLink :to="`/besoins/${mission.id}`" class="ligne">
          <div class="identite">
            <p class="reference">{{ mission.reference }}</p>
            <p class="client">{{ mission.client.raisonSociale }}</p>
            <p class="lieu">{{ mission.lieu.libelle }} · {{ mission.lieu.ville }}</p>
          </div>

          <div class="quand">
            <p class="date">{{ mission.dateDebut }}</p>
            <p class="heures">{{ mission.heureDebut }}–{{ mission.heureFin }}</p>
            <p class="delai" :class="{ urgent: echeance(mission.dateDebut).urgent }">
              {{ echeance(mission.dateDebut).texte }}
            </p>
          </div>

          <div class="etat">
            <span class="diplome">{{ mission.qualificationRequise.code }}</span>
            <span class="statut" :class="mission.statut.toLowerCase()">{{ mission.statut }}</span>
            <span v-if="mission.candidaturesEnAttente > 0" class="attente">
              {{ mission.candidaturesEnAttente }} à trancher
            </span>
          </div>
        </NuxtLink>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.besoins {
  display: grid;
  gap: 20px;
}

.tete {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: flex-end;
  justify-content: space-between;
}

h1 {
  margin: 0;
  font-size: 1.5rem;
}

.compte {
  margin: 4px 0 0;
  font-size: 0.9rem;
  color: var(--muted);
}

.filtre {
  display: grid;
  gap: 4px;
  font-size: 0.78rem;
  color: var(--muted);
}

.filtre select {
  padding: 7px 10px;
  font-size: 0.9rem;
}

.liste {
  display: grid;
  gap: 2px;
  padding: 0;
  margin: 0;
  list-style: none;
  background: var(--line);
  border: 1px solid var(--line);
  border-radius: 12px;
  overflow: hidden;
}

.ligne {
  display: grid;
  grid-template-columns: 1.6fr 1fr auto;
  gap: 16px;
  align-items: center;
  padding: 14px 18px;
  color: inherit;
  text-decoration: none;
  background: var(--surface);
}

.ligne:hover {
  background: var(--ground);
}

.ligne:focus-visible {
  outline: 2px solid var(--dom);
  outline-offset: -2px;
}

.reference {
  margin: 0;
  font-family: var(--mono);
  font-size: 0.78rem;
  color: var(--muted);
}

.client {
  margin: 2px 0 0;
  font-weight: 600;
}

.lieu,
.heures {
  margin: 2px 0 0;
  font-size: 0.85rem;
  color: var(--muted);
}

.date {
  margin: 0;
  font-variant-numeric: tabular-nums;
}

.delai {
  margin: 2px 0 0;
  font-size: 0.8rem;
  color: var(--muted);
}

.delai.urgent {
  font-weight: 600;
  color: var(--eta);
}

.etat {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: flex-end;
}

.diplome,
.statut,
.attente {
  padding: 3px 9px;
  font-family: var(--mono);
  font-size: 0.66rem;
  letter-spacing: 0.05em;
  border-radius: 999px;
}

.diplome {
  color: var(--dom-encre);
  background: var(--dom-soft);
}

.statut {
  color: var(--muted);
  background: var(--ground);
  border: 1px solid var(--line);
}

.statut.publiee,
.statut.proposee {
  color: var(--dom-encre);
  border-color: var(--dom);
}

.attente {
  color: var(--ambre-encre);
  background: var(--ambre);
}

.vide {
  padding: 22px;
  color: var(--muted);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 12px;
}

@media (max-width: 720px) {
  .ligne {
    grid-template-columns: 1fr;
    gap: 8px;
  }

  .etat {
    justify-content: flex-start;
  }
}
</style>
