<script setup lang="ts">
import type {
  CandidatDetail,
  CompletudeProfil,
  MissionResume,
  PageResultat,
  PropositionResume,
} from '@releve/shared';

useHead({ title: 'Tableau de bord — Relève' });

const { requete } = useApi();

/**
 * Le canvas affiche quatre compteurs, un encart de completude et les missions
 * proches. Aucune route d'agregation n'existe : les six appels partent donc
 * ensemble, et les compteurs se lisent dans le `total` d'une page de taille 1
 * plutot qu'en comptant des enregistrements rapatries pour rien.
 */
const { data, error } = await useAsyncData('tableau-de-bord', async () => {
  const [profil, completude, candidatures, enAttente, confirmees, missions] = await Promise.all([
    requete<CandidatDetail>('/mon-profil'),
    requete<CompletudeProfil>('/mon-profil/completude'),
    requete<PageResultat<PropositionResume>>('/propositions', { query: { limite: 1 } }),
    requete<PageResultat<PropositionResume>>('/propositions', {
      query: { statut: 'ENVOYEE', limite: 1 },
    }),
    requete<PageResultat<PropositionResume>>('/propositions', {
      query: { statut: 'VALIDEE_CLIENT', limite: 1 },
    }),
    requete<PageResultat<MissionResume>>('/missions', {
      // `depuis` aujourd'hui : une vacation commencee hier reste publiee tant
      // que personne n'a ete retenu, mais elle n'a rien a faire dans un bloc
      // qui propose de postuler.
      query: { statut: 'PUBLIEE', limite: 3, depuis: new Date().toISOString().slice(0, 10) },
    }),
  ]);

  return { profil, completude, candidatures, enAttente, confirmees, missions };
});

const complet = computed(() => (data.value?.completude.pourcentage ?? 0) >= 100);

/**
 * Les libelles du canvas sont ceux d'une maquette cote etablissement :
 * « Candidatures recues » n'a pas de sens pour la personne qui les envoie. Les
 * intitules disent donc ce que les compteurs comptent vraiment.
 */
const compteurs = computed(() => [
  {
    cle: 'confirmees',
    valeur: String(data.value?.confirmees.total ?? 0),
    libelle: 'Missions confirmées',
    teinte: 'vert',
    // Le canvas ne met que quatre entrees dans la barre laterale : c'est par ce
    // compteur qu'on atteint desormais le suivi de la mission confirmee.
    vers: '/suivi',
  },
  {
    cle: 'candidatures',
    valeur: String(data.value?.candidatures.total ?? 0),
    libelle: 'Candidatures envoyées',
    teinte: 'lavande',
  },
  {
    cle: 'attente',
    valeur: String(data.value?.enAttente.total ?? 0),
    libelle: 'En attente de réponse',
    teinte: 'rouge',
  },
  {
    cle: 'completude',
    valeur: `${data.value?.completude.pourcentage ?? 0} %`,
    libelle: 'Profil complété',
    teinte: 'neutre',
  },
]);

/**
 * `:is` ne resout pas un nom de composant passe en chaine : le gabarit sortait
 * une balise `<NuxtLink>` inconnue du navigateur, donc un compteur qui ne
 * cliquait pas. La resolution explicite rend le vrai composant.
 */
const Lien = resolveComponent('NuxtLink');

const missionsProches = computed(() =>
  (data.value?.missions.donnees ?? []).map((mission) => ({
    id: mission.id,
    nom: mission.client.raisonSociale,
    initiales: initiales(mission.client.raisonSociale),
    lieu: `${mission.lieu.libelle} · ${mission.lieu.ville}`,
    jour: jourCourt(mission.dateDebut),
    horaires: horaires(mission.heureDebut, mission.heureFin),
    taux: remuneration(mission.tauxHoraire),
  })),
);
</script>

<template>
  <section class="tableau">
    <p v-if="error" class="alerte">Tableau de bord indisponible pour le moment.</p>

    <template v-else-if="data">
      <p class="bonjour">Bonjour {{ data.profil.prenom }}</p>
      <h1>Votre tableau de bord</h1>

      <div class="haut">
        <!-- L'encart plein du canvas. Le canvas ne dessine que l'etat
             incomplet ; l'etat complet reprend la meme carte, sans l'alerte
             rouge, plutot que de laisser un trou dans la grille. -->
        <div class="encart">
          <p v-if="!complet" class="etiquette">Important</p>
          <h2>{{ complet ? 'Votre profil est complet' : 'Votre profil est incomplet' }}</h2>
          <p class="explication">
            <template v-if="complet">
              L'agence dispose de tout ce qu'il lui faut pour vous proposer des missions adaptées à
              vos compétences et à vos disponibilités.
            </template>
            <template v-else>
              Complétez votre profil pour que nous puissions vous proposer les missions qui
              correspondent à vos compétences et à vos disponibilités.
            </template>
          </p>

          <ul v-if="!complet && data.completude.manques.length" class="manques">
            <li v-for="manque in data.completude.manques" :key="manque.cle">
              {{ manque.libelle }}
            </li>
          </ul>

          <NuxtLink class="action" to="/mon-profil">
            {{ complet ? 'Voir mon profil' : 'Compléter mon profil' }}
          </NuxtLink>
        </div>

        <div class="compteurs">
          <component
            :is="compteur.vers ? Lien : 'div'"
            v-for="compteur in compteurs"
            :key="compteur.cle"
            :to="compteur.vers"
            class="tuile"
            :class="[compteur.teinte, { cliquable: !!compteur.vers }]"
          >
            <p class="valeur">{{ compteur.valeur }}</p>
            <p class="libelle">{{ compteur.libelle }}</p>
          </component>
        </div>
      </div>

      <div class="titre-section">
        <h2>Missions près de vous</h2>
        <NuxtLink to="/missions">Tout voir</NuxtLink>
      </div>

      <div v-if="missionsProches.length" class="missions">
        <NuxtLink
          v-for="mission in missionsProches"
          :key="mission.id"
          class="mission"
          :to="`/missions/${mission.id}`"
        >
          <div class="entete-mission">
            <span class="pastille">{{ mission.initiales }}</span>
            <span class="identite">
              <span class="nom">{{ mission.nom }}</span>
              <span class="lieu">{{ mission.lieu }}</span>
            </span>
          </div>

          <div class="bas-mission">
            <span class="creneau">{{ mission.jour }} · {{ mission.horaires }}</span>
            <span class="taux">{{ mission.taux }}</span>
          </div>
        </NuxtLink>
      </div>

      <p v-else class="vide">
        Aucune mission publiée pour le moment. Les nouvelles offres apparaissent ici dès leur
        publication.
      </p>

      <!--
        Renvoi, et non second catalogue : les missions Relève priment sur cette
        page, et le marché a la sienne. Deux listes côte à côte inviteraient à
        les comparer, alors qu'on ne postule qu'à l'une des deux.
      -->
      <NuxtLink to="/annonces" class="vers-annonces">
        <span class="intitule">Voir les annonces partenaire</span>
        <span class="precision">
          Ce que cherche le secteur autour de vous, diffusé par France Travail. Relève n'est pas
          l'employeur de ces postes.
        </span>
      </NuxtLink>
    </template>
  </section>
</template>

<style scoped>
.tableau {
  max-width: 1080px;
}

.alerte {
  padding: 13px 15px;
  margin: 0;
  font-size: 14px;
  color: var(--eta);
  background: var(--eta-soft);
  border: 1px solid var(--eta-line);
  border-radius: 12px;
}

.bonjour {
  margin: 0 0 2px;
  font-size: 14px;
  color: var(--muted);
}

h1 {
  margin: 0 0 28px;
  font-size: clamp(28px, 5vw, 34px);
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: -0.03em;
}

.haut {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
  gap: 22px;
  align-items: start;
}

.encart {
  padding: 30px;
  color: var(--surface);
  background: var(--dom-fonce);
  border-radius: 22px;
}

.etiquette {
  display: inline-block;
  padding: 5px 11px;
  margin: 0 0 18px;
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  background: var(--eta);
  border-radius: 20px;
}

.encart h2 {
  margin: 0 0 10px;
  font-size: 26px;
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: -0.02em;
}

.explication {
  max-width: 48ch;
  margin: 0 0 24px;
  font-size: 15px;
  line-height: 1.6;
  color: var(--dom-contraste);
}

/* Le canvas se contente d'annoncer que le profil est incomplet. La route de
 * completude sait exactement ce qui manque : autant le dire. */
.manques {
  padding: 0;
  margin: -12px 0 24px;
  font-size: 14px;
  line-height: 1.7;
  color: var(--dom-contraste);
  list-style: none;
}

.manques li::before {
  content: '— ';
}

.action {
  display: inline-block;
  padding: 14px 24px;
  font-size: 15px;
  font-weight: 600;
  color: var(--surface);
  text-decoration: none;
  background: var(--dom);
  border-radius: 12px;
}

.action:hover {
  color: var(--dom-fonce);
  background: var(--surface);
}

.action:focus-visible {
  outline: 2px solid var(--surface);
  outline-offset: 3px;
}

.compteurs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.tuile {
  display: block;
  padding: 22px;
  color: inherit;
  text-decoration: none;
  border: 1px solid var(--line);
  border-radius: 18px;
}

.tuile.cliquable:hover {
  border-color: var(--dom);
}

.tuile.cliquable:focus-visible {
  outline: 2px solid var(--dom);
  outline-offset: 2px;
}

.tuile.vert {
  background: var(--surface-2);
  border-color: var(--line-forte);
}

.tuile.lavande {
  background: var(--lavande);
  border-color: var(--lavande-line);
}

.tuile.rouge {
  background: var(--eta-soft);
  border-color: var(--eta-line);
}

.tuile.neutre {
  background: var(--surface);
}

.valeur {
  margin: 0 0 6px;
  font-size: 30px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.libelle {
  margin: 0;
  font-size: 13.5px;
  line-height: 1.4;
  color: var(--muted);
}

.titre-section {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin: 36px 0 18px;
}

.titre-section h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}

.titre-section a {
  font-size: 14px;
  font-weight: 600;
  color: var(--dom);
  text-decoration: none;
}

.missions {
  display: grid;
  /* `min()` plutot que 300px sec : une piste de 300px imposee deborde de
   * l'ecran sur un telephone etroit, et c'est la carte entiere qui sort. */
  grid-template-columns: repeat(auto-fill, minmax(min(300px, 100%), 1fr));
  gap: 16px;
}

.mission {
  display: block;
  padding: 20px;
  color: inherit;
  text-decoration: none;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 18px;
}

.mission:hover {
  border-color: var(--dom);
}

.mission:focus-visible {
  outline: 2px solid var(--dom);
  outline-offset: 2px;
}

.entete-mission {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 14px;
}

.pastille {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  font-size: 13.5px;
  font-weight: 700;
  color: var(--dom);
  background: var(--surface-2);
  border-radius: 11px;
}

.identite {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.nom {
  overflow: hidden;
  font-size: 15.5px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lieu {
  overflow: hidden;
  font-size: 12.5px;
  color: var(--muted);
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Les deux enfants sont en `nowrap` : sans retour a la ligne, aucun des deux
 * ne peut retrecir et la remuneration depasse le bord arrondi de la carte des
 * que la grille passe a trois colonnes. Le taux garde sa place a droite sur
 * une ligne comme sur deux grace a la marge automatique. */
.bas-mission {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 10px;
  align-items: center;
}

.creneau {
  padding: 6px 11px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--dom);
  white-space: nowrap;
  background: var(--surface-2);
  border-radius: 20px;
}

.taux {
  margin-left: auto;
  font-size: 16px;
  font-weight: 700;
  color: var(--dom);
  white-space: nowrap;
}

.vide {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--muted);
}

@media (max-width: 820px) {
  .haut {
    grid-template-columns: minmax(0, 1fr);
  }

  .encart {
    padding: 24px;
  }
}
/*
 * Bordure discontinue, comme les cartes d'annonces : elle signale qu'on quitte
 * le périmètre des missions Relève avant même qu'on ait lu l'intitulé.
 */
.vers-annonces {
  display: block;
  margin-top: 28px;
  padding: 18px 20px;
  color: inherit;
  text-decoration: none;
  background: var(--surface);
  border: 1px dashed var(--line);
  border-radius: 14px;
}

.vers-annonces:hover,
.vers-annonces:focus-visible {
  border-style: solid;
}

.vers-annonces .intitule {
  display: block;
  margin-bottom: 4px;
  font-size: 15px;
  font-weight: 650;
}

.vers-annonces .precision {
  display: block;
  max-width: 68ch;
  font-size: 13.5px;
  line-height: 1.6;
  color: var(--muted);
}
</style>
