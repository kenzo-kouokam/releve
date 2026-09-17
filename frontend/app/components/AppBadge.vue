<script setup lang="ts">
/**
 * La pastille du design, declinee en trois teintes :
 * - `vert`   : information positive ou categorie (EHPAD, Confirmee, 2 candidats)
 * - `corail` : urgence (Urgent, Besoin urgent, Dans les 2 h)
 * - `neutre` : donnee factuelle non hierarchisee (horaires, filtres inactifs)
 */
type Teinte = 'vert' | 'corail' | 'neutre';

const { teinte = 'neutre' } = defineProps<{ teinte?: Teinte }>();
</script>

<template>
  <span class="badge" :class="teinte"><slot /></span>
</template>

<style scoped>
.badge {
  display: inline-flex;
  align-items: center;
  padding: 6px 10px;
  font-size: 11px;
  line-height: 1.2;
  white-space: nowrap;
  border: 1px solid transparent;
  border-radius: 999px;
}

.vert {
  color: var(--dom-fonce);
  background: var(--dom-soft);
  border-color: var(--dom-soft);
}

.corail {
  color: var(--eta);
  background: var(--eta-soft);
  border-color: var(--eta-soft);
}

.neutre {
  color: var(--muted);
  background: var(--surface);
  border-color: var(--line);
}
</style>
