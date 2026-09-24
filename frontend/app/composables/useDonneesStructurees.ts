import type { NoeudSchema } from '~/utils/donnees-structurees';

/**
 * Racine publique du site, telle qu'elle sera servie.
 *
 * Toutes les adresses des donnees structurees en descendent. En developpement
 * la valeur par defaut vaut `http://localhost:3000` : les `@id` sont alors
 * faux du point de vue d'un moteur, mais coherents entre eux, ce qui suffit a
 * valider le balisage dans l'outil de test de Google. En production,
 * `NUXT_PUBLIC_SITE_URL` doit porter le domaine reel — sans quoi le site
 * declarerait aux moteurs des pages situees sur la machine du visiteur.
 */
export function useUrlSite(): string {
  return useRuntimeConfig().public.siteUrl;
}

/**
 * Pose un bloc JSON-LD dans le `<head>` de la page.
 *
 * La source peut etre un tableau, une reference ou une fonction : sur les pages
 * qui chargent leurs donnees — les offres, par exemple — les noeuds n'existent
 * qu'apres la reponse de l'API, et `useHead` doit pouvoir les relire. D'ou le
 * gabarit reactif plutot qu'un objet fige.
 *
 * Un tableau vide n'ecrit aucune balise, au lieu d'un `<script>` vide que les
 * validateurs signalent. C'est ce qui permet au gabarit d'appeler la fonction
 * sans condition et de ne rien emettre dans l'espace connecte.
 *
 * Plusieurs appels cohabitent : le gabarit pose l'editeur et le site, la page
 * pose son propre contenu. Deux blocs JSON-LD dans un meme document sont lus
 * comme un seul graphe, les `@id` faisant la jonction.
 */
export function useDonneesStructurees(
  source: MaybeRefOrGetter<NoeudSchema | readonly NoeudSchema[]>,
): void {
  useHead(() => {
    const valeur = toValue(source);
    const noeuds = Array.isArray(valeur) ? valeur : [valeur as NoeudSchema];

    if (!noeuds.length) {
      return {};
    }

    return {
      script: [{ type: 'application/ld+json', innerHTML: serialiser(noeuds) }],
    };
  });
}
