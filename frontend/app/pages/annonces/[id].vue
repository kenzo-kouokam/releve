<script setup lang="ts">
import {
  INVITATION_CONTACT_ANNONCES,
  MENTION_SOURCE_FRANCE_TRAVAIL,
  type AnnoncePartenaireDetail,
} from '@releve/shared';

/**
 * Une annonce partenaire, en entier.
 *
 * La page restitue le contenu tel que l'employeur l'a écrit — la licence de
 * réutilisation interdit de le dénaturer — et n'offre **aucun chemin de
 * candidature**, ni interne ni vers la source. C'est la décision produit :
 * Relève n'est pas l'employeur de ce poste et ne peut y placer personne. Ce
 * qu'elle propose à la place, c'est d'en parler.
 */

const route = useRoute();
const { requete } = useApi();

const { data: annonce, error } = await useAsyncData(`annonce-${route.params.id}`, () =>
  requete<AnnoncePartenaireDetail>(`/offres/annonces/${route.params.id}`),
);

useHead(() => ({
  title: annonce.value ? `${annonce.value.intitule} — Relève` : 'Annonce — Relève',
}));

const dateLongue = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' });

function jour(iso: string | null): string | null {
  return iso ? dateLongue.format(new Date(iso)) : null;
}

const lieu = computed(() => {
  if (!annonce.value) {
    return '';
  }

  const { communeNom, codePostal, departement } = annonce.value;

  if (communeNom) {
    return codePostal ? `${communeNom} (${codePostal})` : communeNom;
  }

  return departement ? `Département ${departement}` : 'France entière';
});

/**
 * Les horaires arrivent en lignes collées (« 35H/semaine\nTravail en journée »).
 * On les éclate plutôt que de les afficher d'un bloc, où la seconde ligne
 * passerait inaperçue.
 */
const horaires = computed(() =>
  (annonce.value?.horaires ?? []).flatMap((ligne) =>
    ligne
      .split('\n')
      .map((partie) => partie.trim())
      .filter(Boolean),
  ),
);
</script>

<template>
  <section class="detail">
    <p v-if="error" class="alerte">
      Cette annonce n'est plus disponible, ou votre dossier n'est pas encore validé.
      <NuxtLink to="/annonces">Revenir aux annonces</NuxtLink>.
    </p>

    <template v-else-if="annonce">
      <NuxtLink to="/annonces" class="retour">← Toutes les annonces</NuxtLink>

      <div class="entete">
        <span class="etiquette">Annonce partenaire</span>
        <span v-if="annonce.distanceKm !== null" class="distance">
          {{ annonce.distanceApprochee ? '~' : '' }}{{ annonce.distanceKm }} km de chez vous
        </span>
      </div>

      <h1>{{ annonce.intitule }}</h1>
      <p class="employeur">
        {{ annonce.entreprise ?? 'Employeur non précisé' }} &middot; {{ lieu }}
      </p>

      <ul class="attributs">
        <li v-if="annonce.typeContratLibelle">{{ annonce.typeContratLibelle }}</li>
        <li v-if="annonce.experienceLibelle">Expérience : {{ annonce.experienceLibelle }}</li>
        <li v-if="annonce.qualificationLibelle">{{ annonce.qualificationLibelle }}</li>
        <li v-if="annonce.nombrePostes > 1">{{ annonce.nombrePostes }} postes</li>
      </ul>

      <p class="salaire" :class="{ absent: !annonce.salaireLibelle }">
        {{ annonce.salaireLibelle ?? 'Rémunération non précisée par l’employeur' }}
      </p>

      <!--
        Placée haut, à l'endroit où l'œil cherche un bouton « Postuler ».
        Elle porte sur le projet du candidat, jamais sur cette annonce-ci :
        Relève ne peut pas le placer sur un poste qui n'est pas le sien.
      -->
      <aside class="invitation">
        <p>{{ INVITATION_CONTACT_ANNONCES }}</p>
        <NuxtLink to="/contact" class="bouton">Contacter Relève</NuxtLink>
      </aside>

      <section v-if="annonce.description" class="bloc">
        <h2>Description du poste</h2>
        <p class="description">{{ annonce.description }}</p>
      </section>

      <section v-if="horaires.length || annonce.conditionsExercice.length" class="bloc">
        <h2>Conditions de travail</h2>
        <ul class="puces">
          <li v-for="ligne in horaires" :key="`h-${ligne}`">{{ ligne }}</li>
          <li v-for="ligne in annonce.conditionsExercice" :key="`c-${ligne}`">{{ ligne }}</li>
        </ul>
      </section>

      <section v-if="annonce.competences.length" class="bloc">
        <h2>Compétences attendues</h2>
        <ul class="puces">
          <li v-for="competence in annonce.competences" :key="competence.libelle">
            {{ competence.libelle }}
            <span v-if="competence.exigence === 'E'" class="exigee">exigée</span>
          </li>
        </ul>
      </section>

      <section v-if="annonce.entrepriseDescription" class="bloc">
        <h2>L'entreprise</h2>
        <p class="description">{{ annonce.entrepriseDescription }}</p>
      </section>

      <!-- Source et date : obligations de licence, et ce qui rend le mot
           « partenaire » exact. -->
      <footer class="provenance">
        <p>
          Publiée le {{ jour(annonce.publieeLe) }}
          <template v-if="annonce.actualiseeLe">
            &middot; actualisée le {{ jour(annonce.actualiseeLe) }}
          </template>
        </p>
        <p>{{ MENTION_SOURCE_FRANCE_TRAVAIL }}</p>
      </footer>
    </template>
  </section>
</template>

<style scoped>
.detail {
  max-width: 760px;
}

.retour {
  display: inline-block;
  margin-bottom: 20px;
  font-size: 14px;
  color: var(--muted);
  text-decoration: none;
}

.retour:hover {
  text-decoration: underline;
}

.entete {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  margin-bottom: 12px;
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

h1 {
  margin: 0 0 8px;
  font-size: clamp(22px, 4vw, 28px);
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: -0.02em;
}

.employeur {
  margin: 0 0 16px;
  font-size: 15px;
  color: var(--muted);
}

.attributs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0 0 16px;
  padding: 0;
  list-style: none;
}

.attributs li {
  padding: 5px 12px;
  font-size: 13px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 999px;
}

.salaire {
  margin: 0 0 22px;
  font-size: 18px;
  font-weight: 650;
}

.salaire.absent {
  font-size: 15px;
  font-weight: 400;
  color: var(--muted);
}

.invitation {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 34px;
  padding: 20px 22px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 14px;
}

.invitation p {
  max-width: 58ch;
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

.bloc {
  margin-bottom: 32px;
}

.bloc h2 {
  margin: 0 0 12px;
  font-size: 16px;
  font-weight: 650;
}

/* L'annonce arrive en texte brut avec ses retours à la ligne : les préserver
 * est la seule façon de la restituer telle que l'employeur l'a écrite. */
.description {
  margin: 0;
  font-size: 15px;
  line-height: 1.7;
  white-space: pre-line;
}

.puces {
  margin: 0;
  padding-left: 20px;
  font-size: 14.5px;
  line-height: 1.8;
}

.exigee {
  margin-left: 6px;
  padding: 2px 8px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--surface);
  background: var(--eta);
  border-radius: 999px;
}

.provenance {
  padding-top: 22px;
  border-top: 1px solid var(--line);
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--muted);
}

.provenance p {
  margin: 0 0 8px;
}

.alerte {
  padding: 30px;
  text-align: center;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 14px;
}
</style>
