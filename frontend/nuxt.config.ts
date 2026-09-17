export default defineNuxtConfig({
  compatibilityDate: '2026-09-01',
  devtools: { enabled: true },
  devServer: { port: 3000 },
  css: ['~/assets/css/main.css', '~/assets/css/vitrine.css', '~/assets/css/legal.css'],
  routeRules: {
    // L'ecran de choix a disparu : il n'y a qu'un parcours public, celui du
    // candidat. L'ancienne adresse reste valable pour les liens deja partages.
    '/inscription': { redirect: { to: '/inscription/interimaire', statusCode: 301 } },
  },
  runtimeConfig: {
    // Prive, donc jamais serialise vers le navigateur : depuis le passage au
    // relais /bff, seul Nitro appelle l'API. Une valeur publique inviterait a
    // refaire un appel direct, qui court-circuiterait les cookies httpOnly.
    apiBase: process.env.NUXT_API_BASE ?? 'http://localhost:3001/api',
  },
  // `@releve/shared` est compile en CommonJS et lie par le workspace : Vite le
  // traite alors comme du source et rate ses exports nommes, avec une erreur du
  // type « doesn't provide an export named ». D'ou le pre-bundling explicite.
  //
  // `force` regle le second piege, plus vicieux que le premier. Vite calcule
  // l'empreinte de son cache de dependances sur le fichier de verrouillage et
  // la configuration, pas sur le contenu d'un paquet lie : un fichier ajoute a
  // `@releve/shared` n'invalide donc rien. Le serveur continue de servir au
  // navigateur un pre-bundle d'avant, ou le nouveau symbole n'existe pas — la
  // page se rend cote serveur, puis son hydratation echoue sur
  // « X is undefined », et l'ecran reste la, inerte, sans erreur visible.
  // Un redemarrage n'y change rien : le cache est sur disque et lui survit.
  //
  // Le cout est de reconstruire les dependances a chaque demarrage du serveur
  // de developpement, quelques centaines de millisecondes. Sans effet sur le
  // `build` de production, qui repart toujours de zero.
  vite: {
    optimizeDeps: { include: ['@releve/shared'], force: true },
  },
  typescript: {
    strict: true,
  },
  app: {
    head: {
      title: 'Relève',
      htmlAttrs: { lang: 'fr' },
      meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }],
      // Le canvas est dessine en Plus Jakarta Sans : sans ce chargement, le
      // front retombait sur Segoe UI, aucune police n'ayant jamais ete servie.
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap',
        },
      ],
    },
  },
});
