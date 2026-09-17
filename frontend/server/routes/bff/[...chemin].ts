const SANS_CORPS = new Set(['GET', 'HEAD']);

/**
 * Relais vers l'API.
 *
 * Le navigateur ne parle qu'a son propre domaine ; c'est Nitro qui detient le
 * jeton et compose l'en-tete Authorization. Consequence voulue : aucun jeton
 * n'existe cote page, donc rien a voler par XSS, et l'API n'a pas besoin
 * d'ouvrir CORS au navigateur.
 */
// Types explicites : Nitro type ses propres routes, et ce relais est lui-meme
// une route. Sans annotation, l'inference tourne en rond sur `/bff/**`.
export default defineEventHandler(async (event): Promise<unknown> => {
  const config = useRuntimeConfig();
  const chemin = getRouterParam(event, 'chemin') ?? '';
  const acces = getCookie(event, COOKIE_ACCES);
  const methode = event.method;

  // `false` : le corps est lu en binaire, jamais decode en UTF-8. Un depot de
  // fichier passe par ce relais, et une conversion en chaine corromprait le
  // contenu sans rien signaler — le fichier arriverait entier mais illisible.
  const corps = SANS_CORPS.has(methode) ? undefined : await readRawBody(event, false);

  try {
    const reponse: { status: number; _data?: unknown } = await $fetch.raw(
      `${config.apiBase}/${chemin}`,
      {
        method: methode,
        query: getQuery(event),
        body: corps,
        headers: {
          ...(acces ? { Authorization: `Bearer ${acces}` } : {}),
          'content-type': getRequestHeader(event, 'content-type') ?? 'application/json',
        },
      },
    );

    setResponseStatus(event, reponse.status);

    return reponse._data ?? null;
  } catch (cause) {
    return relayerErreur(event, cause);
  }
});
