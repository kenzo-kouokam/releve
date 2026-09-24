import type { Connexion, ReponseConnexion, UtilisateurSession } from '@releve/shared';

/**
 * Point d'entree de la session. Les deux jetons sont poses en cookies
 * `httpOnly` et ne sont jamais renvoyes au navigateur : le code de la page ne
 * peut pas les lire, donc une faille XSS ne peut pas les voler.
 */
export default defineEventHandler(async (event): Promise<UtilisateurSession | unknown> => {
  const config = useRuntimeConfig();
  const donnees = await readBody<Connexion>(event);

  try {
    const reponse = await $fetch<ReponseConnexion>(`${config.apiBase}/auth/connexion`, {
      method: 'POST',
      body: donnees,
    });

    poserCookies(event, reponse);

    return reponse.utilisateur;
  } catch (cause) {
    return relayerErreur(event, cause);
  }
});
