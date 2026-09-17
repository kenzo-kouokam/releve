<script setup lang="ts">
import type { PropositionResume } from '@releve/shared';

const route = useRoute();
const { requete } = useApi();

/**
 * L'identifiant de la route est celui de la candidature, pas du candidat : un
 * etablissement ne consulte jamais un profil « en general », il consulte une
 * personne qui a postule chez lui. C'est aussi ce qui borne l'acces.
 */
const identifiant = String(route.params.id);

const { data: proposition, refresh } = await useAsyncData(`candidature:${identifiant}`, () =>
  requete<PropositionResume>(`/propositions/${identifiant}`),
);

if (!proposition.value) {
  throw createError({ statusCode: 404, statusMessage: 'Candidature introuvable', fatal: true });
}

const candidat = computed(() => {
  const donnees = proposition.value;
  if (!donnees) return undefined;

  return {
    ...donnees.candidat,
    nom: `${donnees.candidat.prenom} ${donnees.candidat.nom}`,
    message: donnees.message,
  };
});

useHead({ title: () => `${candidat.value?.nom ?? 'Candidat'} - Relève` });

const mission = computed(() => proposition.value?.mission);
const decidee = computed(() => proposition.value?.statut !== 'ACCEPTEE_CANDIDAT');
const retenu = computed(() => proposition.value?.statut === 'VALIDEE_CLIENT');

/**
 * Le score, tel que l'etablissement doit pouvoir le discuter.
 *
 * On n'affiche jamais le total seul : c'est sa decomposition qui permet de dire
 * pourquoi ce profil-la remonte, et de repondre a qui le conteste. Les
 * candidatures anterieures au moteur n'ont pas de score et l'ecran le dit,
 * plutot que d'afficher un zero trompeur.
 */
const correspondance = computed(() => {
  const donnees = proposition.value;
  if (!donnees || donnees.score === null) return undefined;

  const total = Math.round(donnees.score);

  return {
    valeur: `${total}%`,
    titre:
      total >= 80
        ? 'Excellente correspondance'
        : total >= 55
          ? 'Bonne correspondance'
          : 'Correspondance partielle',
    composantes: donnees.detailScore?.composantes ?? [],
  };
});

const envoi = ref(false);
const erreur = ref('');

async function decider(action: 'valider' | 'refuser'): Promise<void> {
  erreur.value = '';
  envoi.value = true;

  try {
    await requete<PropositionResume>(`/propositions/${identifiant}/${action}`, { method: 'POST' });
    await refresh();
  } catch (cause) {
    const corps = (cause as { data?: { message?: string } }).data;
    erreur.value = corps?.message ?? 'Action impossible pour le moment.';
  } finally {
    envoi.value = false;
  }
}
</script>

<template>
  <section v-if="candidat" class="profil">
    <!-- Le « ••• » du design ouvre un menu qui n'est pas dessine : la barre est
         reprise sans action plutot qu'avec un bouton sans contenu. -->
    <AppBarreApp titre="Profil candidat" />

    <div class="corps">
      <header class="identite">
        <AppAvatar :initiales="candidat.initiales" teinte="lavande" />
        <div class="copie">
          <h1>{{ candidat.nom }}</h1>
          <p class="qualification">{{ candidat.qualification }}</p>
          <div class="etiquettes">
            <AppBadge v-for="etiquette in candidat.etiquettes" :key="etiquette" teinte="vert">
              {{ etiquette }}
            </AppBadge>
          </div>
        </div>
      </header>

      <AppCarte v-if="correspondance" variante="pleine" class="correspondance">
        <p class="score">{{ correspondance.valeur }}</p>
        <div>
          <p class="titre-score">{{ correspondance.titre }}</p>
          <p class="justification">Score calcule a la candidature, sur 100.</p>
        </div>
      </AppCarte>

      <AppCarte v-if="correspondance?.composantes.length" class="bareme">
        <h2>Comment ce score se decompose</h2>
        <ul>
          <li v-for="part in correspondance.composantes" :key="part.cle">
            <div class="ligne">
              <span class="quoi">{{ part.libelle }}</span>
              <span class="chiffre">{{ part.points }} / {{ part.sur }}</span>
            </div>
            <div class="jauge">
              <span :style="{ width: `${Math.round((part.points / part.sur) * 100)}%` }" />
            </div>
            <p class="pourquoi">{{ part.explication }}</p>
          </li>
        </ul>
      </AppCarte>

      <AppCarte v-if="mission" class="mission">
        <p class="libelle-mission">Candidature pour</p>
        <p class="valeur-mission">
          {{ mission.qualificationRequise.libelle }} - {{ jourCourt(mission.dateDebut) }},
          {{ horaires(mission.heureDebut, mission.heureFin) }}
        </p>
        <p class="lieu-mission">{{ mission.lieu.libelle }} - {{ mission.lieu.ville }}</p>
      </AppCarte>

      <AppCarte class="atouts">
        <div v-for="point in candidat.pointsForts" :key="point.libelle" class="atout">
          <AppIcon :nom="point.icone" :taille="18" />
          <div>
            <p class="libelle">{{ point.libelle }}</p>
            <p class="valeur">{{ point.valeur }}</p>
          </div>
        </div>
      </AppCarte>

      <section v-if="candidat.message" class="message">
        <h2>Message</h2>
        <p class="citation">&laquo; {{ candidat.message }} &raquo;</p>
      </section>

      <div class="actions">
        <p v-if="erreur" class="refus" role="alert">{{ erreur }}</p>

        <template v-if="decidee">
          <p class="avertissement" role="status">
            {{
              retenu
                ? `${candidat.prenom} est confirme sur cette mission.`
                : 'Cette candidature a ete ecartee.'
            }}
          </p>
          <AppBouton variante="secondaire" to="/etablissement">Retour a l accueil</AppBouton>
        </template>

        <template v-else>
          <AppBouton icone="check" :desactive="envoi" @click="decider('valider')">
            {{ envoi ? 'Enregistrement...' : `Confirmer ${candidat.prenom}` }}
          </AppBouton>

          <AppBouton variante="secondaire" :desactive="envoi" @click="decider('refuser')">
            Ecarter cette candidature
          </AppBouton>

          <p class="avertissement">
            Confirmer pourvoit la mission : les autres candidatures sont automatiquement ecartees.
          </p>
        </template>
      </div>
    </div>
  </section>
</template>

<style scoped>
.bareme h2 {
  margin: 0 0 12px;
  font-size: 0.95rem;
  font-weight: 700;
}

.bareme ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 14px;
}

.bareme .ligne {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
}

.bareme .quoi {
  font-weight: 700;
  font-size: 0.9rem;
}

.bareme .chiffre {
  font-family: var(--mono);
  font-size: 0.8rem;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}

.bareme .jauge {
  height: 5px;
  border-radius: 3px;
  background: var(--surface-2);
  overflow: hidden;
  margin: 5px 0 4px;
}

.bareme .jauge span {
  display: block;
  height: 100%;
  background: var(--dom);
  border-radius: 3px;
}

.bareme .pourquoi {
  margin: 0;
  font-size: 0.82rem;
  line-height: 1.5;
  color: var(--muted);
}

.mission {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.libelle-mission {
  margin: 0;
  font-size: 0.74rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}

.valeur-mission {
  margin: 0;
  font-weight: 700;
}

.lieu-mission {
  margin: 0;
  font-size: 0.86rem;
  color: var(--muted);
}

.refus {
  margin: 0 0 4px;
  padding: 10px 12px;
  font-size: 0.86rem;
  line-height: 1.45;
  color: var(--eta);
  background: var(--eta-soft);
  border-radius: var(--r-champ);
}

.profil {
  padding-block: 16px 0;
}

.corps {
  max-width: 640px;
  padding-top: 12px;
}

.identite {
  display: flex;
  gap: 14px;
  align-items: center;
}

.copie {
  flex: 1;
  min-width: 0;
}

h1 {
  margin: 0 0 4px;
  font-size: 21px;
  font-weight: 400;
}

.qualification {
  margin: 0 0 8px;
  font-size: 13px;
  color: var(--muted);
}

.etiquettes {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.correspondance {
  display: flex;
  gap: 14px;
  align-items: center;
  margin-top: 18px;
  padding: 16px;
  border-radius: var(--r-carte);
}

.score {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 58px;
  height: 58px;
  margin: 0;
  font-size: 18px;
  color: var(--dom-fonce);
  background: var(--dom-soft);
  border-radius: 999px;
}

.titre-score {
  margin: 0 0 4px;
  font-size: 15px;
  font-weight: 700;
}

.justification {
  margin: 0;
  font-size: 11px;
  line-height: 1.4;
  color: var(--dom-contraste);
}

.atouts {
  display: grid;
  gap: 14px;
  margin-top: 18px;
}

.atout {
  display: flex;
  gap: 12px;
  align-items: center;
  color: var(--dom);
}

.libelle {
  margin: 0 0 2px;
  font-size: 11px;
  color: var(--muted);
}

.valeur {
  margin: 0;
  font-size: 14px;
  color: var(--ink);
}

.message {
  margin-top: 18px;
}

h2 {
  margin: 0 0 8px;
  font-size: 16px;
  font-weight: 700;
}

.citation {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--muted);
}

.actions {
  display: grid;
  gap: 10px;
  max-width: 360px;
  margin-top: 24px;
}

.avertissement {
  margin: 0;
  font-size: 11px;
  line-height: 1.4;
  color: var(--muted);
}
</style>
