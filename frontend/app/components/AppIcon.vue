<script setup lang="ts">
import type { NomIcone } from '~/types/icone';

/**
 * Les traces vectorielles viennent telles quelles de l'export Figma ; seule la
 * couleur figee a ete remplacee par `currentColor`, pour qu'un meme fichier
 * serve l'icone verte d'une tuile et la puce grise d'un choix non selectionne.
 * On les inline plutot que de passer par <img> : une balise image ne se
 * recolorerait pas.
 */
const TRACES = import.meta.glob('../assets/icons/*.svg', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const { nom, taille = 24 } = defineProps<{ nom: NomIcone; taille?: number }>();

const trace = computed(() => TRACES[`../assets/icons/${nom}.svg`] ?? '');
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html -->
  <span class="icone" :style="{ '--taille': `${taille}px` }" aria-hidden="true" v-html="trace" />
</template>

<style scoped>
.icone {
  display: inline-flex;
  flex: none;
  width: var(--taille);
  height: var(--taille);
}

/* Le SVG injecte par v-html ne recoit pas l'attribut de scope : sans :deep,
 * la regle ne l'atteindrait pas et l'icone garderait sa taille d'export. */
.icone :deep(svg) {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
