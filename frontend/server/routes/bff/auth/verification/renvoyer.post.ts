import type { VerificationRenvoi } from '@releve/shared';

/**
 * Renvoi du lien. L'API repond 204 quoi qu'il arrive — adresse inconnue, deja
 * confirmee, ou lien reellement reexpedie — et le relais ne cherche pas a en
 * savoir plus : la page affiche le meme message dans tous les cas.
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const donnees = await readBody<VerificationRenvoi>(event);

  try {
    await $fetch(`${config.apiBase}/auth/verification/renvoyer`, {
      method: 'POST',
      body: donnees,
    });

    setResponseStatus(event, 204);

    return null;
  } catch (cause) {
    return relayerErreur(event, cause);
  }
});
