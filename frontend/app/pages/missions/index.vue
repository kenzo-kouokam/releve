<script setup lang="ts">
import type { MissionResume, PageResultat } from '@releve/shared';

useHead({ title: 'Missions disponibles - Relève' });

const { requete } = useApi();

/**
 * Les trois filtres de la maquette, traduits en intentions reelles.
 *
 * « A proximite » trie desormais par distance reelle entre le domicile du
 * candidat et le lieu d'intervention. Les missions dont la distance n'est pas
 * mesurable passent en fin de liste plutot qu'en tete : une distance inconnue
 * n'est pas une distance nulle.
 */
const FILTRES = ['À proximité', "Aujourd'hui", 'Mieux rémunérées'] as const;

const recherche = ref('');
const filtre = ref<(typeof FILTRES)[number]>(FILTRES[0]);

/**
 * La recherche part a l'API, pas au tableau : le vivier peut etre long. On
 * attend 300 ms de silence avant d'interroger, sinon chaque frappe declenche un
 * appel et les reponses arrivent dans le desordre.
 */
const terme = ref('');
let minuterie: ReturnType<typeof setTimeout> | undefined;

watch(recherche, (valeur) => {
  clearTimeout(minuterie);
  minuterie = setTimeout(() => {
    terme.value = valeur.trim();
  }, 300);
});

onBeforeUnmount(() => clearTimeout(minuterie));

const { data, error } = await useAsyncData(
  'missions-disponibles',
  () =>
    requete<PageResultat<MissionResume>>('/missions', {
      query: {
        statut: 'PUBLIEE',
        limite: 50,
        ...(terme.value ? { recherche: terme.value } : {}),
        ...(filtre.value === "Aujourd'hui"
          ? { depuis: jourIso(new Date()), jusqua: jourIso(new Date()) }
          : {}),
      },
    }),
  { watch: [terme, filtre] },
);

function jourIso(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

/**
 * Adaptation vers ce que la carte du Figma affiche.
 *
 * « Urgent » n'est pas un champ : c'est une mission qui commence aujourd'hui ou
 * demain. Le calculer ici evite d'ajouter une colonne qui dirait la meme chose
 * que la date, et qui finirait fausse le lendemain.
 */
const missions = computed(() => {
  const cartes = (data.value?.donnees ?? []).map((mission) => ({
    id: mission.id,
    etablissement: {
      nom: mission.client.raisonSociale,
      initiales: initiales(mission.client.raisonSociale),
      localisation: `${mission.lieu.libelle} · ${mission.lieu.ville}`,
    },
    urgente: ["Aujourd'hui", 'Demain'].includes(jourCourt(mission.dateDebut)),
    jour: jourCourt(mission.dateDebut),
    horaires: horaires(mission.heureDebut, mission.heureFin),
    tauxHoraire: tauxCourt(mission.tauxHoraire),
    taux: mission.tauxHoraire ?? 0,
    distance: mission.distanceKm,
    horsRayon: mission.horsRayon === true,
  }));

  if (filtre.value === 'Mieux rémunérées') {
    return [...cartes].sort((a, b) => b.taux - a.taux);
  }

  if (filtre.value === 'À proximité') {
    return [...cartes].sort(
      (a, b) => (a.distance ?? Number.POSITIVE_INFINITY) - (b.distance ?? Number.POSITIVE_INFINITY),
    );
  }

  return cartes;
});
</script>
<template>
  <section class="missions">
    <!-- Le canvas ne salue plus ici : « Bonjour » et l'avatar appartiennent au
         tableau de bord, qui ouvre desormais l'espace candidat. -->
    <h1>Trouvez votre mission</h1>

    <div class="barre">
      <div class="recherche">
        <AppIcon nom="search" :taille="18" />
        <label class="sr-only" for="recherche">Rechercher une mission</label>
        <input
          id="recherche"
          v-model="recherche"
          type="search"
          placeholder="Ville, établissement ou date"
        />
      </div>

      <div class="filtres">
        <button
          v-for="option in FILTRES"
          :key="option"
          type="button"
          class="filtre"
          :class="{ actif: filtre === option }"
          :aria-pressed="filtre === option"
          @click="filtre = option"
        >
          {{ option }}
        </button>
      </div>
    </div>

    <p v-if="error" class="vide">
      Missions indisponibles pour le moment. Réessayer dans un instant.
    </p>

    <template v-else>
      <h2 class="titre-liste">
        {{ missions.length }} {{ missions.length > 1 ? 'missions' : 'mission' }} près de vous
      </h2>

      <p v-if="missions.length === 0" class="vide">
        Aucune mission ne correspond à cette recherche.
      </p>

      <ul v-else class="liste">
        <li v-for="mission in missions" :key="mission.id">
          <NuxtLink :to="`/missions/${mission.id}`" class="carte">
            <span class="pastille">{{ mission.etablissement.initiales }}</span>

            <span class="copie">
              <span class="ligne-nom">
                <span class="nom">{{ mission.etablissement.nom }}</span>
                <span v-if="mission.urgente" class="urgent">Urgent</span>
              </span>

              <span class="lieu">
                {{ mission.etablissement.localisation }}
                <template v-if="mission.distance !== null">
                  &middot; {{ mission.distance }} km
                </template>
                &middot; {{ mission.tauxHoraire }}
              </span>

              <!-- Information sans equivalent dans le canvas, mais decisive :
                   une mission hors rayon ne sera jamais proposee. -->
              <span v-if="mission.horsRayon" class="hors-rayon">
                Au-delà de votre rayon de déplacement
              </span>
            </span>

            <span class="creneaux">
              <span class="jour">{{ mission.jour }}</span>
              <span class="heures">{{ mission.horaires }}</span>
            </span>

            <span class="ouvrir">Voir le détail</span>
          </NuxtLink>
        </li>
      </ul>
    </template>
  </section>
</template>

<style scoped>
h1 {
  margin: 0 0 24px;
  font-size: clamp(28px, 5vw, 34px);
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: -0.03em;
}

.barre {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  margin-bottom: 18px;
}

.recherche {
  display: flex;
  flex: 1;
  gap: 12px;
  align-items: center;
  min-width: 260px;
  padding: 13px 16px;
  color: var(--muted);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 14px;
}

.recherche:focus-within {
  border-color: var(--dom);
}

.recherche input {
  width: 100%;
  font-family: var(--sans);
  font-size: 15px;
  color: var(--ink);
  background: transparent;
  border: 0;
  outline: none;
}

.filtres {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.filtre {
  padding: 11px 15px;
  font-family: var(--sans);
  font-size: 13.5px;
  font-weight: 600;
  color: var(--dom-fonce);
  white-space: nowrap;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 24px;
  cursor: pointer;
}

.filtre.actif {
  color: var(--surface);
  background: var(--dom);
  border-color: var(--dom);
}

.filtre:focus-visible,
.carte:focus-visible {
  outline: 2px solid var(--dom);
  outline-offset: 2px;
}

.titre-liste {
  margin: 0 0 16px;
  font-size: 16px;
  font-weight: 600;
}

.liste {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 0;
  margin: 0;
  list-style: none;
}

.carte {
  display: flex;
  gap: 18px;
  align-items: center;
  padding: 20px 22px;
  color: inherit;
  text-decoration: none;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 18px;
}

.carte:hover {
  border-color: var(--dom);
}

.pastille {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  font-size: 14px;
  font-weight: 700;
  color: var(--dom);
  background: var(--surface-2);
  border-radius: 12px;
}

.copie {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.ligne-nom {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-bottom: 4px;
}

.nom {
  overflow: hidden;
  font-size: 16px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.urgent {
  flex: none;
  padding: 4px 9px;
  font-size: 11px;
  font-weight: 700;
  color: var(--eta);
  background: var(--eta-soft);
  border-radius: 20px;
}

.lieu {
  font-size: 13px;
  color: var(--muted);
}

.hors-rayon {
  margin-top: 3px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--eta);
}

.creneaux {
  display: flex;
  flex: none;
  flex-wrap: wrap;
  gap: 8px;
}

.jour,
.heures {
  padding: 6px 11px;
  font-size: 12.5px;
  white-space: nowrap;
  border-radius: 20px;
}

.jour {
  font-weight: 600;
  color: var(--dom);
  background: var(--surface-2);
}

.heures {
  color: var(--muted);
  background: var(--ground);
  border: 1px solid var(--line);
}

.ouvrir {
  flex: none;
  min-width: 86px;
  font-size: 14px;
  font-weight: 600;
  color: var(--dom);
  text-align: right;
}

/* Le canvas dessine la carte sur une seule ligne, ce qui ne tient plus des que
 * la colonne se resserre : les trois blocs passent alors les uns sous les
 * autres, la pastille restant en tete. */
@media (max-width: 760px) {
  .carte {
    flex-wrap: wrap;
    gap: 12px 16px;
  }

  .copie {
    flex-basis: calc(100% - 60px);
  }

  .creneaux,
  .ouvrir {
    min-width: 0;
    text-align: left;
  }
}

.vide {
  padding: 40px;
  margin: 0;
  font-size: 15px;
  color: var(--muted);
  text-align: center;
  background: var(--surface);
  border: 1px dashed var(--line-forte);
  border-radius: 18px;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
</style>
