<script setup lang="ts">
import type {
  MissionResume,
  PageResultat,
  PropositionResume,
  ResumeMissions,
} from '@releve/shared';

useHead({ title: 'Accueil etablissement - Relève' });

const { requete } = useApi();
const { utilisateur } = useSession();

const [{ data: compteurs }, { data: missions }, { data: candidatures }] = await Promise.all([
  useAsyncData('etablissement:resume', () => requete<ResumeMissions>('/missions/resume')),
  useAsyncData('etablissement:missions', () =>
    requete<PageResultat<MissionResume>>('/missions', { query: { limite: 5 } }),
  ),
  useAsyncData('etablissement:candidatures', () =>
    requete<PageResultat<PropositionResume>>('/propositions', {
      query: { statut: 'ACCEPTEE_CANDIDAT', limite: 1 },
    }),
  ),
]);

const etablissement = computed(() => ({
  contact: prenomAffiche(utilisateur.value?.email),
  nom: missions.value?.donnees[0]?.client.raisonSociale ?? 'Votre etablissement',
}));

/**
 * Les trois compteurs du Figma, avec leurs teintes.
 *
 * Ils viennent d'une seule route qui agrege en base : trois appels separes
 * afficheraient trois etats legerement decales pendant le chargement.
 */
const statistiques = computed(() => [
  { valeur: compteurs.value?.actives ?? 0, libelle: 'Missions actives', teinte: 'vert' },
  {
    valeur: compteurs.value?.candidaturesRecues ?? 0,
    libelle: 'Candidatures recues',
    teinte: 'lavande',
  },
  { valeur: compteurs.value?.aConfirmer ?? 0, libelle: 'A confirmer', teinte: 'corail' },
]);

/**
 * La carte du bas menait au premier profil du vivier de demonstration. Elle
 * mene maintenant a la candidature reellement en attente : c'est la seule qui
 * demande une decision.
 */
const aTrancher = computed(() => candidatures.value?.donnees[0]);

const prochaine = computed(() => {
  const mission = missions.value?.donnees[0];
  if (!mission) return undefined;

  return {
    // « Aujourd'hui » et « Demain » ne prennent pas d'article, une date si.
    titre: ["Aujourd'hui", 'Demain', 'Hier'].includes(jourCourt(mission.dateDebut))
      ? `Mission de ${jourCourt(mission.dateDebut).toLowerCase()}`
      : `Mission du ${jourCourt(mission.dateDebut).toLowerCase()}`,
    poste: `${mission.qualificationRequise.libelle} - ${horaires(mission.heureDebut, mission.heureFin)}`,
    lieu: `${mission.lieu.libelle} - ${mission.lieu.ville}`,
    candidats: mission.candidaturesEnAttente,
  };
});
</script>

<template>
  <section class="accueil">
    <header class="tete">
      <div>
        <p class="bonjour">Bonjour {{ etablissement.contact }}</p>
        <h1>{{ etablissement.nom }}</h1>
      </div>
      <!-- Aucun centre de notifications dans le projet : la cloche du design
           reste visible mais inactive. -->
      <button type="button" class="cloche" disabled aria-label="Notifications a venir">
        <AppIcon nom="bell" :taille="20" />
      </button>
    </header>

    <AppCarte variante="pleine" class="urgence">
      <AppBadge teinte="corail">Besoin urgent</AppBadge>
      <p class="titre-urgence">Un remplacement a organiser rapidement ?</p>
      <p class="texte-urgence">
        Publiez une mission en quelques etapes et recevez des profils disponibles.
      </p>
      <AppBouton icone="plus" to="/etablissement/publier">Publier une mission</AppBouton>
    </AppCarte>

    <section class="apercu">
      <h2>Vue d'ensemble</h2>
      <ul class="statistiques">
        <li
          v-for="statistique in statistiques"
          :key="statistique.libelle"
          :class="statistique.teinte"
        >
          <p class="valeur">{{ statistique.valeur }}</p>
          <p class="libelle">{{ statistique.libelle }}</p>
        </li>
      </ul>
    </section>

    <NuxtLink
      v-if="prochaine && aTrancher"
      :to="`/etablissement/candidats/${aTrancher.id}`"
      class="lien-mission"
    >
      <AppCarte class="recente">
        <div class="entete-recente">
          <p class="titre-recente">{{ prochaine.titre }}</p>
          <AppBadge teinte="vert">
            {{ prochaine.candidats }} candidat{{ prochaine.candidats > 1 ? 's' : '' }}
          </AppBadge>
        </div>
        <p class="poste">{{ prochaine.poste }}</p>
        <p class="lieu">{{ prochaine.lieu }}</p>
      </AppCarte>
    </NuxtLink>

    <AppCarte v-else-if="prochaine" class="recente">
      <div class="entete-recente">
        <p class="titre-recente">{{ prochaine.titre }}</p>
        <AppBadge>Aucune candidature</AppBadge>
      </div>
      <p class="poste">{{ prochaine.poste }}</p>
      <p class="lieu">{{ prochaine.lieu }}</p>
    </AppCarte>

    <p v-else class="vide">
      Aucune mission publiee pour l instant. Deposez un besoin pour recevoir des profils.
    </p>
  </section>
</template>

<style scoped>
.vide {
  margin: 0;
  padding: 18px;
  color: var(--muted);
  line-height: 1.55;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-carte);
}

.accueil {
  max-width: 720px;
  padding-block: 28px 0;
}

.tete {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 20px;
}

.bonjour {
  margin: 0 0 4px;
  font-size: 13px;
  color: var(--muted);
}

h1 {
  margin: 0 0 4px;
  font-size: 23px;
  font-weight: 400;
}

.mention {
  margin: 0;
  font-size: 10px;
  color: var(--muted);
}

.cloche {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  color: var(--ink);
  background: var(--surface);
  border: 0;
  border-radius: 999px;
  opacity: 0.5;
  cursor: not-allowed;
}

.urgence {
  display: grid;
  justify-items: start;
  gap: 14px;
}

.titre-urgence {
  margin: 0;
  font-size: 22px;
  line-height: 1.2;
}

.texte-urgence {
  margin: 0;
  font-size: 13px;
  line-height: 1.45;
  color: var(--dom-contraste);
}

/* Le bouton de cette carte est vert sur vert sombre : c'est le seul endroit du
 * design ou la variante primaire n'est pas posee sur le fond clair. */
.urgence :deep(.bouton) {
  max-width: 340px;
}

.apercu {
  margin-top: 24px;
}

h2 {
  margin: 0 0 12px;
  font-size: 16px;
  font-weight: 700;
}

.statistiques {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.statistiques li {
  padding: 14px;
  border-radius: var(--r-carte);
}

.statistiques .vert {
  background: var(--dom-soft);
}

.statistiques .lavande {
  background: var(--lavande);
}

.statistiques .corail {
  background: var(--eta-soft);
}

.valeur {
  margin: 0 0 5px;
  font-size: 24px;
}

.libelle {
  margin: 0;
  font-size: 11px;
  line-height: 1.35;
  color: var(--muted);
}

.lien-mission {
  display: block;
  margin-top: 24px;
  color: inherit;
  text-decoration: none;
}

.lien-mission:focus-visible {
  outline: 2px solid var(--dom);
  outline-offset: 3px;
  border-radius: var(--r-carte);
}

.recente {
  display: grid;
  gap: 12px;
}

.entete-recente {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  justify-content: space-between;
}

.titre-recente {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
}

.poste {
  margin: 0;
  font-size: 14px;
}

.lieu {
  margin: 0;
  font-size: 11px;
  color: var(--muted);
}
</style>
