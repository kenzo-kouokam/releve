<script setup lang="ts">
import type {
  CandidatDetail,
  Disponibilite,
  QualificationResume,
  StatutCandidat,
} from '@releve/shared';
import { chevauchements, JOURS_SEMAINE, STATUT_CANDIDAT_LIBELLES } from '@releve/shared';

const route = useRoute();
const { requete } = useApi();

const identifiant = computed(() => String(route.params.id));

const { data: candidat, error } = await useAsyncData<CandidatDetail>(
  () => `candidat:${identifiant.value}`,
  () => requete<CandidatDetail>(`/candidats/${identifiant.value}`),
);

const { data: referentiel } = await useAsyncData<QualificationResume[]>('referentiel', () =>
  requete<QualificationResume[]>('/qualifications'),
);

const introuvable = computed(
  () => (error.value as { statusCode?: number } | null)?.statusCode === 404,
);

const message = ref('');
const enCours = ref(false);

/**
 * Toutes les ecritures renvoient la fiche complete : on remplace l'etat local
 * plutot que de le rafistoler champ par champ, ce qui evite qu'un ecran reste
 * desynchronise d'une regle appliquee cote serveur.
 */
async function appliquer(action: () => Promise<CandidatDetail>): Promise<void> {
  message.value = '';
  enCours.value = true;

  try {
    candidat.value = await action();
  } catch (cause) {
    const corps = (
      cause as { data?: { message?: string; erreurs?: { champ: string; message: string }[] } }
    ).data;

    message.value = corps?.erreurs?.length
      ? corps.erreurs.map((e) => `${e.champ} : ${e.message}`).join(' · ')
      : (corps?.message ?? 'Erreur inattendue');
  } finally {
    enCours.value = false;
  }
}

// --- statut et fiche

function changerStatut(statut: StatutCandidat): Promise<void> {
  return appliquer(() =>
    requete<CandidatDetail>(`/candidats/${identifiant.value}`, {
      method: 'PATCH',
      body: { statut },
    }),
  );
}

const STATUTS = Object.entries(STATUT_CANDIDAT_LIBELLES) as [StatutCandidat, string][];

function basculerMobilite(champ: 'permisB' | 'vehicule'): Promise<void> {
  return appliquer(() =>
    requete<CandidatDetail>(`/candidats/${identifiant.value}`, {
      method: 'PATCH',
      body: { [champ]: !candidat.value?.[champ] },
    }),
  );
}

const visiteMedicale = ref('');
watchEffect(() => {
  visiteMedicale.value = candidat.value?.visiteMedicaleLe ?? '';
});

function enregistrerAptitude(): Promise<void> {
  return appliquer(() =>
    requete<CandidatDetail>(`/candidats/${identifiant.value}`, {
      method: 'PATCH',
      body: {
        visiteMedicaleLe: visiteMedicale.value || null,
        vaccinationVerifiee: candidat.value?.vaccinationVerifiee ?? false,
      },
    }),
  );
}

function basculerVaccination(): Promise<void> {
  return appliquer(() =>
    requete<CandidatDetail>(`/candidats/${identifiant.value}`, {
      method: 'PATCH',
      body: { vaccinationVerifiee: !candidat.value?.vaccinationVerifiee },
    }),
  );
}

// --- qualifications

const qualificationAAjouter = ref('');

const disponiblesAAjouter = computed(() => {
  const deja = new Set((candidat.value?.qualificationsDetail ?? []).map((q) => q.qualificationId));
  return (referentiel.value ?? []).filter((q) => !deja.has(q.id));
});

function ajouterQualification(): Promise<void> {
  const qualificationId = qualificationAAjouter.value;
  qualificationAAjouter.value = '';

  return appliquer(() =>
    requete<CandidatDetail>(`/candidats/${identifiant.value}/qualifications`, {
      method: 'POST',
      body: { qualificationId },
    }),
  );
}

function basculerVerification(qualificationId: string, verifiee: boolean): Promise<void> {
  return appliquer(() =>
    requete<CandidatDetail>(`/candidats/${identifiant.value}/qualifications/${qualificationId}`, {
      method: 'PATCH',
      body: { verifiee },
    }),
  );
}

function retirerQualification(qualificationId: string): Promise<void> {
  return appliquer(() =>
    requete<CandidatDetail>(`/candidats/${identifiant.value}/qualifications/${qualificationId}`, {
      method: 'DELETE',
    }),
  );
}

// --- disponibilites

const planning = ref<Disponibilite[]>([]);

watchEffect(() => {
  planning.value = (candidat.value?.disponibilites ?? []).map((creneau) => ({
    jourSemaine: creneau.jourSemaine,
    heureDebut: creneau.heureDebut,
    heureFin: creneau.heureFin,
    recurrente: creneau.recurrente,
  }));
});

// Le meme calcul que le serveur, joue a la saisie : le chargé de recrutement
// voit le conflit avant d'enregistrer, pas apres.
const conflits = computed(() => new Set(chevauchements(planning.value)));

function ajouterCreneau(): void {
  planning.value.push({
    jourSemaine: 1,
    heureDebut: '07:00',
    heureFin: '12:00',
    recurrente: true,
  });
}

function enregistrerPlanning(): Promise<void> {
  return appliquer(() =>
    requete<CandidatDetail>(`/candidats/${identifiant.value}/disponibilites`, {
      method: 'PUT',
      body: { disponibilites: planning.value },
    }),
  );
}

// --- indisponibilites

const indispoDu = ref('');
const indispoAu = ref('');
const indispoMotif = ref('');

function ajouterIndisponibilite(): Promise<void> {
  const body = {
    du: indispoDu.value,
    au: indispoAu.value,
    ...(indispoMotif.value ? { motif: indispoMotif.value } : {}),
  };

  return appliquer(async () => {
    const maj = await requete<CandidatDetail>(`/candidats/${identifiant.value}/indisponibilites`, {
      method: 'POST',
      body,
    });

    indispoDu.value = '';
    indispoAu.value = '';
    indispoMotif.value = '';

    return maj;
  });
}

function retirerIndisponibilite(indisponibiliteId: string): Promise<void> {
  return appliquer(() =>
    requete<CandidatDetail>(
      `/candidats/${identifiant.value}/indisponibilites/${indisponibiliteId}`,
      { method: 'DELETE' },
    ),
  );
}
</script>

<template>
  <section class="fiche">
    <NuxtLink class="retour" to="/">&larr; Retour au vivier</NuxtLink>

    <p v-if="introuvable" class="alerte">
      Ce candidat n existe pas, ou il appartient a une autre agence.
    </p>

    <p v-else-if="error" class="alerte">API injoignable.</p>

    <template v-else-if="candidat">
      <div class="titre">
        <h1>{{ candidat.prenom }} {{ candidat.nom }}</h1>
      </div>

      <p class="coordonnees">
        {{ candidat.email }} &middot; {{ candidat.telephone }}<br />
        {{ candidat.adresse }}, {{ candidat.codePostal }} {{ candidat.ville }} &middot; rayon
        {{ candidat.rayonKm }} km
      </p>

      <p v-if="message" class="alerte">{{ message }}</p>

      <!-- statut -->
      <section class="bloc">
        <h2>Statut</h2>
        <div class="ligne-actions">
          <button
            v-for="[code, libelle] in STATUTS"
            :key="code"
            type="button"
            class="choix"
            :class="{ actif: candidat.statut === code }"
            :disabled="enCours || candidat.statut === code"
            @click="changerStatut(code)"
          >
            {{ libelle }}
          </button>
        </div>
        <p class="note">
          Passer ACTIF exige au moins une qualification verifiee et non expiree : c est ce statut
          qui rend le candidat proposable sur une mission.
        </p>
      </section>

      <!-- mobilite et aptitude -->
      <section class="bloc">
        <h2>Mobilite et aptitude</h2>
        <div class="ligne-actions">
          <button
            type="button"
            class="choix"
            :class="{ actif: candidat.permisB }"
            :disabled="enCours"
            @click="basculerMobilite('permisB')"
          >
            Permis B
          </button>
          <button
            type="button"
            class="choix"
            :class="{ actif: candidat.vehicule }"
            :disabled="enCours"
            @click="basculerMobilite('vehicule')"
          >
            Vehicule
          </button>
          <button
            type="button"
            class="choix"
            :class="{ actif: candidat.vaccinationVerifiee }"
            :disabled="enCours"
            @click="basculerVaccination()"
          >
            Vaccination verifiee
          </button>
        </div>

        <form class="ligne-form" @submit.prevent="enregistrerAptitude()">
          <label>
            <span>Derniere visite medicale</span>
            <input id="visite-medicale" v-model="visiteMedicale" type="date" />
          </label>
          <button type="submit" :disabled="enCours">Enregistrer</button>
        </form>

        <p class="note rgpd">
          Une date et deux booleens, rien de plus. La plateforme a besoin de savoir si le candidat
          est deployable, pas pourquoi : aucun motif, aucun document medical.
        </p>
      </section>

      <!-- qualifications -->
      <section class="bloc">
        <h2>
          Qualifications <span class="compte">{{ candidat.qualificationsDetail.length }}</span>
        </h2>

        <p v-if="!candidat.qualificationsDetail.length" class="vide">
          Aucune qualification rattachee.
        </p>

        <ul v-else class="liste">
          <li v-for="q in candidat.qualificationsDetail" :key="q.qualificationId" class="rangee">
            <div>
              <p class="nom">{{ q.code }} &middot; {{ q.libelle }}</p>
              <p class="detail">
                <template v-if="q.obtenueLe">obtenue le {{ q.obtenueLe }}</template>
                <template v-else>date d obtention inconnue</template>
                <template v-if="q.expireLe"> &middot; expire le {{ q.expireLe }}</template>
                <template v-if="q.verifieePar"> &middot; verifiee par {{ q.verifieePar }}</template>
              </p>
            </div>

            <span v-if="q.expiree" class="etat expiree">Expiree</span>
            <span v-else-if="q.verifieeLe" class="etat verifiee">Verifiee</span>
            <span v-else class="etat attente">A verifier</span>

            <div class="actions">
              <button
                type="button"
                class="lien"
                :disabled="enCours"
                @click="basculerVerification(q.qualificationId, !q.verifieeLe)"
              >
                {{ q.verifieeLe ? 'Annuler la verification' : 'Verifier' }}
              </button>
              <button
                type="button"
                class="lien danger"
                :disabled="enCours"
                @click="retirerQualification(q.qualificationId)"
              >
                Retirer
              </button>
            </div>
          </li>
        </ul>

        <form class="ligne-form" @submit.prevent="ajouterQualification()">
          <label class="grandir">
            <span>Ajouter depuis le referentiel</span>
            <select id="ajout-qualification" v-model="qualificationAAjouter">
              <option value="">Choisir une qualification</option>
              <option v-for="q in disponiblesAAjouter" :key="q.id" :value="q.id">
                {{ q.code }} - {{ q.libelle }}
              </option>
            </select>
          </label>
          <button type="submit" :disabled="enCours || !qualificationAAjouter">Rattacher</button>
        </form>
      </section>

      <!-- disponibilites -->
      <section class="bloc">
        <h2>Disponibilites hebdomadaires</h2>

        <p v-if="!planning.length" class="vide">Aucun creneau.</p>

        <ul v-else class="liste">
          <li
            v-for="(creneau, index) in planning"
            :key="index"
            class="creneau"
            :class="{ conflit: conflits.has(index) }"
          >
            <select
              v-model.number="creneau.jourSemaine"
              :aria-label="`Jour du creneau ${index + 1}`"
            >
              <option v-for="(jour, position) in JOURS_SEMAINE" :key="jour" :value="position + 1">
                {{ jour }}
              </option>
            </select>
            <input v-model="creneau.heureDebut" type="time" :aria-label="`Debut ${index + 1}`" />
            <input v-model="creneau.heureFin" type="time" :aria-label="`Fin ${index + 1}`" />
            <span v-if="conflits.has(index)" class="etat expiree">Chevauchement</span>
            <button type="button" class="lien danger" @click="planning.splice(index, 1)">
              Supprimer
            </button>
          </li>
        </ul>

        <div class="ligne-actions">
          <button type="button" class="choix" @click="ajouterCreneau()">
            + Ajouter un creneau
          </button>
          <button
            type="button"
            :disabled="enCours || conflits.size > 0"
            @click="enregistrerPlanning()"
          >
            Enregistrer le planning
          </button>
        </div>

        <p class="note">
          Un creneau dont la fin precede le debut traverse minuit : 20:00 - 07:00 est une nuit en
          etablissement, pas une erreur de saisie.
        </p>
      </section>

      <!-- indisponibilites -->
      <section class="bloc">
        <h2>Indisponibilites</h2>

        <p v-if="!candidat.indisponibilites.length" class="vide">Aucune periode declaree.</p>

        <ul v-else class="liste">
          <li v-for="periode in candidat.indisponibilites" :key="periode.id" class="rangee">
            <p class="nom">Du {{ periode.du }} au {{ periode.au }}</p>
            <p class="detail">{{ periode.motif ?? 'sans motif' }}</p>
            <div class="actions">
              <button
                type="button"
                class="lien danger"
                :disabled="enCours"
                @click="retirerIndisponibilite(periode.id)"
              >
                Supprimer
              </button>
            </div>
          </li>
        </ul>

        <form class="ligne-form" @submit.prevent="ajouterIndisponibilite()">
          <label>
            <span>Du</span>
            <input id="indispo-du" v-model="indispoDu" type="date" required />
          </label>
          <label>
            <span>Au</span>
            <input id="indispo-au" v-model="indispoAu" type="date" required />
          </label>
          <label class="grandir">
            <span>Motif (facultatif)</span>
            <input id="indispo-motif" v-model="indispoMotif" type="text" maxlength="160" />
          </label>
          <button type="submit" :disabled="enCours">Ajouter</button>
        </form>
      </section>
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
  gap: 10px 12px;
  margin: 14px 0 8px;
}

h1 {
  margin: 0;
  font-size: 1.6rem;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.coordonnees {
  margin: 0 0 22px;
  font-family: var(--mono);
  font-size: 11.5px;
  line-height: 1.7;
  color: var(--muted);
}

.bloc {
  margin-bottom: 26px;
  padding: 18px;
  background: var(--surface);
  border: 1px solid var(--line);
}

h2 {
  margin: 0 0 14px;
  font-size: 1rem;
  font-weight: 700;
}

h2 .compte {
  font-family: var(--mono);
  font-size: 12px;
  font-weight: 400;
  color: var(--muted);
}

.ligne-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.ligne-form {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: end;
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--line);
}

.ligne-form label {
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}

.ligne-form .grandir {
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
  padding: 9px 16px;
  border: 0;
  border-radius: 3px;
  background: var(--dom);
  color: var(--surface);
  cursor: pointer;
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.choix {
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  font-weight: 400;
  padding: 7px 12px;
  background: var(--ground);
  color: var(--muted);
  border: 1px solid var(--line);
}

.choix.actif {
  background: var(--dom-soft);
  color: var(--dom);
  border-color: var(--dom);
  font-weight: 700;
}

.lien {
  background: none;
  color: var(--dom);
  font-weight: 400;
  font-size: 0.84rem;
  padding: 4px 0;
  text-decoration: underline;
}

.lien.danger {
  color: var(--eta);
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

.rangee {
  background: var(--surface);
  padding: 12px 14px;
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 8px 16px;
  align-items: center;
}

.creneau {
  background: var(--surface);
  padding: 10px 14px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.creneau.conflit {
  background: var(--eta-soft);
}

@media (max-width: 720px) {
  .rangee {
    grid-template-columns: 1fr;
    align-items: start;
  }
}

.nom {
  margin: 0;
  font-weight: 700;
  font-size: 0.94rem;
}

.detail {
  margin: 3px 0 0;
  font-family: var(--mono);
  font-size: 11px;
  color: var(--muted);
}

.actions {
  display: flex;
  gap: 14px;
}

.etat {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 3px 8px;
  border-radius: 2px;
  border: 1px solid;
  justify-self: start;
}

.etat.verifiee {
  color: var(--dom);
  background: var(--dom-soft);
  border-color: var(--dom);
}

.etat.expiree {
  color: var(--eta);
  background: var(--eta-soft);
  border-color: var(--eta);
}

.etat.attente {
  color: var(--muted);
  border-color: var(--line);
  border-style: dashed;
}

.note {
  margin: 14px 0 0;
  font-size: 0.84rem;
  color: var(--muted);
}

.note.rgpd {
  padding: 10px 12px;
  background: var(--dom-soft);
  border-left: 3px solid var(--dom);
  color: var(--ink);
}

.vide {
  margin: 0;
  font-size: 0.9rem;
  color: var(--muted);
}

.alerte {
  font-size: 0.9rem;
  color: var(--ink);
  padding: 12px 14px;
  margin-bottom: 20px;
  background: var(--eta-soft);
  border-left: 3px solid var(--eta);
}
</style>
