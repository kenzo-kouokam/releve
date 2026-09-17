<script setup lang="ts">
import type { ClientResume, PageResultat } from '@releve/shared';
import { TYPE_CLIENT_LIBELLES } from '@releve/shared';

const { requete } = useApi();

const recherche = ref('');

const { data, status, error, refresh } = await useAsyncData<PageResultat<ClientResume>>(
  'clients',
  () =>
    requete<PageResultat<ClientResume>>('/clients', {
      query: {
        ...(recherche.value ? { recherche: recherche.value } : {}),
        limite: 20,
      },
    }),
);

const clients = computed(() => data.value?.donnees ?? []);
const chargement = computed(() => status.value === 'pending');

/** 489 291 736 00017 se lit mieux que 48929173600017 a l'ecran. */
function siretLisible(siret: string): string {
  return `${siret.slice(0, 3)} ${siret.slice(3, 6)} ${siret.slice(6, 9)} ${siret.slice(9)}`;
}
</script>

<template>
  <section class="clients">
    <div class="titre">
      <h1>Clients</h1>
      <p class="compte">{{ data?.total ?? 0 }} client(s)</p>
    </div>

    <form class="filtres" @submit.prevent="refresh()">
      <label class="grandir">
        <span>Recherche</span>
        <input
          id="filtre-recherche"
          v-model="recherche"
          type="search"
          placeholder="Raison sociale, SIRET, ville d intervention"
        />
      </label>

      <button type="submit">Filtrer</button>
    </form>

    <p v-if="error" class="alerte">
      API injoignable. Lancer <code>pnpm infra:up</code> puis <code>pnpm dev:backend</code>.
    </p>

    <p v-else-if="chargement" class="vide">Chargement...</p>

    <p v-else-if="!clients.length" class="vide">
      Aucun client. Charger le jeu de donnees avec <code>pnpm db:seed</code>.
    </p>

    <ul v-else class="liste">
      <li v-for="client in clients" :key="client.id" class="carte">
        <div class="identite">
          <NuxtLink class="nom" :to="`/clients/${client.id}`">{{ client.raisonSociale }}</NuxtLink>
          <p class="siret">SIRET {{ siretLisible(client.siret) }}</p>
        </div>

        <span class="pastille">{{ TYPE_CLIENT_LIBELLES[client.type] }}</span>

        <p class="convention">
          <template v-if="client.conventionCollective">
            {{ client.conventionCollective }}
            <template v-if="client.idcc"> &middot; IDCC {{ client.idcc }}</template>
          </template>
          <span v-else class="manquant">convention a renseigner</span>
        </p>

        <p class="lieux">
          {{ client.nombreLieux }} lieu(x)
          <span v-if="!client.actif" class="inactif">&middot; inactif</span>
        </p>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.clients {
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
  min-width: 200px;
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
  grid-template-columns: minmax(200px, 2fr) auto minmax(160px, 1.4fr) auto;
  gap: 10px 18px;
  align-items: center;
}

@media (max-width: 820px) {
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

.siret,
.convention,
.lieux {
  margin: 0;
  font-family: var(--mono);
  font-size: 11.5px;
  color: var(--muted);
}

.siret {
  margin-top: 3px;
}

.pastille {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 3px 8px;
  border-radius: 2px;
  color: var(--eta);
  background: var(--eta-soft);
  border: 1px solid var(--eta);
  justify-self: start;
}

.manquant,
.inactif {
  color: var(--eta);
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
