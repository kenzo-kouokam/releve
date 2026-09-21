/**
 * En-têtes de sécurité, posés sur toutes les réponses du front.
 *
 * Nitro sert ici les pages **et** le relais `/bff`, donc un seul endroit suffit.
 * C'était le manque le plus visible de l'audit : aucune de ces valeurs n'était
 * envoyée, et plusieurs coûtent une ligne pour une vraie différence.
 */

/**
 * La politique de contenu.
 *
 * Ce qu'elle bloque réellement ici : le chargement d'un script depuis un
 * domaine tiers, l'exfiltration d'une donnée vers un domaine tiers
 * (`connect-src`), l'affichage du site dans une iframe, la réécriture de la
 * base des URL relatives, et l'envoi d'un formulaire vers l'extérieur.
 *
 * Ce qu'elle ne bloque pas, et il faut le dire : `'unsafe-inline'` sur les
 * scripts. Nuxt injecte la charge utile d'hydratation en ligne, et une
 * politique stricte demanderait un nonce propagé dans tout le rendu — un
 * chantier à part entière, pour un gain réel mais second par rapport au reste.
 * Cette politique-ci arrête le XSS qui charge son code ailleurs, pas celui qui
 * l'écrit sur place. Le mentionner évite de la croire plus forte qu'elle n'est.
 *
 * `fonts.googleapis.com` et `fonts.gstatic.com` sont là parce que la police du
 * canvas vient de là : la retirer de `nuxt.config` permettrait de resserrer
 * `style-src` et `font-src` sur `'self'`.
 */
const POLITIQUE_CONTENU = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

export default defineEventHandler((event) => {
  const entetes: Record<string, string> = {
    // Un document téléversé ne doit jamais être requalifié en HTML par le
    // navigateur : c'est ce qui transforme une pièce jointe en page exécutée.
    'X-Content-Type-Options': 'nosniff',
    // L'URL de confirmation d'adresse porte un jeton dans sa requête. Sans
    // cette règle, elle partirait dans l'en-tête `Referer` de la première
    // ressource tierce chargée par la page.
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    // `frame-ancestors` le dit déjà aux navigateurs récents ; celui-ci sert
    // les autres.
    'X-Frame-Options': 'DENY',
    // Aucune de ces interfaces n'est utilisée par le site. Les refuser évite
    // qu'un script injecté les demande à la place de l'utilisateur.
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  };

  // En développement, ni politique de contenu ni HSTS.
  //
  // Vite recharge à chaud par WebSocket et évalue du code généré : la politique
  // ci-dessus casserait le rechargement, et on finirait par la désactiver pour
  // de bon. HSTS, lui, forcerait `localhost` en HTTPS dans le navigateur — y
  // compris pour les autres projets servis sur le même hôte, et la consigne
  // survivrait longtemps à ce serveur-ci.
  if (!import.meta.dev) {
    entetes['Content-Security-Policy'] = POLITIQUE_CONTENU;
    entetes['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
  }

  for (const [nom, valeur] of Object.entries(entetes)) {
    setResponseHeader(event, nom, valeur);
  }
});
