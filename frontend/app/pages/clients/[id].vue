<script setup lang="ts">
import type { ClientDetail } from '@releve/shared';
import {
  STATUT_REGLEMENTAIRE_LIBELLES,
  TYPE_CLIENT_LIBELLES,
  TYPE_LIEU_LIBELLES,
} from '@releve/shared';

const route = useRoute();
const { requete } = useApi();

const identifiant = computed(() => String(route.params.id));

const { data: client, error } = await useAsyncData<ClientDetail>(
  () => `client:${identifiant.value}`,
  () => requete<ClientDetail>(`/clients/${identifiant.value}`),
);

const introuvable = computed(
  () => (error.value as { statusCode?: number } | null)?.statusCode === 404,
);
</script>

<template>
  <section class="fiche">
    <NuxtLink class="retour" to="/clients">&larr; Tous les clients</NuxtLink>

    <p v-if="introuvable" class="alerte">
      Ce client n existe pas, ou il appartient a une autre agence.
    </p>

    <p v-else-if="error" class="alerte">API injoignable.</p>

    <template v-else-if="client">
      <div class="titre">
        <h1>{{ client.raisonSociale }}</h1>
        <span class="pastille">{{ TYPE_CLIENT_LIBELLES[client.type] }}</span>
        <span v-if="!client.actif" class="pastille inactif">Inactif</span>
        <span v-if="client.statutReglementaire" class="pastille regime">
          {{ STATUT_REGLEMENTAIRE_LIBELLES[client.statutReglementaire] }}
        </span>
        <span v-else class="pastille manque">Statut a renseigner</span>
      </div>

      <dl class="proprietes">
        <div>
          <dt>SIRET</dt>
          <dd>{{ client.siret }}</dd>
        </div>
        <!--
          Le justificatif change de nature selon le regime : un numero de
          declaration, un agrement, ou un FINESS accompagne de son arrete. On
          affiche celui qui correspond, et l'absence est nommee plutot que
          laissee vide — c'est elle qui bloque l'activation de la fiche.
        -->
        <div>
          <dt>Statut reglementaire</dt>
          <dd>
            <template v-if="client.statutReglementaire">
              {{ STATUT_REGLEMENTAIRE_LIBELLES[client.statutReglementaire] }}
              <template v-if="client.numeroSap"> &middot; {{ client.numeroSap }}</template>
              <template v-if="client.numeroAgrement">
                &middot; agrement {{ client.numeroAgrement }}
              </template>
              <template v-if="client.numeroFiness">
                &middot; FINESS {{ client.numeroFiness }}
              </template>
              <template v-if="client.arreteReference">
                &middot; arrete {{ client.arreteReference }}
                <template v-if="client.arreteDate"> du {{ client.arreteDate }}</template>
              </template>
            </template>
            <span v-else class="manquant">a renseigner avant activation</span>
          </dd>
        </div>
        <div>
          <dt>Convention collective</dt>
          <dd>
            <template v-if="client.conventionCollective">
              {{ client.conventionCollective }}
              <template v-if="client.idcc"> (IDCC {{ client.idcc }})</template>
            </template>
            <span v-else class="manquant">a renseigner</span>
          </dd>
        </div>
        <div>
          <dt>Contact</dt>
          <dd>
            <template v-if="client.contactNom || client.contactEmail || client.contactTel">
              {{ client.contactNom }}
              <template v-if="client.contactEmail"> &middot; {{ client.contactEmail }}</template>
              <template v-if="client.contactTel"> &middot; {{ client.contactTel }}</template>
            </template>
            <span v-else class="manquant">a renseigner</span>
          </dd>
        </div>
      </dl>

      <p class="note">
        La convention collective affichee ici est celle de l entreprise utilisatrice. C est elle qui
        fixe le salaire de reference de l interimaire, pas celle de son employeur.
      </p>

      <p v-if="!client.statutReglementaire" class="note avertissement">
        Le statut reglementaire n est pas renseigne : declaration SAP, agrement, ou autorisation
        departementale au titre du CASF. Il se saisit sur piece, et tant qu il manque la structure
        ne peut pas etre activee — c est lui qui dit ce qu elle a le droit de faire.
      </p>

      <h2>
        Lieux d intervention <span class="compte">{{ client.lieux.length }}</span>
      </h2>

      <p v-if="!client.lieux.length" class="vide">Aucun lieu d intervention enregistre.</p>

      <ul v-else class="liste">
        <li v-for="lieu in client.lieux" :key="lieu.id" class="lieu">
          <div class="entete-lieu">
            <p class="libelle">{{ lieu.libelle }}</p>
            <span class="pastille" :class="lieu.type === 'ETABLISSEMENT' ? 'eta' : 'dom'">
              {{ TYPE_LIEU_LIBELLES[lieu.type] }}
            </span>
          </div>

          <p class="adresse">{{ lieu.adresse }}, {{ lieu.codePostal }} {{ lieu.ville }}</p>

          <p class="acces">
            <template v-if="lieu.etage">{{ lieu.etage }}</template>
            <template v-if="lieu.codeAcces"> &middot; code {{ lieu.codeAcces }}</template>
            <template v-if="lieu.beneficiaireRef">
              &middot; ref. {{ lieu.beneficiaireRef }}</template
            >
            <template v-if="lieu.nombreMissions">
              &middot; {{ lieu.nombreMissions }} mission(s)
            </template>
          </p>

          <p v-if="lieu.consignes" class="consignes">{{ lieu.consignes }}</p>
        </li>
      </ul>
    </template>
  </section>
</template>

<style scoped>
.fiche {
  padding-block: 32px 0;
}

.retour {
  font-family: var(--mono);
  font-size: 11.5px;
  color: var(--muted);
  text-decoration: none;
}

.retour:hover {
  color: var(--dom);
}

.titre {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 14px;
  margin: 14px 0 20px;
}

h1 {
  margin: 0;
  font-size: 1.6rem;
  font-weight: 700;
  letter-spacing: -0.01em;
}

h2 {
  margin: 30px 0 12px;
  font-size: 1.05rem;
  font-weight: 700;
}

h2 .compte {
  font-family: var(--mono);
  font-size: 12px;
  font-weight: 400;
  color: var(--muted);
}

.proprietes {
  margin: 0;
  display: grid;
  gap: 1px;
  background: var(--line);
  border: 1px solid var(--line);
}

.proprietes > div {
  background: var(--surface);
  padding: 12px 16px;
  display: grid;
  grid-template-columns: minmax(160px, 220px) 1fr;
  gap: 8px 18px;
}

@media (max-width: 620px) {
  .proprietes > div {
    grid-template-columns: 1fr;
    gap: 3px;
  }
}

dt {
  font-family: var(--mono);
  font-size: 10.5px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}

dd {
  margin: 0;
  font-size: 0.94rem;
}

.note {
  margin: 14px 0 0;
  font-size: 0.86rem;
  color: var(--muted);
  padding: 12px 14px;
  background: var(--dom-soft);
  border-left: 3px solid var(--dom);
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

.lieu {
  background: var(--surface);
  padding: 15px 18px;
  display: grid;
  gap: 5px;
}

.entete-lieu {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.libelle {
  margin: 0;
  font-weight: 700;
}

.adresse,
.acces,
.consignes {
  margin: 0;
  font-family: var(--mono);
  font-size: 11.5px;
  color: var(--muted);
}

.consignes {
  padding-top: 4px;
  border-top: 1px dashed var(--line);
}

.pastille {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 3px 8px;
  border-radius: 2px;
  border: 1px solid var(--eta);
  color: var(--eta);
  background: var(--eta-soft);
}

.pastille.dom {
  color: var(--dom);
  background: var(--dom-soft);
  border-color: var(--dom);
}

.pastille.regime {
  background: var(--dom-soft);
}

.pastille.manque {
  background: var(--eta-soft);
  color: var(--eta);
}

.note.avertissement {
  padding: 12px 14px;
  background: var(--eta-soft);
  border-radius: var(--r-champ);
  color: var(--eta);
}

.pastille.inactif {
  border-style: dashed;
}

.manquant {
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
  margin-top: 16px;
  border-left: 3px solid var(--eta);
}
</style>
