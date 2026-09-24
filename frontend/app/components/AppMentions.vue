<script setup lang="ts">
import type { Mention } from '~/data/legal';

/**
 * Liste de faits juridiques : un intitule, sa valeur, et ce qu'il faut y mettre
 * tant qu'elle manque. Les trois pages legales s'en servent, ce qui garantit
 * qu'un champ non renseigne se voit de la meme facon partout.
 */
const { mentions } = defineProps<{ mentions: readonly Mention[] }>();
</script>

<template>
  <dl>
    <template v-for="mention in mentions" :key="mention.libelle">
      <dt>{{ mention.libelle }}</dt>
      <dd>
        <span v-if="mention.valeur">{{ mention.valeur }}</span>
        <span v-else class="manque">À compléter</span>
        <span v-if="mention.precision" class="precision">{{ mention.precision }}</span>
      </dd>
    </template>
  </dl>
</template>

<style scoped>
dl {
  display: grid;
  gap: 12px;
  margin: 0;
}

dt {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--muted);
}

dd {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 14px 16px;
  margin: 0;
  font-size: 15.5px;
  font-weight: 600;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 13px;
}

.manque {
  font-weight: 700;
  color: var(--ambre-encre);
}

.precision {
  font-size: 13px;
  font-weight: 400;
  line-height: 1.5;
  color: var(--muted);
}
</style>
