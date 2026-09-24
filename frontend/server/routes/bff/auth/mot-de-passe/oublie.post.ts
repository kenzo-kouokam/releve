import type { MotDePasseOublie } from '@releve/shared';

/**
 * Demande d'un lien de reinitialisation. L'API repond 204 quoi qu'il arrive —
 * adresse connue ou non — et le relais ne cherche pas a en savoir plus : la
 * page affiche le meme message dans tous les cas.
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const donnees = await readBody<MotDePasseOublie>(event);

  try {
    await $fetch(`${config.apiBase}/auth/mot-de-passe/oublie`, {
      method: 'POST',
      body: donnees,
    });

    setResponseStatus(event, 204);

    return null;
  } catch (cause) {
    return relayerErreur(event, cause);
  }
});
