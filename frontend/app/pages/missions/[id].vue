<script setup lang="ts">
import type { MissionDetail, PropositionResume } from '@releve/shared';
import type { NomIcone } from '~/types/icone';

const route = useRoute();
const { requete } = useApi();

const identifiant = String(route.params.id);

const { data: donnees } = await useAsyncData(`mission:${identifiant}`, () =>
  requete<MissionDetail>(`/missions/${identifiant}`),
);

if (!donnees.value) {
  throw createError({ statusCode: 404, statusMessage: 'Mission introuvable', fatal: true });
}

/** Adaptation vers ce que la fiche du Figma affiche. */
const mission = computed(() => {
  const detail = donnees.value;
  if (!detail) return undefined;

  return {
    id: detail.id,
    etablissement: {
      nom: detail.client.raisonSociale,
      initiales: initiales(detail.client.raisonSociale),
      localisation: `${detail.lieu.libelle} · ${detail.lieu.ville}`,
    },
    urgente: ["Aujourd'hui", 'Demain'].includes(jourCourt(detail.dateDebut)),
    // La categorie du Figma etait un type d'etablissement. Le perimetre etant
    // reduit aux SAAD, c'est le diplome exige qui porte l'information utile.
    categorie: detail.qualificationRequise.code,
    description: detail.description ?? detail.motifRecours,
    prerequis: detail.prerequis,
    dejaPostule: detail.dejaPostule,
    distanceKm: detail.distanceKm,
    horsRayon: detail.horsRayon === true,
  };
});

useHead({ title: () => `${mission.value?.etablissement.nom ?? 'Mission'} - Relève` });

/** Les quatre lignes de la carte « informations essentielles » du Figma. */
const informations = computed<readonly { icone: NomIcone; libelle: string; valeur: string }[]>(
  () => {
    const detail = donnees.value;
    if (!detail) return [];

    return [
      { icone: 'calendar', libelle: 'Date', valeur: dateComplete(detail.dateDebut) },
      {
        icone: 'clock',
        libelle: 'Horaires',
        valeur: `${horaires(detail.heureDebut, detail.heureFin)} - ${dureeLisible(detail.dureeHeures)}`,
      },
      {
        icone: 'euro',
        libelle: 'Rémunération indicative',
        valeur: remuneration(detail.tauxHoraire),
      },
      { icone: 'map-pin', libelle: 'Lieu', valeur: detail.adresse },
    ];
  },
);

const envoi = ref(false);
const erreur = ref('');

/**
 * Le lieu est-il au-delà du rayon déclaré ?
 *
 * La réponse vient du serveur, jamais d'un calcul local : c'est la même règle
 * qui décide de cet avertissement et du refus à la candidature. Deux copies
 * finiraient par diverger, et on afficherait « au-delà de votre rayon » sur un
 * bouton qui marche.
 */
const horsRayon = computed(() => mission.value?.horsRayon === true);

/**
 * La candidature est un appel API, pas un lien.
 *
 * La porte d'eligibilite est cote serveur : elle repond 403 avec le motif exact
 * - diplome manquant, profil pas encore valide. On l'affiche
 * tel quel plutot qu'un message generique, parce que le candidat doit savoir ce
 * qui lui manque.
 */
async function candidater(): Promise<void> {
  erreur.value = '';
  envoi.value = true;

  try {
    await requete<PropositionResume>(`/missions/${identifiant}/candidatures`, { method: 'POST' });
    await navigateTo(`/candidature/${identifiant}`);
  } catch (cause) {
    const corps = (cause as { data?: { message?: string } }).data;
    erreur.value = corps?.message ?? 'Candidature impossible pour le moment.';
  } finally {
    envoi.value = false;
  }
}

const partage = ref('');

/**
 * « Partager » n'a pas de cible dans la maquette. Sur le web, la reponse
 * evidente est l'adresse de la page : on passe par le partage natif quand le
 * navigateur le propose, par le presse-papiers sinon.
 */
async function partager(): Promise<void> {
  const lien = window.location.href;

  try {
    if (navigator.share) {
      await navigator.share({ title: document.title, url: lien });
      return;
    }

    await navigator.clipboard.writeText(lien);
    partage.value = 'Lien copié.';
  } catch {
    // Partage annule par la personne, ou presse-papiers refuse : rien a signaler.
    partage.value = '';
  }
}
</script>

<template>
  <section v-if="mission" class="detail">
    <!-- Le canvas remplace la barre de detail par un simple retour. « Partager »
         n'y figure pas mais reste une action reelle de cette page : elle prend
         place a cote, en texte. -->
    <div class="chemin">
      <NuxtLink to="/missions" class="retour">← Retour aux missions</NuxtLink>
      <button type="button" class="partager" @click="partager()">Partager</button>
    </div>

    <p v-if="partage" class="confirme" role="status">{{ partage }}</p>

    <div class="colonnes">
      <article class="fiche">
        <header class="etablissement">
          <span class="pastille">{{ mission.etablissement.initiales }}</span>
          <div>
            <h1>{{ mission.etablissement.nom }}</h1>
            <p class="lieu">
              {{ mission.etablissement.localisation }}
              <template v-if="mission.distanceKm !== null">
                &middot; {{ mission.distanceKm }} km
              </template>
            </p>
          </div>
        </header>

        <div v-if="mission.urgente || mission.categorie" class="etiquettes">
          <span v-if="mission.urgente" class="urgent">Urgent</span>
          <span v-if="mission.categorie" class="diplome">{{ mission.categorie }}</span>
        </div>

        <div class="essentiel">
          <div v-for="information in informations" :key="information.libelle" class="tuile">
            <p class="libelle">{{ information.libelle }}</p>
            <p class="valeur">{{ information.valeur }}</p>
          </div>
        </div>

        <h2>Votre mission</h2>
        <p class="texte">{{ mission.description }}</p>

        <h2>Prérequis</h2>
        <div class="prerequis">
          <span
            v-for="prerequis in mission.prerequis"
            :key="prerequis.libelle"
            class="exigence"
            :class="{ acquis: prerequis.verifie }"
          >
            {{ prerequis.libelle }}
          </span>
        </div>
      </article>

      <aside class="candidature">
        <h2 class="titre-aside">Cette mission vous intéresse ?</h2>

        <template v-if="mission.dejaPostule">
          <p class="explication">
            Votre candidature est partie. L'établissement répond généralement dans la journée.
          </p>
          <AppBouton icone="check" to="/suivi">Voir le suivi</AppBouton>
        </template>

        <template v-else-if="horsRayon">
          <p class="explication">
            Ce lieu est à {{ mission.distanceKm }} km, au-delà du rayon de déplacement que vous avez
            déclaré. Vous pouvez l'élargir depuis votre profil.
          </p>
          <AppBouton variante="secondaire" to="/mon-profil">Ajuster mon rayon</AppBouton>
        </template>

        <template v-else>
          <p class="explication">
            L'agence vérifie que votre dossier couvre le diplôme exigé avant de transmettre votre
            candidature à l'établissement.
          </p>

          <p v-if="erreur" class="refus" role="alert">{{ erreur }}</p>

          <AppBouton icone="send" :desactive="envoi" @click="candidater()">
            {{ envoi ? 'Envoi...' : 'Je candidate à cette mission' }}
          </AppBouton>

          <p class="reassurance">L'établissement répond généralement dans la journée.</p>
        </template>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.detail {
  max-width: 1000px;
}

.chemin {
  display: flex;
  gap: 16px;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 24px;
}

.retour {
  font-size: 14.5px;
  font-weight: 600;
  color: var(--dom);
  text-decoration: none;
}

.partager {
  padding: 0;
  font-family: var(--sans);
  font-size: 13.5px;
  font-weight: 600;
  color: var(--muted);
  background: none;
  border: 0;
  cursor: pointer;
}

.partager:hover {
  color: var(--dom);
}

.retour:focus-visible,
.partager:focus-visible {
  outline: 2px solid var(--dom);
  outline-offset: 3px;
}

.confirme {
  padding: 11px 15px;
  margin: 0 0 18px;
  font-size: 13.5px;
  color: var(--dom-fonce);
  background: var(--surface-2);
  border: 1px solid var(--line-forte);
  border-radius: 12px;
}

.colonnes {
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr);
  gap: 28px;
  align-items: start;
}

.fiche {
  padding: 32px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 22px;
}

.etablissement {
  display: flex;
  gap: 16px;
  align-items: center;
}

.pastille {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  font-size: 17px;
  font-weight: 700;
  color: var(--dom);
  background: var(--surface-2);
  border-radius: 14px;
}

h1 {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: -0.02em;
}

.lieu {
  margin: 2px 0 0;
  font-size: 14px;
  color: var(--muted);
}

.etiquettes {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 16px;
}

.urgent,
.diplome {
  padding: 5px 11px;
  font-size: 12px;
  font-weight: 700;
  border-radius: 20px;
}

.urgent {
  color: var(--eta);
  background: var(--eta-soft);
}

.diplome {
  color: var(--dom);
  background: var(--surface-2);
}

.essentiel {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 14px;
  margin: 28px 0 30px;
}

.tuile {
  padding: 16px;
  background: var(--ground);
  border-radius: 14px;
}

.libelle {
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--muted);
}

.valeur {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  line-height: 1.4;
}

.fiche h2 {
  margin: 0 0 12px;
  font-size: 18px;
  font-weight: 600;
}

.texte {
  margin: 0 0 28px;
  font-size: 15px;
  line-height: 1.7;
}

.prerequis {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

/* Le canvas ne connait qu'un seul etat de prerequis. Celui que l'agence a
 * verifie est distingue : c'est la difference entre « exige » et « vous
 * l'avez ». */
.exigence {
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 600;
  color: var(--muted);
  background: var(--ground);
  border: 1px solid var(--line);
  border-radius: 20px;
}

.exigence.acquis {
  color: var(--dom);
  background: var(--surface-2);
  border-color: var(--surface-2);
}

.candidature {
  position: sticky;
  top: 24px;
  padding: 26px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 22px;
}

.titre-aside {
  margin: 0 0 8px;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.explication {
  margin: 0 0 22px;
  font-size: 13.5px;
  line-height: 1.55;
  color: var(--muted);
}

.refus {
  padding: 12px 14px;
  margin: 0 0 14px;
  font-size: 13.5px;
  line-height: 1.55;
  color: var(--eta);
  background: var(--eta-soft);
  border: 1px solid var(--eta-line);
  border-radius: 12px;
}

.reassurance {
  margin: 14px 0 0;
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--muted);
}

@media (max-width: 860px) {
  .colonnes {
    grid-template-columns: minmax(0, 1fr);
  }

  .candidature {
    position: static;
  }

  .fiche {
    padding: 24px;
  }
}
</style>
