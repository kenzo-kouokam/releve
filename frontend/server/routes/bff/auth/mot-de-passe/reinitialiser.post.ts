import type { MotDePasseReinitialisation } from '@releve/shared';

/**
 * Pose du nouveau mot de passe. Aucun cookie n'est pose : contrairement a la
 * confirmation d'adresse, cette route n'ouvre pas de session. La personne
 * enchaine sur l'ecran de connexion, ce qui lui fait verifier au passage que le
 * mot de passe choisi est bien celui qu'elle croit.
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const donnees = await readBody<MotDePasseReinitialisation>(event);

  try {
    await $fetch(`${config.apiBase}/auth/mot-de-passe/reinitialiser`, {
      method: 'POST',
      body: donnees,
    });

    setResponseStatus(event, 204);

    return null;
  } catch (cause) {
    return relayerErreur(event, cause);
  }
});
