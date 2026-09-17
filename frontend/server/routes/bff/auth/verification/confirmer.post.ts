import {
  DESTINATION_APRES_VERIFICATION,
  type ReponseConnexion,
  type VerificationConfirme,
} from '@releve/shared';

/**
 * Confirmation d'adresse : le seul endroit ou une inscription devient une
 * session. Le relais pose les memes cookies `httpOnly` que la connexion, et
 * ajoute la destination — la page n'a pas a savoir quel role va ou.
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const donnees = await readBody<VerificationConfirme>(event);

  try {
    const reponse = await $fetch<ReponseConnexion>(
      `${config.apiBase}/auth/verification/confirmer`,
      { method: 'POST', body: donnees },
    );

    poserCookies(event, reponse);

    return {
      utilisateur: reponse.utilisateur,
      destination: DESTINATION_APRES_VERIFICATION[reponse.utilisateur.role],
    };
  } catch (cause) {
    return relayerErreur(event, cause);
  }
});
