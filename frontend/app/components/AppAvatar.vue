<script setup lang="ts">
/**
 * Pastille d'initiales. Le design reserve la teinte lavande aux personnes
 * (compte connecte, contact sur place, candidat) et le vert aux etablissements.
 */
const { initiales, teinte = 'vert' } = defineProps<{
  initiales: string;
  teinte?: 'vert' | 'lavande';
}>();
</script>

<template>
  <span class="avatar" :class="teinte">{{ initiales }}</span>
</template>

<style scoped>
.avatar {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  font-size: 13px;
  font-weight: 700;
  color: var(--dom-fonce);
  border-radius: 999px;
}

.vert {
  background: var(--dom-soft);
}

.lavande {
  background: var(--lavande);
}
</style>
