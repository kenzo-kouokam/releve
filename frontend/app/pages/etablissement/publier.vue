<script setup lang="ts">
import type { MissionResume, OptionsPublication, SuggestionTaux } from '@releve/shared';

useHead({ title: 'Publier une mission - Relève' });

const { requete } = useApi();

/**
 * Le Figma ne dessine que l'etape 2 sur 3. La barre de progression reprend
 * l'etat de la maquette ; le formulaire, lui, publie vraiment.
 */
const ETAPE_COURANTE = 2;
const NOMBRE_ETAPES = 3;

const { data: options } = await useAsyncData('options-publication', () =>
  requete<OptionsPublication>('/missions/options-publication'),
);

/**
 * Les motifs de recours remplacent les niveaux d'urgence de la maquette.
 *
 * Le motif est une mention obligatoire du contrat de mission : sans lui, le
 * contrat est requalifiable. L'urgence, elle, n'etait stockee nulle part et se
 * lit deja dans la date. Meme controle visuel, information utile.
 */
const MOTIFS = [
  "Remplacement d'un salarie absent",
  "Accroissement temporaire d'activite",
  'Emploi a caractere saisonnier',
] as const;

const CRENEAUX = ['18:00-22:00', '07:00-14:00', '08:00-20:00', 'Autre horaire'] as const;

function jourIso(decalageJours = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + decalageJours);

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

const qualificationId = ref('');
const lieuId = ref('');
const date = ref(jourIso());
const creneau = ref<string>(CRENEAUX[0]);
const heureDebut = ref('18:00');
const heureFin = ref('22:00');
const motifRecours = ref<string>(MOTIFS[0]);
const taux = ref('');

const modificationTaux = ref(false);
const recapitulatif = ref(false);
const envoi = ref(false);
const erreur = ref('');
const publiee = ref<MissionResume | null>(null);

// Premier choix disponible des que les options arrivent.
watchEffect(() => {
  const catalogue = options.value;
  if (!catalogue) return;

  qualificationId.value ||= catalogue.qualifications[0]?.id ?? '';
  lieuId.value ||= catalogue.lieux[0]?.id ?? '';
});

const qualification = computed(() =>
  options.value?.qualifications.find((option) => option.id === qualificationId.value),
);

const lieu = computed(() => options.value?.lieux.find((option) => option.id === lieuId.value));

/** « 18:00-22:00 » se scinde en deux heures ; « Autre horaire » laisse la saisie libre. */
watch(creneau, (valeur) => {
  const bornes = valeur.split('-');

  if (bornes.length === 2 && bornes[0] && bornes[1]) {
    heureDebut.value = bornes[0];
    heureFin.value = bornes[1];
  }
});

/**
 * Taux median du marche, depuis les offres France Travail collectees.
 *
 * C'est le second usage visible de la donnee publique : l'etablissement voit ce
 * que paie le marche autour de lui au lieu de deviner. Le departement se deduit
 * du code postal du lieu choisi.
 */
const { data: suggestion } = await useAsyncData(
  'taux-suggere',
  async () => {
    const rome = qualification.value?.romeCode;
    if (!rome) return null;

    return requete<SuggestionTaux>('/tension/suggestion', {
      query: {
        rome,
        ...(lieu.value ? { departement: lieu.value.codePostal.slice(0, 2) } : {}),
        jours: 90,
      },
    }).catch(() => null);
  },
  { watch: [qualification, lieu] },
);

// Le taux propose n'est pas impose : il pre-remplit, l'etablissement tranche.
watchEffect(() => {
  const median = suggestion.value?.tauxHoraireMedian;

  if (median && !taux.value) {
    taux.value = median.toFixed(2).replace('.', ',');
  }
});

/** Taux du marche, mis en forme a la francaise pour l'encart de suggestion. */
const tauxMarche = computed(() =>
  suggestion.value?.tauxHoraireMedian
    ? suggestion.value.tauxHoraireMedian.toFixed(2).replace('.', ',')
    : '',
);

const resume = computed(() => [
  { libelle: 'Poste recherche', valeur: qualification.value?.libelle ?? '-' },
  { libelle: 'Date', valeur: dateComplete(date.value) },
  { libelle: 'Horaires', valeur: `${heureDebut.value}-${heureFin.value}` },
  { libelle: 'Lieu d intervention', valeur: lieu.value?.libelle ?? '-' },
  { libelle: 'Motif de recours', valeur: motifRecours.value },
  { libelle: 'Remuneration indicative', valeur: `${taux.value || '-'} EUR brut / heure` },
]);

async function publier(): Promise<void> {
  erreur.value = '';
  envoi.value = true;

  try {
    publiee.value = await requete<MissionResume>('/missions', {
      method: 'POST',
      body: {
        lieuId: lieuId.value,
        qualificationRequiseId: qualificationId.value,
        dateDebut: date.value,
        dateFin: date.value,
        heureDebut: heureDebut.value,
        heureFin: heureFin.value,
        motifRecours: motifRecours.value,
        ...(taux.value ? { tauxHoraire: Number(taux.value.replace(',', '.')) } : {}),
      },
    });
  } catch (cause) {
    const corps = (
      cause as { data?: { message?: string; erreurs?: { champ: string; message: string }[] } }
    ).data;

    erreur.value = corps?.erreurs?.length
      ? corps.erreurs.map((souci) => `${souci.champ} : ${souci.message}`).join(' · ')
      : (corps?.message ?? 'Publication impossible pour le moment.');
  } finally {
    envoi.value = false;
  }
}
</script>

<template>
  <section class="publier">
    <AppBarreApp titre="Nouvelle mission" action="Brouillon" />

    <div
      class="progression"
      role="progressbar"
      :aria-valuenow="ETAPE_COURANTE"
      :aria-valuemin="1"
      :aria-valuemax="NOMBRE_ETAPES"
      :aria-label="`Etape ${ETAPE_COURANTE} sur ${NOMBRE_ETAPES}`"
    >
      <span
        v-for="etape in NOMBRE_ETAPES"
        :key="etape"
        :class="{ faite: etape <= ETAPE_COURANTE }"
      />
    </div>

    <div class="corps">
      <header class="tete">
        <p class="etape">Etape {{ ETAPE_COURANTE }} sur {{ NOMBRE_ETAPES }}</p>
        <h1>Precisez votre besoin</h1>
        <p class="intro">
          Ces informations seront visibles par les professionnel&middot;les disponibles.
        </p>
      </header>

      <form class="formulaire" @submit.prevent="recapitulatif = true">
        <label class="champ">
          <span class="libelle">Poste recherche</span>
          <span class="boite">
            <AppIcon nom="ambulance" :taille="17" />
            <select v-model="qualificationId">
              <option
                v-for="option in options?.qualifications ?? []"
                :key="option.id"
                :value="option.id"
              >
                {{ option.libelle }}
              </option>
            </select>
            <AppIcon nom="chevron-down" :taille="15" />
          </span>
        </label>

        <div class="duo">
          <label class="champ">
            <span class="libelle">Date</span>
            <span class="boite">
              <AppIcon nom="calendar" :taille="17" />
              <!-- Un champ date plutot que des libelles : la mission part en
                   base avec une vraie date, utilisable par le matching. -->
              <input v-model="date" type="date" :min="jourIso()" />
            </span>
          </label>

          <label class="champ">
            <span class="libelle">Horaires</span>
            <span class="boite">
              <AppIcon nom="clock" :taille="17" />
              <select v-model="creneau">
                <option v-for="option in CRENEAUX" :key="option">{{ option }}</option>
              </select>
              <AppIcon nom="chevron-down" :taille="15" />
            </span>
          </label>
        </div>

        <div v-if="creneau === 'Autre horaire'" class="duo">
          <label class="champ">
            <span class="libelle">Debut</span>
            <span class="boite">
              <AppIcon nom="clock" :taille="17" />
              <input v-model="heureDebut" type="time" />
            </span>
          </label>
          <label class="champ">
            <span class="libelle">Fin</span>
            <span class="boite">
              <AppIcon nom="clock" :taille="17" />
              <input v-model="heureFin" type="time" />
            </span>
          </label>
        </div>

        <label class="champ">
          <span class="libelle">Lieu d intervention</span>
          <span class="boite">
            <AppIcon nom="home" :taille="17" />
            <select v-model="lieuId">
              <option v-for="option in options?.lieux ?? []" :key="option.id" :value="option.id">
                {{ option.libelle }} - {{ option.ville }}
              </option>
            </select>
            <AppIcon nom="chevron-down" :taille="15" />
          </span>
        </label>

        <fieldset class="urgence">
          <legend class="libelle">Motif de recours</legend>
          <div class="options">
            <button
              v-for="motif in MOTIFS"
              :key="motif"
              type="button"
              class="option"
              :aria-pressed="motifRecours === motif"
              @click="motifRecours = motif"
            >
              <AppBadge :teinte="motifRecours === motif ? 'corail' : 'neutre'">
                {{ motif }}
              </AppBadge>
            </button>
          </div>
          <p class="mention-legale">
            Mention obligatoire du contrat de mission : sans motif, le contrat est requalifiable.
          </p>
        </fieldset>

        <div class="remuneration">
          <div class="copie">
            <p class="libelle">Remuneration indicative</p>
            <p v-if="!modificationTaux" class="montant">
              {{ taux || 'a definir' }} EUR brut / heure
            </p>
            <label v-else class="saisie">
              <span class="sr-only">Remuneration horaire brute en euros</span>
              <input v-model="taux" type="text" inputmode="decimal" />
              <span>EUR brut / heure</span>
            </label>
          </div>
          <button type="button" class="modifier" @click="modificationTaux = !modificationTaux">
            {{ modificationTaux ? 'Valider' : 'Modifier' }}
          </button>
        </div>

        <p v-if="suggestion?.tauxHoraireMedian" class="marche">
          Le marche paie <strong>{{ tauxMarche }} EUR</strong> de l heure en mediane pour ce metier
          {{
            suggestion.perimetre === 'departemental' ? 'dans ce departement' : 'au niveau national'
          }}, sur {{ suggestion.offres }} offres France Travail des 90 derniers jours.
        </p>

        <div class="actions">
          <AppBouton type="submit" icone="arrow-right">Voir le recapitulatif</AppBouton>
        </div>
      </form>

      <AppCarte v-if="publiee" class="resume">
        <h2>Mission publiee</h2>
        <p class="reference">
          Reference {{ publiee.reference }} : elle est desormais visible des interimaires qualifies.
        </p>
        <div class="actions">
          <AppBouton to="/etablissement">Retour a l accueil</AppBouton>
        </div>
      </AppCarte>

      <AppCarte v-else-if="recapitulatif" class="resume">
        <h2>Recapitulatif</h2>
        <dl>
          <div v-for="ligne in resume" :key="ligne.libelle">
            <dt>{{ ligne.libelle }}</dt>
            <dd>{{ ligne.valeur }}</dd>
          </div>
        </dl>

        <p v-if="erreur" class="refus" role="alert">{{ erreur }}</p>

        <div class="actions">
          <AppBouton icone="send" :desactive="envoi" @click="publier()">
            {{ envoi ? 'Publication...' : 'Publier la mission' }}
          </AppBouton>
        </div>
      </AppCarte>
    </div>
  </section>
</template>

<style scoped>
.mention-legale {
  margin: 8px 0 0;
  font-size: 0.78rem;
  line-height: 1.45;
  color: var(--muted);
}

.marche {
  margin: 0;
  padding: 11px 13px;
  font-size: 0.84rem;
  line-height: 1.5;
  color: var(--ink);
  background: var(--dom-soft);
  border-radius: var(--r-champ);
}

.refus {
  margin: 12px 0 0;
  padding: 10px 12px;
  font-size: 0.86rem;
  line-height: 1.45;
  color: var(--eta);
  background: var(--eta-soft);
  border-radius: var(--r-champ);
}

.reference {
  margin: 0 0 14px;
  color: var(--muted);
  line-height: 1.5;
}

.publier {
  padding-block: 16px 0;
}

.progression {
  display: flex;
  gap: 8px;
  max-width: 640px;
  padding-block: 10px;
}

.progression span {
  flex: 1;
  height: 4px;
  background: var(--line);
  border-radius: 2px;
}

.progression span.faite {
  background: var(--dom);
}

.corps {
  max-width: 640px;
  padding-top: 12px;
}

.etape {
  margin: 0 0 6px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--eta);
}

h1 {
  margin: 0 0 6px;
  font-size: 24px;
  font-weight: 400;
}

.intro {
  margin: 0;
  font-size: 13px;
  line-height: 1.45;
  color: var(--muted);
}

.formulaire {
  display: grid;
  gap: 16px;
  margin-top: 16px;
}

.champ {
  display: grid;
  gap: 7px;
}

.libelle {
  font-size: 12px;
  color: var(--ink);
}

.boite {
  display: flex;
  gap: 10px;
  align-items: center;
  height: 48px;
  padding-inline: 14px;
  color: var(--dom);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 10px;
}

.boite input[type='date'],
.boite input[type='time'] {
  flex: 1;
  border: 0;
  background: none;
  font: inherit;
  color: inherit;
  padding: 0;
}

.boite select {
  flex: 1;
  min-width: 0;
  font-family: var(--sans);
  font-size: 13px;
  color: var(--ink);
  background: none;
  border: 0;
  appearance: none;
  cursor: pointer;
}

.boite select:focus-visible {
  outline: none;
}

.boite:focus-within {
  outline: 2px solid var(--dom);
  outline-offset: 2px;
}

.duo {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 10px;
}

.urgence {
  margin: 0;
  padding: 0;
  border: 0;
}

.options {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}

.option {
  padding: 0;
  background: none;
  border: 0;
  cursor: pointer;
}

.option:focus-visible {
  outline: 2px solid var(--dom);
  outline-offset: 3px;
  border-radius: 999px;
}

.remuneration {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  padding: 14px;
  background: var(--dom-soft);
  border-radius: var(--r-carte);
}

.remuneration .libelle {
  display: block;
  margin: 0 0 3px;
  font-size: 11px;
  color: var(--muted);
}

.montant {
  margin: 0;
  font-size: 17px;
  color: var(--dom-fonce);
}

.saisie {
  display: flex;
  gap: 8px;
  align-items: baseline;
  font-size: 13px;
  color: var(--dom-fonce);
}

.saisie input {
  width: 5em;
  padding: 4px 8px;
  font-family: var(--sans);
  font-size: 15px;
  color: var(--ink);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 6px;
}

.modifier {
  flex: none;
  padding: 0;
  font-family: var(--sans);
  font-size: 12px;
  color: var(--dom);
  background: none;
  border: 0;
  cursor: pointer;
}

.actions {
  max-width: 360px;
}

.resume {
  margin-top: 24px;
}

h2 {
  margin: 0 0 12px;
  font-size: 16px;
  font-weight: 700;
}

dl {
  display: grid;
  gap: 10px;
  margin: 0;
}

dt {
  font-size: 11px;
  color: var(--muted);
}

dd {
  margin: 2px 0 0;
  font-size: 14px;
  font-weight: 600;
}

.avertissement {
  margin: 16px 0 0;
  font-size: 11px;
  color: var(--muted);
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
