<script setup lang="ts">
import {
  STATUT_CANDIDAT_LIBELLES,
  TYPE_CLIENT_LIBELLES,
  type EspacePersonnel,
} from '@releve/shared';

useHead({ title: 'Mon espace — Relève' });

const { requete } = useApi();

const { data: espace, error } = await useAsyncData('mon-espace', () =>
  requete<EspacePersonnel>('/auth/mon-espace'),
);
</script>

<template>
  <section class="espace">
    <p v-if="error" class="alerte">Espace indisponible pour le moment.</p>

    <template v-else-if="espace?.type === 'CLIENT'">
      <div class="titre">
        <h1>{{ espace.client.raisonSociale }}</h1>
        <span class="etat" :class="espace.valideParLAgence ? 'ok' : 'attente'">
          {{ espace.valideParLAgence ? 'Etablissement valide' : 'En attente de validation' }}
        </span>
      </div>

      <p v-if="!espace.valideParLAgence" class="encart">
        Votre compte est actif : vous pouvez vous connecter et completer votre fiche. L'agence
        verifie l'etablissement et renseigne la convention collective applicable avant votre premier
        depot de besoin.
      </p>

      <dl class="fiche">
        <dt>SIRET</dt>
        <dd>{{ espace.client.siret }}</dd>
        <dt>Type</dt>
        <dd>{{ TYPE_CLIENT_LIBELLES[espace.client.type] }}</dd>
        <dt>Convention collective</dt>
        <dd>
          {{ espace.client.conventionCollective ?? 'Renseignee par l agence a la validation' }}
        </dd>
        <dt>Contact</dt>
        <dd>{{ espace.client.contactNom ?? '—' }} &middot; {{ espace.client.contactEmail }}</dd>
        <dt>Lieux d'intervention</dt>
        <dd>{{ espace.client.nombreLieux }}</dd>
      </dl>

      <p class="suite">
        Prochaine etape : le depot de besoin, ouvert des que l'etablissement est valide.
      </p>
    </template>

    <template v-else-if="espace?.type === 'CANDIDAT'">
      <div class="titre">
        <h1>{{ espace.candidat.prenom }} {{ espace.candidat.nom }}</h1>
        <span class="etat" :class="espace.valideParLAgence ? 'ok' : 'attente'">
          {{ STATUT_CANDIDAT_LIBELLES[espace.candidat.statut] }}
        </span>
      </div>

      <p v-if="!espace.valideParLAgence" class="encart">
        Votre profil est enregistre. L'agence verifie vos diplomes avant de vous proposer des
        missions : tant que cette verification n'est pas faite, vous n'apparaissez pas dans les
        recherches.
      </p>

      <dl class="fiche">
        <dt>Secteur</dt>
        <dd>
          {{ espace.candidat.codePostal }} {{ espace.candidat.ville }} &middot;
          {{ espace.candidat.rayonKm }} km
        </dd>
        <dt>Mobilite</dt>
        <dd>
          {{ espace.candidat.permisB ? 'Permis B' : 'Sans permis' }}
          <template v-if="espace.candidat.vehicule"> &middot; vehicule</template>
        </dd>
        <dt>Qualifications verifiees</dt>
        <dd>
          <template v-if="espace.candidat.qualifications.length">
            <span v-for="code in espace.candidat.qualifications" :key="code" class="pastille">
              {{ code }}
            </span>
          </template>
          <span v-else class="vide">Aucune pour l'instant</span>
        </dd>
        <dt>Telephone</dt>
        <dd>{{ espace.candidat.telephone }}</dd>
      </dl>

      <p class="suite">
        Prochaine etape : deposer vos diplomes et vos disponibilites, pour que l'agence puisse
        valider votre profil.
      </p>
    </template>

    <p v-else class="alerte">Ce compte appartient a l'agence : son espace, c'est le back-office.</p>
  </section>
</template>

<style scoped>
.espace {
  max-width: 620px;
  margin: 0 auto;
  padding-block: 40px 0;
}

.titre {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 14px;
  margin-bottom: 18px;
}

h1 {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.etat {
  font-family: var(--mono);
  font-size: 10.5px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 3px 9px;
  border-radius: 2px;
  border: 1px solid;
}

.etat.ok {
  color: var(--dom);
  background: var(--dom-soft);
  border-color: var(--dom);
}

.etat.attente {
  color: var(--eta);
  background: var(--eta-soft);
  border-color: var(--eta);
}

.encart {
  margin: 0 0 22px;
  font-size: 0.9rem;
  line-height: 1.55;
  color: var(--muted);
  padding: 14px 16px;
  background: var(--surface);
  border-left: 3px solid var(--eta);
}

.fiche {
  display: grid;
  grid-template-columns: minmax(140px, 220px) 1fr;
  margin: 0;
  border-top: 1px solid var(--line);
}

.fiche dt {
  padding: 12px 16px 12px 0;
  border-bottom: 1px solid var(--line);
  font-family: var(--mono);
  font-size: 11.5px;
  color: var(--ink);
}

.fiche dd {
  margin: 0;
  padding: 12px 0;
  border-bottom: 1px solid var(--line);
  font-size: 0.9rem;
  color: var(--muted);
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: baseline;
}

@media (max-width: 520px) {
  .fiche {
    grid-template-columns: 1fr;
  }

  .fiche dt {
    border-bottom: 0;
    padding-bottom: 0;
  }

  .fiche dd {
    padding-top: 4px;
  }
}

.pastille {
  font-family: var(--mono);
  font-size: 10.5px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 2px 8px;
  border-radius: 2px;
  background: var(--surface-2);
  color: var(--ink);
}

.vide {
  font-style: italic;
}

.suite {
  margin-top: 22px;
  font-size: 0.86rem;
  color: var(--muted);
}

.alerte {
  font-size: 0.92rem;
  color: var(--muted);
  padding: 18px;
  background: var(--surface);
  border: 1px solid var(--line);
}
</style>
