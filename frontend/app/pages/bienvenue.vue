<script setup lang="ts">
useHead({ title: 'Relève' });

/**
 * Le splash du Figma n'a pas d'action : il se contente d'exister le temps que
 * le middleware ait interroge /auth/moi. On enchaine donc seul vers la
 * connexion, et c'est le middleware qui redirigera vers l'espace adequat si la
 * session est encore valide.
 */
const ATTENTE_MS = 1400;
let minuterie: ReturnType<typeof setTimeout> | undefined;

onMounted(() => {
  minuterie = setTimeout(() => {
    void navigateTo('/connexion');
  }, ATTENTE_MS);
});

onBeforeUnmount(() => clearTimeout(minuterie));
</script>

<template>
  <section class="splash">
    <p class="marque">
      <AppIcon nom="heart-plus" :taille="64" />
      <span class="sr-only">Relève</span>
    </p>
    <p class="attente">Ouverture de votre espace...</p>
  </section>
</template>

<style scoped>
.splash {
  display: flex;
  flex-direction: column;
  gap: 18px;
  align-items: center;
  justify-content: center;
  min-height: 55dvh;
}

.marque {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 96px;
  height: 96px;
  margin: 0;
  color: var(--surface);
  background: var(--dom);
  border-radius: var(--r-carte-large);
}

.attente {
  margin: 0;
  font-size: 13px;
  color: var(--muted);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
</style>
