<script setup lang="ts">
import {
  INVITATION_CONTACT_ANNONCES,
  MENTION_SOURCE_FRANCE_TRAVAIL,
  type AnnoncePartenaire,
  type MotifAnnonces,
  type OptionsAnnonces,
  type PageResultat,
  type TriAnnonces,
} from '@releve/shared';

/**
 * Les annonces partenaire : tout le marché de l'intérim du secteur, collecté
 * sur France Travail.
 *
 * Trois choses que cette page ne fait pas, et c'est délibéré.
 *
 * Elle **ne propose pas de postuler** : ces postes appartiennent à d'autres
 * employeurs, Relève ne peut y placer personne, et un bouton laisserait croire
 * le contraire à quelqu'un qui attendrait ensuite une réponse. L'invitation
 * porte donc sur le projet du candidat, pas sur l'annonce ouverte sous ses yeux.
 *
 * Elle **ne renvoie pas vers la source** non plus : envoyer le candidat postuler
 * ailleurs serait faire le recrutement d'un concurrent depuis notre propre
 * espace.
 *
 * Et elle **ne s'ouvre qu'aux dossiers validés**. Montrer le marché à quelqu'un
 * qui ne peut pas encore être placé serait lui ouvrir une porte fermée : tant
 * que l'agence n'a pas validé, la page dit où en est son dossier.
 */

definePageMeta({ title: 'Annonces partenaire' });

useHead({ title: 'Annonces partenaire — Relève' });

const { requete } = useApi();

const recherche = ref('');
const departement = ref('');
const rome = ref('');
const monRayon = ref(false);
const tri = ref<TriAnnonces>('PROCHES');
const page = ref(1);

const { data: options } = await useAsyncData('annonces-options', () =>
  requete<OptionsAnnonces>('/offres/annonces/options'),
);

type Reponse = PageResultat<AnnoncePartenaire> & { motif: MotifAnnonces | null };

const { data, pending, error, refresh } = await useAsyncData<Reponse>(
  'annonces',
  () =>
    requete<Reponse>('/offres/annonces', {
      query: {
        page: page.value,
        limite: 20,
        tri: tri.value,
        monRayon: monRayon.value,
        ...(recherche.value.trim().length >= 2 ? { recherche: recherche.value.trim() } : {}),
        ...(departement.value ? { departement: departement.value } : {}),
        ...(rome.value ? { rome: rome.value } : {}),
      },
    }),
  { watch: [page, tri, monRayon] },
);

const annonces = computed(() => data.value?.donnees ?? []);
const total = computed(() => data.value?.total ?? 0);
const pages = computed(() => Math.max(1, Math.ceil(total.value / (data.value?.limite || 20))));
const dossierNonValide = computed(() => data.value?.motif === 'DOSSIER_NON_VALIDE');

/** Un changement de filtre repart de la première page : sinon la liste s'ouvre
 * sur une page qui n'existe plus dans le nouveau résultat. */
function filtrer() {
  page.value = 1;
  refresh();
}

function reinitialiser() {
  recherche.value = '';
  departement.value = '';
  rome.value = '';
  monRayon.value = false;
  filtrer();
}

const filtresActifs = computed(() =>
  Boolean(recherche.value || departement.value || rome.value || monRayon.value),
);

function allerA(cible: number) {
  page.value = Math.min(pages.value, Math.max(1, cible));
}

const dateCourte = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' });

function jour(iso: string): string {
  return dateCourte.format(new Date(iso));
}

function lieu(annonce: AnnoncePartenaire): string {
  if (annonce.communeNom) {
    return annonce.departement
      ? `${annonce.communeNom} (${annonce.departement})`
      : annonce.communeNom;
  }

  return annonce.departement ? `Département ${annonce.departement}` : 'France entière';
}
</script>

<template>
  <section class="annonces">
    <header class="titre">
      <h1>Annonces partenaire</h1>
      <p class="chapeau">
        Ce que cherche le secteur, partout en France, diffusé par notre partenaire France Travail.
        <strong>Relève n'est pas l'employeur de ces postes</strong> et n'y reçoit pas de
        candidature.
      </p>
    </header>

    <!-- Dossier non validé : on dit où il en est, plutôt que d'afficher une
         liste vide qui passerait pour une panne. -->
    <div v-if="dossierNonValide" class="ferme">
      <h2>Votre dossier est en cours de validation</h2>
      <p>
        Les annonces partenaire s'ouvrent dès que l'agence a validé votre dossier. C'est la même
        étape qui vous permettra de postuler aux missions Relève.
      </p>
      <NuxtLink to="/mon-profil" class="bouton">Compléter mon profil</NuxtLink>
    </div>

    <template v-else>
      <form class="filtres" @submit.prevent="filtrer()">
        <label>
          <span>Métier ou employeur</span>
          <input v-model="recherche" type="search" placeholder="aide-soignant, EHPAD…" />
        </label>

        <label>
          <span>Département</span>
          <select v-model="departement">
            <option value="">Tous les départements</option>
            <option v-for="d in options?.departements ?? []" :key="d.code" :value="d.code">
              {{ d.code }} ({{ d.annonces }})
            </option>
          </select>
        </label>

        <label>
          <span>Métier</span>
          <select v-model="rome">
            <option value="">Tous les métiers</option>
            <option v-for="m in options?.metiers ?? []" :key="m.romeCode" :value="m.romeCode">
              {{ m.libelle }} ({{ m.annonces }})
            </option>
          </select>
        </label>

        <label>
          <span>Trier par</span>
          <select v-model="tri">
            <option value="PROCHES">Les plus proches</option>
            <option value="RECENTES">Les plus récentes</option>
            <option value="TAUX_DECROISSANT">Rémunération décroissante</option>
          </select>
        </label>

        <label class="case">
          <input v-model="monRayon" type="checkbox" />
          <span>Dans mon rayon</span>
        </label>

        <button type="submit">Filtrer</button>
        <button v-if="filtresActifs" type="button" class="effacer" @click="reinitialiser()">
          Effacer
        </button>
      </form>

      <p v-if="error" class="vide">
        Les annonces sont momentanément indisponibles. Réessayer dans un instant.
      </p>

      <p v-else-if="pending" class="vide">Chargement des annonces…</p>

      <p v-else-if="!annonces.length" class="vide">
        Aucune annonce ne correspond à ces critères.
        <button v-if="filtresActifs" type="button" class="lien" @click="reinitialiser()">
          Voir tout le marché
        </button>
      </p>

      <template v-else>
        <p class="compte">
          <strong>{{ total }}</strong> annonce{{ total > 1 ? 's' : '' }} en ligne
        </p>

        <ul class="liste">
          <li v-for="annonce in annonces" :key="annonce.id" class="annonce">
            <div class="entete">
              <span class="etiquette">Annonce partenaire</span>
              <span v-if="annonce.distanceKm !== null" class="distance">
                {{ annonce.distanceApprochee ? '~' : '' }}{{ annonce.distanceKm }} km
              </span>
            </div>

            <NuxtLink :to="`/annonces/${annonce.id}`" class="lien-titre">
              <h2>{{ annonce.intitule }}</h2>
            </NuxtLink>

            <p class="employeur">
              {{ annonce.entreprise ?? 'Employeur non précisé' }} &middot; {{ lieu(annonce) }}
            </p>

            <ul class="attributs">
              <li v-if="annonce.typeContratLibelle">{{ annonce.typeContratLibelle }}</li>
              <li v-if="annonce.dureeTravailLibelle">
                {{ annonce.dureeTravailLibelle.split('\n')[0] }}
              </li>
              <li v-if="annonce.experienceExigee">Expérience exigée</li>
              <li v-if="annonce.nombrePostes > 1">{{ annonce.nombrePostes }} postes</li>
            </ul>

            <div class="pied">
              <span class="salaire" :class="{ absent: !annonce.salaireLibelle }">
                {{ annonce.salaireLibelle ?? 'Rémunération non précisée' }}
              </span>
              <span class="date">
                {{ jour(annonce.actualiseeLe ?? annonce.publieeLe) }} &middot; France Travail
              </span>
            </div>
          </li>
        </ul>

        <nav v-if="pages > 1" class="pagination" aria-label="Pages d'annonces">
          <button type="button" :disabled="page <= 1" @click="allerA(page - 1)">Précédent</button>
          <span>Page {{ page }} sur {{ pages }}</span>
          <button type="button" :disabled="page >= pages" @click="allerA(page + 1)">Suivant</button>
        </nav>
      </template>

      <!-- Ce qui remplace le bouton « Postuler » : l'invitation porte sur le
           projet du candidat, pas sur l'annonce qu'il vient de lire. -->
      <aside class="invitation">
        <p>{{ INVITATION_CONTACT_ANNONCES }}</p>
        <NuxtLink to="/contact" class="bouton">Contacter Relève</NuxtLink>
      </aside>

      <p class="mention">{{ MENTION_SOURCE_FRANCE_TRAVAIL }}</p>
    </template>
  </section>
</template>

<style scoped>
.titre {
  margin-bottom: 26px;
}

.titre h1 {
  margin: 0 0 8px;
  font-size: clamp(24px, 4vw, 30px);
  font-weight: 700;
  letter-spacing: -0.02em;
}

.chapeau {
  max-width: 72ch;
  margin: 0;
  font-size: 15px;
  line-height: 1.6;
  color: var(--muted);
}

.ferme {
  padding: 32px;
  text-align: center;
  background: var(--surface);
  border: 1px dashed var(--line);
  border-radius: 16px;
}

.ferme h2 {
  margin: 0 0 10px;
  font-size: 18px;
  font-weight: 650;
}

.ferme p {
  max-width: 56ch;
  margin: 0 auto 20px;
  font-size: 14.5px;
  line-height: 1.6;
  color: var(--muted);
}

.filtres {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  align-items: flex-end;
  margin-bottom: 26px;
  padding: 18px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 14px;
}

.filtres label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
}

.filtres label.case {
  flex-direction: row;
  align-items: center;
  gap: 8px;
  padding-bottom: 9px;
}

.filtres input[type='search'],
.filtres select {
  min-width: 170px;
  padding: 9px 12px;
  font: inherit;
  font-weight: 400;
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 9px;
}

.filtres button {
  padding: 10px 18px;
  font: inherit;
  font-weight: 600;
  color: var(--surface);
  background: var(--dom);
  border: 0;
  border-radius: 9px;
  cursor: pointer;
}

.filtres .effacer {
  color: var(--muted);
  background: transparent;
  border: 1px solid var(--line);
}

.compte {
  margin: 0 0 14px;
  font-size: 14px;
  color: var(--muted);
}

.liste {
  display: grid;
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}

/*
 * Bordure discontinue : elle distingue au premier coup d'œil ces cartes de
 * celles des missions Relève, qui sont pleines. Le candidat doit voir qu'il
 * change de registre sans avoir à lire l'étiquette.
 */
.annonce {
  padding: 18px 20px;
  background: var(--surface);
  border: 1px dashed var(--line);
  border-radius: 14px;
}

.entete {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.etiquette {
  padding: 3px 10px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--muted);
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 999px;
}

.distance {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--muted);
}

.lien-titre {
  color: inherit;
  text-decoration: none;
}

.annonce h2 {
  margin: 0 0 6px;
  font-size: 16px;
  font-weight: 650;
  line-height: 1.35;
}

.lien-titre:hover h2,
.lien-titre:focus-visible h2 {
  text-decoration: underline;
}

.employeur {
  margin: 0 0 10px;
  font-size: 13.5px;
  color: var(--muted);
}

.attributs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0 0 12px;
  padding: 0;
  list-style: none;
}

.attributs li {
  padding: 3px 9px;
  font-size: 12px;
  background: var(--bg);
  border-radius: 999px;
}

.pied {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: baseline;
  justify-content: space-between;
}

.salaire {
  font-size: 14px;
  font-weight: 650;
}

.salaire.absent {
  font-weight: 400;
  color: var(--muted);
}

.date {
  font-size: 12px;
  color: var(--muted);
}

.pagination {
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: center;
  margin-top: 24px;
  font-size: 14px;
}

.pagination button {
  padding: 9px 18px;
  font: inherit;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 9px;
  cursor: pointer;
}

.pagination button:disabled {
  opacity: 0.45;
  cursor: default;
}

.invitation {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
  margin-top: 28px;
  padding: 20px 22px;
  background: var(--surface-2, var(--surface));
  border: 1px solid var(--line);
  border-radius: 14px;
}

.invitation p {
  max-width: 62ch;
  margin: 0;
  font-size: 14.5px;
  line-height: 1.6;
}

.bouton {
  display: inline-block;
  padding: 10px 20px;
  font-size: 14px;
  font-weight: 600;
  color: var(--surface);
  text-decoration: none;
  white-space: nowrap;
  background: var(--dom);
  border-radius: 9px;
}

.vide {
  padding: 26px;
  text-align: center;
  color: var(--muted);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 14px;
}

.lien {
  font: inherit;
  color: var(--dom);
  text-decoration: underline;
  background: none;
  border: 0;
  cursor: pointer;
}

.mention {
  margin-top: 22px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--muted);
}
</style>
