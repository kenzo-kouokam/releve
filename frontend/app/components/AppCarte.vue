<script setup lang="ts">
/**
 * La carte du design : fond blanc, angles de 16 px. Deux variantes s'en
 * ecartent — `posee` ajoute l'ombre portee des cartes de la liste de missions,
 * `pleine` retourne la carte en vert sombre (action urgente de l'accueil
 * etablissement, bandeau de correspondance d'un profil).
 */
const { variante = 'simple' } = defineProps<{ variante?: 'simple' | 'posee' | 'pleine' }>();
</script>

<template>
  <div class="carte" :class="variante"><slot /></div>
</template>

<style scoped>
.carte {
  padding: 16px;
  background: var(--surface);
  border-radius: var(--r-carte);
}

.posee {
  box-shadow: var(--ombre-carte);
}

.pleine {
  padding: 20px;
  color: var(--surface);
  background: var(--dom-fonce);
  border-radius: var(--r-carte-large);
}
</style>
