<script setup lang="ts">
/**
 * Barre superieure des ecrans de detail : retour a gauche, titre, action
 * textuelle a droite. Le retour utilise l'historique plutot qu'une route fixe,
 * parce que ces ecrans s'atteignent depuis plusieurs endroits (liste, accueil,
 * notification).
 */
const { titre, action = undefined } = defineProps<{ titre: string; action?: string }>();

const emit = defineEmits<{ action: [] }>();

function revenir(): void {
  useRouter().back();
}
</script>

<template>
  <header class="barre">
    <button type="button" class="retour" @click="revenir()">
      <AppIcon nom="chevron-left" :taille="20" />
      <span class="titre">{{ titre }}</span>
    </button>

    <button v-if="action" type="button" class="action" @click="emit('action')">
      {{ action }}
    </button>
  </header>
</template>

<style scoped>
.barre {
  display: flex;
  flex: none;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  height: 56px;
  padding-inline: 20px;
}

.retour {
  display: flex;
  gap: 10px;
  align-items: center;
  min-width: 0;
  padding: 0;
  font-family: var(--sans);
  color: var(--ink);
  background: none;
  border: 0;
  cursor: pointer;
}

.titre {
  overflow: hidden;
  font-size: 19px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.action {
  flex: none;
  padding: 0;
  font-family: var(--sans);
  font-size: 13px;
  color: var(--dom);
  background: none;
  border: 0;
  cursor: pointer;
}

.retour:focus-visible,
.action:focus-visible {
  outline: 2px solid var(--dom);
  outline-offset: 3px;
}
</style>
