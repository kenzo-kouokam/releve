import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Les tests du front, sans monter Nuxt.
 *
 * Ce qui est éprouvé ici ne rend rien à l'écran : la matrice d'accès du
 * middleware et les dérivations d'affichage de la durée d'exercice. Toutes deux
 * sont du calcul, et le calcul se teste sans navigateur — pas de jsdom, pas de
 * serveur, quelques centaines de millisecondes.
 *
 * Le rendu, lui, est vérifié autrement : par la sonde Chrome de
 * `scripts/sonde-responsive.mjs` et les passes pilotées par CDP. Deux outils
 * pour deux questions différentes, et celui-ci répond à la plus dangereuse — un
 * écran mal cadré se voit, une porte ouverte au mauvais profil ne se voit pas.
 */
export default defineConfig({
  resolve: {
    alias: {
      '~': fileURLToPath(new URL('./app', import.meta.url)),
      '@': fileURLToPath(new URL('./app', import.meta.url)),
    },
  },
  test: {
    include: ['test/**/*.spec.ts'],
    environment: 'node',
  },
});
