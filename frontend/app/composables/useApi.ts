interface OptionsRequete {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
}

/**
 * Appel API, via le relais Nitro.
 *
 * `useRequestFetch` reporte les cookies de la requete entrante sur l'appel
 * interne : sans lui, un rendu serveur partirait sans session et toutes les
 * pages s'afficheraient vides au premier chargement.
 */
export function useApi() {
  const requeteAvecCookies = useRequestFetch();
  const { oublier } = useSession();

  async function requete<T>(chemin: string, options: OptionsRequete = {}): Promise<T> {
    try {
      // Depuis que des routes Nitro explicites existent sous `/bff` — le
      // telechargement des pieces justificatives —, l'inference de `$fetch`
      // tente de deduire le type de reponse du chemin. Elle n'y arrive pas sur
      // un chemin construit, et rend un type qui ne se reconcilie pas avec `T`.
      // La conversion assume ce que l'appelant a deja declare.
      return (await requeteAvecCookies(`/bff${chemin}`, {
        method: options.method ?? 'GET',
        query: options.query,
        body: options.body,
      })) as T;
    } catch (cause) {
      if ((cause as { statusCode?: number }).statusCode === 401) {
        // Session morte : on repasse par le formulaire plutot que d'afficher une
        // liste vide, qui ressemblerait a un referentiel sans donnee.
        oublier();
        await navigateTo('/connexion');
      }

      throw cause;
    }
  }

  /**
   * Depot d'un fichier.
   *
   * Separe de `requete` parce que le corps n'est pas du JSON : `FormData` pose
   * lui-meme son en-tete avec la frontiere multipart, et la fixer a la main la
   * casserait.
   */
  async function televerser<T>(chemin: string, fichier: File): Promise<T> {
    const donnees = new FormData();
    donnees.append('fichier', fichier);

    try {
      return (await requeteAvecCookies(`/bff${chemin}`, {
        method: 'POST',
        body: donnees,
      })) as T;
    } catch (cause) {
      if ((cause as { statusCode?: number }).statusCode === 401) {
        oublier();
        await navigateTo('/connexion');
      }

      throw cause;
    }
  }

  return { requete, televerser };
}
