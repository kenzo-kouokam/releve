<script setup lang="ts">
import type { NomIcone } from '~/types/icone';

/**
 * Bouton pleine largeur du design : 54 px de haut, icone optionnelle a gauche
 * du libelle. Rend un lien quand `to` est fourni, un bouton sinon — les deux
 * partagent exactement la meme apparence.
 */
const {
  variante = 'primaire',
  icone = undefined,
  to = undefined,
  type = 'button',
  desactive = false,
} = defineProps<{
  variante?: 'primaire' | 'secondaire';
  icone?: NomIcone;
  to?: string;
  type?: 'button' | 'submit';
  desactive?: boolean;
}>();
</script>

<template>
  <NuxtLink v-if="to" :to="to" class="bouton" :class="variante">
    <AppIcon v-if="icone" :nom="icone" :taille="18" />
    <span><slot /></span>
  </NuxtLink>

  <button v-else :type="type" class="bouton" :class="variante" :disabled="desactive">
    <AppIcon v-if="icone" :nom="icone" :taille="18" />
    <span><slot /></span>
  </button>
</template>

<style scoped>
.bouton {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 54px;
  font-family: var(--sans);
  font-size: 15px;
  text-align: center;
  text-decoration: none;
  border: 1px solid transparent;
  border-radius: var(--r-carte);
  cursor: pointer;
}

.primaire {
  color: var(--surface);
  background: var(--dom);
  border-color: var(--dom);
}

.secondaire {
  color: var(--dom);
  background: var(--surface);
  border-color: var(--line);
}

.bouton:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.bouton:focus-visible {
  outline: 2px solid var(--dom);
  outline-offset: 2px;
}
</style>
