<script setup lang="ts">
import type { EtapeFilAriane } from '~/utils/donnees-structurees';

/**
 * Le chemin de la page, affiche et balise.
 *
 * Deux choses en une, et c'est voulu : Google demande que le fil d'Ariane
 * declare en `BreadcrumbList` corresponde a un chemin reellement visible dans
 * la page. Un composant qui ne poserait que le JSON-LD ferait donc un balisage
 * fragile, qu'une relecture de la page suffirait a invalider sans que personne
 * ne s'en apercoive.
 *
 * La derniere etape est la page courante : elle s'ecrit sans `to`, ne devient
 * pas un lien — on ne renvoie pas vers la ou on est deja — et porte
 * `aria-current="page"`.
 *
 * Usage, dans une page vitrine, juste sous l'ouverture de `<main>` :
 *
 *     <AppFilAriane :etapes="[{ libelle: 'Accueil', to: '/accueil' }, { libelle: 'FAQ' }]" />
 */
const { etapes } = defineProps<{ etapes: readonly EtapeFilAriane[] }>();

const route = useRoute();
const site = useUrlSite();

useDonneesStructurees(() => filAriane(site, route.path, etapes));
</script>

<template>
  <nav class="fil-ariane" aria-label="Fil d'Ariane">
    <ol>
      <li v-for="(etape, rang) in etapes" :key="etape.libelle">
        <NuxtLink v-if="etape.to" :to="etape.to">{{ etape.libelle }}</NuxtLink>
        <span v-else aria-current="page">{{ etape.libelle }}</span>
        <span v-if="rang < etapes.length - 1" class="separateur" aria-hidden="true">›</span>
      </li>
    </ol>
  </nav>
</template>

<style scoped>
.fil-ariane {
  margin-bottom: 18px;
}

ol {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 0;
  margin: 0;
  font-size: 13px;
  color: var(--muted);
  list-style: none;
}

li {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

a {
  color: var(--muted);
  text-decoration: none;
}

a:hover {
  color: var(--dom);
  text-decoration: underline;
}

a:focus-visible {
  outline: 2px solid var(--dom);
  outline-offset: 2px;
  border-radius: 2px;
}

[aria-current='page'] {
  color: var(--ink, var(--text));
  font-weight: 600;
}

.separateur {
  color: var(--line-forte, var(--line));
}
</style>
