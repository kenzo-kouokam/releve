<script setup lang="ts">
/**
 * La marque du canvas : carre vert arrondi et glyphe blanc. Le trace est repris
 * tel quel du canvas ; seules les deux couleurs passent par les tokens, pour
 * que le logo suive le theme sombre comme le reste.
 */
const { taille = 30 } = defineProps<{ taille?: number }>();
</script>

<template>
  <svg
    :width="taille"
    :height="taille"
    viewBox="0 0 111 106"
    fill="none"
    aria-hidden="true"
    class="logo"
  >
    <rect width="111" height="106" rx="13" />
    <path
      d="M63.6606 77.2738L60.4641 80.3647C59.8507 81.0691 59.0944 81.635 58.2455 82.0247C57.3966 82.4144 56.4744 82.619 55.5403 82.6249C54.6062 82.6308 53.6816 82.4379 52.8278 82.059C51.974 81.6801 51.2106 81.1238 50.5883 80.4272L32.4564 62.8759C27.5186 57.9383 22.5807 52.3424 22.5807 44.7715C22.5808 41.1085 23.692 37.5317 25.7677 34.5135C27.8434 31.4953 30.7859 29.1776 34.2065 27.8667C37.6271 26.5557 41.3649 26.3131 44.9263 27.171C48.4877 28.0288 51.705 29.9466 54.1535 32.6712C54.3259 32.8556 54.5344 33.0026 54.766 33.1031C54.9976 33.2036 55.2474 33.2555 55.4999 33.2555C55.7524 33.2555 56.0021 33.2036 56.2337 33.1031C56.4653 33.0026 56.6738 32.8556 56.8463 32.6712C59.287 29.9289 62.5052 27.995 66.0723 27.1267C69.6395 26.2585 73.3865 26.4972 76.8147 27.811C80.2428 29.1248 83.1895 31.4515 85.2625 34.4814C87.3355 37.5112 88.4366 41.1005 88.4191 44.7715C88.4181 46.4327 88.1752 48.0849 87.6982 49.6762M65.3756 62.8773H85.1272M75.2514 53.0022V72.7524"
      stroke-width="3"
      stroke-linecap="round"
    />
  </svg>
</template>

<style scoped>
.logo {
  flex: none;
}

rect {
  fill: var(--dom);
}

path {
  stroke: var(--surface);
}
</style>
