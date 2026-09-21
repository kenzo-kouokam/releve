<script setup lang="ts">
import type { CompetenceResume } from '@releve/shared';

/**
 * Choix de compétences dans le référentiel agrégé depuis France Travail.
 *
 * La liste est ordonnée par ce que le marché demande le plus, et l'ordre porte
 * autant d'information que le contenu : un établissement qui hésite voit
 * d'abord ce que les autres établissements exigent réellement sur ce métier. C'est
 * pourquoi le compte d'offres s'affiche à côté de chaque ligne au lieu de
 * rester une clé de tri invisible.
 *
 * Deux modes, selon `avecIndispensable` :
 *
 * - côté mission, une compétence cochée peut être marquée indispensable, ce qui
 *   double son poids au classement ;
 * - côté profil, la case est binaire — on sait faire, ou on ne sait pas.
 */
const {
  modelValue,
  // Sans metier, la liste est rendue tous metiers confondus : c'est le mode de
  // la recherche par mots-cles et de la declaration d'un profil, ou l'on ne
  // vise pas un poste precis.
  rome = undefined,
  avecIndispensable = false,
  max = 30,
  libelleVide = 'Aucune competence au referentiel pour ce metier.',
} = defineProps<{
  /** Côté mission : les compétences avec leur caractère indispensable. */
  modelValue: { competenceId: string; indispensable: boolean }[];
  /** Métier visé. Sans lui, la liste est rendue tous métiers confondus. */
  rome?: string;
  avecIndispensable?: boolean;
  max?: number;
  libelleVide?: string;
}>();

const emit = defineEmits<{ 'update:modelValue': [typeof modelValue] }>();

const { requete } = useApi();

const recherche = ref('');

/**
 * Le référentiel est rechargé quand le métier change, pas quand la recherche
 * change : quelques dizaines de lignes tiennent en mémoire, et filtrer côté
 * client évite un aller-retour à chaque frappe.
 */
const { data: referentiel, pending } = await useAsyncData(
  () => `competences-${rome ?? 'tous'}`,
  () =>
    requete<CompetenceResume[]>('/competences', {
      query: { ...(rome ? { rome } : {}), limite: 120 },
    }),
  { watch: [() => rome], default: () => [] as CompetenceResume[] },
);

/** Normalisation d'affichage : la recherche ignore accents et casse. */
function sansAccents(valeur: string): string {
  return valeur
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

const visibles = computed(() => {
  const terme = sansAccents(recherche.value.trim());

  if (!terme) {
    return referentiel.value;
  }

  return referentiel.value.filter((competence) => sansAccents(competence.libelle).includes(terme));
});

const choisies = computed(() => new Map(modelValue.map((ligne) => [ligne.competenceId, ligne])));

const plein = computed(() => modelValue.length >= max);

function basculer(id: string): void {
  if (choisies.value.has(id)) {
    emit(
      'update:modelValue',
      modelValue.filter((ligne) => ligne.competenceId !== id),
    );

    return;
  }

  // Le plafond n'est pas un garde-fou technique : au-delà, une annonce décrit un
  // profil idéal que personne ne coche, et le classement se vide.
  if (plein.value) {
    return;
  }

  emit('update:modelValue', [...modelValue, { competenceId: id, indispensable: false }]);
}

function basculerIndispensable(id: string): void {
  emit(
    'update:modelValue',
    modelValue.map((ligne) =>
      ligne.competenceId === id ? { ...ligne, indispensable: !ligne.indispensable } : ligne,
    ),
  );
}
</script>

<template>
  <div class="selecteur">
    <div class="entete">
      <label class="chercher">
        <span class="sr-only">Filtrer les competences</span>
        <input
          v-model="recherche"
          type="search"
          placeholder="Filtrer : toilette, escarres, transmissions…"
        />
      </label>

      <p class="compte" :class="{ plein }">{{ modelValue.length }} / {{ max }}</p>
    </div>

    <p v-if="pending" class="etat">Chargement du referentiel…</p>

    <p v-else-if="!referentiel.length" class="etat">
      {{ libelleVide }}
      <span class="aide">
        Le referentiel se construit a partir des offres France Travail collectees :
        <code>pnpm cli importer:offres</code> puis <code>pnpm cli competences</code>.
      </span>
    </p>

    <p v-else-if="!visibles.length" class="etat">Aucune competence ne correspond a ce filtre.</p>

    <ul v-else class="liste">
      <li v-for="competence in visibles" :key="competence.id">
        <label class="ligne" :class="{ retenue: choisies.has(competence.id) }">
          <input
            type="checkbox"
            :checked="choisies.has(competence.id)"
            :disabled="plein && !choisies.has(competence.id)"
            @change="basculer(competence.id)"
          />
          <span class="libelle">{{ competence.libelle }}</span>
          <!--
            Le compte d'offres est une information de marche, pas une decoration :
            « demandee dans 47 offres » dit a l'etablissement ce que font les
            autres, ce qui est exactement le service qu'on lui rend ici.
          -->
          <span class="marche">{{ competence.occurrences }} offre(s)</span>
        </label>

        <button
          v-if="avecIndispensable && choisies.has(competence.id)"
          type="button"
          class="indispensable"
          :class="{ actif: choisies.get(competence.id)?.indispensable }"
          :aria-pressed="choisies.get(competence.id)?.indispensable"
          @click="basculerIndispensable(competence.id)"
        >
          Indispensable
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.selecteur {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.entete {
  display: flex;
  gap: 12px;
  align-items: center;
}

.chercher {
  flex: 1;
}

.chercher input {
  width: 100%;
  padding: 8px 12px;
  font: inherit;
  color: var(--text);
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 8px;
}

.compte {
  margin: 0;
  font-size: 12px;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}

.compte.plein {
  color: var(--eta);
  font-weight: 600;
}

.etat {
  margin: 0;
  font-size: 13px;
  color: var(--muted);
}

.aide {
  display: block;
  margin-top: 4px;
  font-size: 12px;
}

.liste {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 320px;
  padding: 0;
  margin: 0;
  overflow-y: auto;
  list-style: none;
  border: 1px solid var(--line);
  border-radius: 10px;
}

.liste li {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 0 10px;
}

.liste li + li {
  border-top: 1px solid var(--line);
}

.ligne {
  display: flex;
  flex: 1;
  gap: 10px;
  align-items: center;
  padding: 9px 0;
  cursor: pointer;
}

.ligne.retenue .libelle {
  font-weight: 600;
}

.libelle {
  flex: 1;
  font-size: 14px;
}

.marche {
  font-size: 11px;
  color: var(--muted);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.indispensable {
  padding: 4px 9px;
  font-size: 11px;
  color: var(--muted);
  cursor: pointer;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 999px;
}

.indispensable.actif {
  color: var(--eta);
  background: var(--eta-soft);
  border-color: var(--eta-soft);
  font-weight: 600;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}

@media (max-width: 640px) {
  .liste li {
    flex-wrap: wrap;
    padding-bottom: 8px;
  }
}
</style>
