<script setup lang="ts">
import type { CandidatDetail, Disponibilite, QualificationResume } from '@releve/shared';
import { JOURS_SEMAINE, PRECISION_GEOCODAGE_LIBELLES } from '@releve/shared';

useHead({ title: 'Mon profil - Relève' });

const { requete } = useApi();

const { data: profil, refresh } = await useAsyncData('mon-profil', () =>
  requete<CandidatDetail>('/mon-profil'),
);

const { data: completude, refresh: rafraichirCompletude } = await useCompletude();

const { data: referentiel } = await useAsyncData('referentiel-diplomes', () =>
  requete<QualificationResume[]>('/qualifications'),
);

const message = ref('');
const erreur = ref('');
const enCours = ref(false);

/**
 * Toutes les actions passent par ici : une seule gestion d'erreur, et la fiche
 * comme la complétude sont relues après chaque écriture. Sans cela, la barre de
 * progression resterait figée sur l'état d'avant.
 */
async function appliquer(action: () => Promise<unknown>, confirmation: string): Promise<void> {
  message.value = '';
  erreur.value = '';
  enCours.value = true;

  try {
    await action();
    await Promise.all([refresh(), rafraichirCompletude()]);
    message.value = confirmation;
  } catch (cause) {
    const corps = (
      cause as { data?: { message?: string; erreurs?: { champ: string; message: string }[] } }
    ).data;

    erreur.value = corps?.erreurs?.length
      ? corps.erreurs.map((souci) => `${souci.champ} : ${souci.message}`).join(' · ')
      : (corps?.message ?? 'Action impossible pour le moment.');
  } finally {
    enCours.value = false;
  }
}

/* ----------------------------------------------------- coordonnées et secteur */

const form = reactive({
  telephone: '',
  adresse: '',
  codePostal: '',
  ville: '',
  rayonKm: 20,
  permisB: false,
  vehicule: false,
});

watchEffect(() => {
  const fiche = profil.value;
  if (!fiche) return;

  form.telephone = fiche.telephone;
  form.adresse = fiche.adresse;
  form.codePostal = fiche.codePostal;
  form.ville = fiche.ville;
  form.rayonKm = fiche.rayonKm;
  form.permisB = fiche.permisB;
  form.vehicule = fiche.vehicule;
});

function enregistrer(): Promise<void> {
  return appliquer(
    () => requete<CandidatDetail>('/mon-profil', { method: 'PATCH', body: { ...form } }),
    'Profil mis à jour.',
  );
}

/* --------------------------------------------------------------- disponibilités */

const creneaux = ref<Disponibilite[]>([]);

watchEffect(() => {
  creneaux.value = (profil.value?.disponibilites ?? []).map((creneau) => ({
    jourSemaine: creneau.jourSemaine,
    heureDebut: creneau.heureDebut,
    heureFin: creneau.heureFin,
    recurrente: creneau.recurrente,
  }));
});

function ajouterCreneau(): void {
  creneaux.value = [
    ...creneaux.value,
    { jourSemaine: 1, heureDebut: '08:00', heureFin: '12:00', recurrente: true },
  ];
}

function retirerCreneau(index: number): void {
  creneaux.value = creneaux.value.filter((_, rang) => rang !== index);
}

function enregistrerCreneaux(): Promise<void> {
  return appliquer(
    () =>
      requete<CandidatDetail>('/mon-profil/disponibilites', {
        method: 'PUT',
        body: { disponibilites: creneaux.value },
      }),
    'Disponibilités enregistrées.',
  );
}

/* ---------------------------------------------------------------------- diplômes */

const diplomeChoisi = ref('');
const obtenuLe = ref('');

/** Les diplômes déjà déclarés ne sont pas reproposés. */
const diplomesDisponibles = computed(() => {
  const declares = new Set(
    (profil.value?.qualificationsDetail ?? []).map((d) => d.qualificationId),
  );

  return (referentiel.value ?? []).filter((option) => !declares.has(option.id));
});

watchEffect(() => {
  if (!diplomeChoisi.value) {
    diplomeChoisi.value = diplomesDisponibles.value[0]?.id ?? '';
  }
});

function declarer(): Promise<void> {
  return appliquer(
    () =>
      requete<CandidatDetail>('/mon-profil/diplomes', {
        method: 'POST',
        body: {
          qualificationId: diplomeChoisi.value,
          ...(obtenuLe.value ? { obtenueLe: obtenuLe.value } : {}),
        },
      }),
    "Diplôme déclaré. L'agence le vérifiera avant qu'il ne compte.",
  );
}

function retirerDiplome(qualificationId: string): Promise<void> {
  return appliquer(
    () => requete<CandidatDetail>(`/mon-profil/diplomes/${qualificationId}`, { method: 'DELETE' }),
    'Diplôme retiré.',
  );
}

/* ------------------------------------------------------------------ localisation */

/**
 * Ce que l'adresse a donné.
 *
 * L'affichage est volontairement explicite : tant que la personne ne voit pas
 * que son adresse n'est pas localisée, elle attend des missions qui ne
 * viendront jamais — le matching l'écarte sans que rien ne le lui dise.
 */
const localisation = computed(() => {
  const fiche = profil.value;

  if (!fiche) return null;

  if (fiche.latitude === null || fiche.longitude === null) {
    return { situee: false, texte: 'Adresse non localisée : aucune mission ne vous sera proposée' };
  }

  const precision = fiche.geocodePrecision
    ? PRECISION_GEOCODAGE_LIBELLES[fiche.geocodePrecision].toLowerCase()
    : 'inconnue';

  return { situee: true, texte: `Adresse localisée (précision : ${precision})` };
});

/* -------------------------------------------------------------------- experience */

const nouveauPoste = reactive({
  employeur: '',
  intitule: '',
  qualificationId: '',
  debutLe: '',
  finLe: '',
  quotitePourcent: 100,
});

/** Durée telle que le barème la comptera, pour ne pas afficher deux chiffres. */
function dureeLisible(mois: number): string {
  const entiers = Math.round(mois);
  const annees = Math.floor(entiers / 12);
  const restants = entiers % 12;

  if (annees === 0) return `${restants} mois`;

  return restants === 0
    ? `${annees} an${annees > 1 ? 's' : ''}`
    : `${annees} an${annees > 1 ? 's' : ''} et ${restants} mois`;
}

function declarerPoste(): Promise<void> {
  return appliquer(
    () =>
      requete<CandidatDetail>('/mon-profil/experiences', {
        method: 'POST',
        body: {
          employeur: nouveauPoste.employeur,
          intitule: nouveauPoste.intitule,
          debutLe: nouveauPoste.debutLe,
          quotitePourcent: nouveauPoste.quotitePourcent,
          ...(nouveauPoste.qualificationId
            ? { qualificationId: nouveauPoste.qualificationId }
            : {}),
          ...(nouveauPoste.finLe ? { finLe: nouveauPoste.finLe } : {}),
        },
      }).then((fiche) => {
        Object.assign(nouveauPoste, {
          employeur: '',
          intitule: '',
          qualificationId: '',
          debutLe: '',
          finLe: '',
          quotitePourcent: 100,
        });

        return fiche;
      }),
    "Poste déclaré. L'agence le vérifiera avant qu'il ne compte.",
  );
}

function retirerPoste(id: string): Promise<void> {
  return appliquer(
    () => requete<CandidatDetail>(`/mon-profil/experiences/${id}`, { method: 'DELETE' }),
    'Poste retiré.',
  );
}
</script>

<template>
  <section v-if="profil" class="profil">
    <header class="tete">
      <h1>Votre profil</h1>
      <p class="intro">
        Ce que vous renseignez ici décide des missions qui vous sont proposées : votre secteur, vos
        créneaux et vos diplômes entrent directement dans le calcul.
      </p>
    </header>

    <!-- La carte d'identite du canvas : initiales, nom, jauge et part remplie.
         La liste des manques y est ajoutee — la route de completude sait ce qui
         bloque, et le canvas n'affiche qu'un pourcentage muet. -->
    <div v-if="completude" class="identite">
      <div class="haut-identite">
        <span class="avatar">{{ initiales(`${profil.prenom} ${profil.nom}`) }}</span>

        <div class="etat">
          <p class="nom">{{ profil.prenom }} {{ profil.nom }}</p>
          <p class="part">Profil complété à {{ completude.pourcentage }} %</p>
          <div class="jauge"><span :style="{ width: `${completude.pourcentage}%` }" /></div>
        </div>

        <p class="pourcentage">{{ completude.pourcentage }} %</p>
      </div>

      <ul v-if="completude.manques.length" class="manques">
        <li v-for="manque in completude.manques" :key="manque.cle">{{ manque.libelle }}</li>
      </ul>
    </div>

    <AppDossierDocuments base="/mon-profil" />

    <p v-if="message" class="succes" role="status">{{ message }}</p>
    <p v-if="erreur" class="erreur" role="alert">{{ erreur }}</p>

    <section class="bloc">
      <h2>Coordonnées et secteur</h2>
      <form class="grille" @submit.prevent="enregistrer()">
        <label>
          <span>Téléphone</span>
          <input id="telephone" v-model="form.telephone" type="tel" autocomplete="tel" />
        </label>

        <label class="large">
          <span>Adresse</span>
          <input id="adresse" v-model="form.adresse" type="text" autocomplete="street-address" />
        </label>

        <label>
          <span>Code postal</span>
          <input id="code-postal" v-model="form.codePostal" type="text" inputmode="numeric" />
        </label>

        <label>
          <span>Ville</span>
          <input id="ville" v-model="form.ville" type="text" />
        </label>

        <p
          v-if="localisation"
          class="large localisation"
          :class="{ absente: !localisation.situee }"
        >
          {{ localisation.texte }}
        </p>

        <label class="large">
          <span>Rayon de déplacement : {{ form.rayonKm }} km</span>
          <input id="rayon" v-model.number="form.rayonKm" type="range" min="1" max="150" />
          <em class="aide">
            Au-delà de ce rayon, les missions ne vous sont pas proposées du tout.
          </em>
        </label>

        <label class="case">
          <input id="permis" v-model="form.permisB" type="checkbox" />
          <span>Permis B</span>
        </label>

        <label class="case">
          <input id="vehicule" v-model="form.vehicule" type="checkbox" />
          <span>Véhicule personnel</span>
        </label>

        <div class="action large">
          <AppBouton type="submit" :desactive="enCours">Enregistrer</AppBouton>
        </div>
      </form>
    </section>

    <section class="bloc">
      <h2>Mes disponibilités</h2>
      <p class="intro-bloc">
        Un créneau par ligne. Une vacation qui commence après l'heure de fin traverse minuit :
        c'est le travail de nuit.
      </p>

      <ul class="creneaux">
        <li v-for="(creneau, index) in creneaux" :key="index">
          <select :id="`jour-${index}`" v-model.number="creneau.jourSemaine">
            <option v-for="(jour, rang) in JOURS_SEMAINE" :key="jour" :value="rang + 1">
              {{ jour }}
            </option>
          </select>
          <input :id="`debut-${index}`" v-model="creneau.heureDebut" type="time" />
          <input :id="`fin-${index}`" v-model="creneau.heureFin" type="time" />
          <button type="button" class="retirer" @click="retirerCreneau(index)">Retirer</button>
        </li>
      </ul>

      <p v-if="!creneaux.length" class="vide">
        Aucun créneau déclaré. Sans disponibilité, votre score de correspondance reste au plus bas.
      </p>

      <div class="actions-bloc">
        <AppBouton variante="secondaire" @click="ajouterCreneau()">Ajouter un créneau</AppBouton>
        <AppBouton :desactive="enCours" @click="enregistrerCreneaux()">
          Enregistrer mes créneaux
        </AppBouton>
      </div>
    </section>

    <section class="bloc">
      <h2>Mon parcours</h2>
      <p class="intro-bloc">
        C'est ce qui pèse le plus dans le classement : à diplôme égal, ce sont les mois de terrain
        qui départagent. Un poste déclaré ne compte qu'une fois vérifié par l'agence, sur
        certificat de travail.
      </p>

      <ul class="postes">
        <li v-for="poste in profil.experiences" :key="poste.id">
          <div class="copie">
            <p class="nom-poste">{{ poste.intitule }} · {{ poste.employeur }}</p>
            <p class="meta">
              {{ poste.debutLe }} —
              <template v-if="poste.enCours">aujourd'hui</template>
              <template v-else>{{ poste.finLe }}</template>
              · {{ dureeLisible(poste.dureeMois) }}
              <template v-if="poste.quotitePourcent < 100">
                a {{ poste.quotitePourcent }} %
              </template>
              <template v-if="poste.qualificationLibelle">
                · {{ poste.qualificationLibelle }}
              </template>
              <template v-else> · hors référentiel, compte pour moitié</template>
            </p>
          </div>

          <AppBadge v-if="poste.verifieeLe" teinte="vert">Vérifié</AppBadge>
          <AppBadge v-else>En attente de vérification</AppBadge>

          <button
            v-if="!poste.verifieeLe"
            type="button"
            class="retirer"
            @click="retirerPoste(poste.id)"
          >
            Retirer
          </button>
        </li>
      </ul>

      <p v-if="!profil.experiences.length" class="vide">
        Aucun poste déclaré. Sans expérience vérifiée, la composante la plus lourde du score reste
        à zéro.
      </p>

      <form class="grille" @submit.prevent="declarerPoste()">
        <label>
          <span>Employeur</span>
          <input id="employeur" v-model="nouveauPoste.employeur" type="text" required />
        </label>

        <label>
          <span>Intitulé du poste</span>
          <input id="intitule" v-model="nouveauPoste.intitule" type="text" required />
        </label>

        <label class="large">
          <span>Diplôme correspondant</span>
          <select id="poste-diplome" v-model="nouveauPoste.qualificationId">
            <option value="">Aucun / hors référentiel</option>
            <option v-for="option in referentiel ?? []" :key="option.id" :value="option.id">
              {{ option.libelle }}
            </option>
          </select>
          <em class="aide">
            Un poste sans correspondance compte pour moitié : il dit quelque chose de vous au
            travail, rien de ce métier-ci.
          </em>
        </label>

        <label>
          <span>Du</span>
          <input id="poste-debut" v-model="nouveauPoste.debutLe" type="date" required />
        </label>

        <label>
          <span>Au (vide si en cours)</span>
          <input id="poste-fin" v-model="nouveauPoste.finLe" type="date" />
        </label>

        <label class="large">
          <span>Temps de travail : {{ nouveauPoste.quotitePourcent }} %</span>
          <input
            id="quotite"
            v-model.number="nouveauPoste.quotitePourcent"
            type="range"
            min="10"
            max="100"
            step="5"
          />
          <em class="aide"> Deux ans à mi-temps ne comptent pas comme deux ans à temps plein. </em>
        </label>

        <div class="action large">
          <AppBouton type="submit" :desactive="enCours">Déclarer ce poste</AppBouton>
        </div>
      </form>
    </section>

    <section class="bloc">
      <h2>Mes diplômes</h2>
      <p class="intro-bloc">
        Un diplôme déclaré ne compte qu'une fois vérifié par l'agence. Tant qu'il ne l'est pas, il
        ne vous rend éligible à aucune mission.
      </p>

      <ul class="diplomes">
        <li v-for="diplome in profil.qualificationsDetail" :key="diplome.qualificationId">
          <div class="copie">
            <p class="nom-diplome">{{ diplome.libelle }}</p>
            <p class="meta">
              <template v-if="diplome.obtenueLe">Obtenu le {{ diplome.obtenueLe }}</template>
              <template v-else>Date d'obtention non renseignée</template>
            </p>
          </div>

          <AppBadge v-if="diplome.expiree" teinte="corail">Expiré</AppBadge>
          <AppBadge v-else-if="diplome.verifieeLe" teinte="vert">Vérifié</AppBadge>
          <AppBadge v-else>En attente de vérification</AppBadge>

          <button
            v-if="!diplome.verifieeLe"
            type="button"
            class="retirer"
            @click="retirerDiplome(diplome.qualificationId)"
          >
            Retirer
          </button>
        </li>
      </ul>

      <p v-if="!profil.qualificationsDetail.length" class="vide">Aucun diplôme déclaré.</p>

      <form v-if="diplomesDisponibles.length" class="ajout" @submit.prevent="declarer()">
        <label>
          <span>Diplôme</span>
          <select id="diplome" v-model="diplomeChoisi">
            <option v-for="option in diplomesDisponibles" :key="option.id" :value="option.id">
              {{ option.libelle }}
            </option>
          </select>
        </label>

        <label>
          <span>Obtenu le</span>
          <input id="obtenu-le" v-model="obtenuLe" type="date" />
        </label>

        <AppBouton type="submit" :desactive="enCours">Déclarer</AppBouton>
      </form>
    </section>

    <!-- L'encart ambre du canvas. Son texte parle de documents charges ; ici il
         dit ce qui est vrai de cette page : rien de ce qui est declare ne
         compte avant verification, et aucune donnee de sante n'est demandee. -->
    <p class="avertissement">
      Vos déclarations restent confidentielles et ne comptent qu'une fois vérifiées par l'agence,
      sur pièce. Aucune donnée de santé ne vous est demandée : l'agence enregistre seulement si vous
      êtes déployable, jamais pourquoi.
    </p>
  </section>
</template>

<style scoped>
.profil {
  display: grid;
  gap: 22px;
  max-width: 860px;
}

.tete h1 {
  margin: 0 0 8px;
  font-size: clamp(28px, 5vw, 34px);
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: -0.03em;
}

.intro,
.intro-bloc {
  margin: 0;
  font-size: 14.5px;
  line-height: 1.6;
  color: var(--muted);
}

/* ---------- Carte d'identite ---------- */

.identite {
  padding: 26px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 20px;
}

.haut-identite {
  display: flex;
  gap: 20px;
  align-items: center;
}

.avatar {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 58px;
  height: 58px;
  font-size: 18px;
  font-weight: 700;
  color: var(--dom);
  background: var(--surface-2);
  border-radius: 50%;
}

.etat {
  flex: 1;
  min-width: 0;
}

.nom {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}

.part {
  margin: 0 0 10px;
  font-size: 13.5px;
  color: var(--muted);
}

.jauge {
  height: 8px;
  overflow: hidden;
  background: var(--ground);
  border: 1px solid var(--line);
  border-radius: 6px;
}

.jauge span {
  display: block;
  height: 100%;
  background: var(--dom);
}

.pourcentage {
  flex: none;
  margin: 0;
  font-size: 26px;
  font-weight: 700;
  color: var(--dom);
}

.manques {
  padding: 0;
  margin: 18px 0 0;
  font-size: 14px;
  line-height: 1.7;
  color: var(--muted);
  list-style: none;
}

.manques li::before {
  content: '— ';
}

/* ---------- Blocs ---------- */

.bloc {
  display: grid;
  gap: 16px;
  padding: 26px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 20px;
}

.bloc h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}

.grille {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 18px;
  align-items: end;
}

.grille .large {
  grid-column: 1 / -1;
}

label {
  display: flex;
  flex-direction: column;
  gap: 7px;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--muted);
}

label.case {
  flex-direction: row;
  align-items: center;
  gap: 8px;
  font-size: 14.5px;
  font-weight: 500;
  color: var(--ink);
}

.aide {
  font-size: 13px;
  font-style: normal;
  font-weight: 400;
  line-height: 1.6;
  color: var(--muted);
}

input,
select {
  width: 100%;
  padding: 14px 15px;
  font-family: var(--sans);
  font-size: 15px;
  font-weight: 400;
  color: var(--ink);
  background: var(--ground);
  border: 1px solid var(--line);
  border-radius: 11px;
}

input:focus-visible,
select:focus-visible {
  outline: 2px solid var(--dom);
  outline-offset: 2px;
}

input[type='checkbox'],
input[type='range'] {
  padding: 0;
  background: transparent;
  border: 0;
  accent-color: var(--dom);
}

input[type='checkbox'] {
  width: auto;
}

.localisation {
  margin: 0;
  font-size: 13px;
  font-weight: 500;
  color: var(--dom);
}

.localisation.absente {
  color: var(--eta);
}

/* ---------- Lignes du dossier ---------- */

.creneaux,
.diplomes,
.postes {
  display: grid;
  gap: 12px;
  padding: 0;
  margin: 0;
  list-style: none;
}

.creneaux li {
  display: grid;
  grid-template-columns: 1.4fr 1fr 1fr auto;
  gap: 10px;
  align-items: center;
}

/* Le canvas pose chaque piece du dossier sur sa propre carte, plutot que sur
 * des lignes separees par un filet. */
.postes li,
.diplomes li {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 16px;
  align-items: center;
  padding: 18px 22px;
  background: var(--ground);
  border: 1px solid var(--line);
  border-radius: 16px;
}

.postes .copie,
.diplomes .copie {
  flex: 1;
  min-width: 180px;
}

.nom-poste,
.nom-diplome {
  margin: 0;
  font-size: 15.5px;
  font-weight: 600;
}

.meta {
  margin: 3px 0 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--muted);
}

.retirer {
  padding: 9px 16px;
  font-family: var(--sans);
  font-size: 13px;
  font-weight: 600;
  color: var(--muted);
  background: var(--surface);
  border: 1px solid var(--line-forte);
  border-radius: 20px;
  cursor: pointer;
}

.retirer:hover {
  color: var(--eta);
  border-color: var(--eta);
}

.retirer:focus-visible {
  outline: 2px solid var(--dom);
  outline-offset: 2px;
}

.actions-bloc,
.ajout {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: end;
}

.vide {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--muted);
}

/* ---------- Messages ---------- */

.succes,
.erreur {
  padding: 13px 15px;
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  border-radius: 12px;
}

.succes {
  color: var(--dom-fonce);
  background: var(--surface-2);
  border: 1px solid var(--line-forte);
}

.erreur {
  color: var(--eta);
  background: var(--eta-soft);
  border: 1px solid var(--eta-line);
}

.avertissement {
  padding: 18px;
  margin: 0;
  font-size: 13.5px;
  line-height: 1.6;
  color: var(--ambre-encre);
  background: var(--ambre);
  border: 1px solid var(--ambre-line);
  border-radius: 14px;
}

@media (max-width: 560px) {
  .bloc,
  .identite {
    padding: 20px;
  }

  .creneaux li {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
