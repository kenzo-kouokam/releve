import type { ReponseInscription } from '@releve/shared';

/**
 * Inscription d'un établissement — le second parcours public.
 *
 * Comme pour l'intervenant, ce relais ne pose aucun cookie : une inscription
 * n'ouvre pas de session, c'est le lien reçu par courriel qui le fait. Et
 * contrairement à lui, la session ouverte ensuite ne donnera pas accès au dépôt
 * de besoin tant que l'agence n'aura pas lu l'arrêté d'autorisation déclaré.
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const donnees = await readBody<Record<string, unknown>>(event);

  try {
    const reponse = await $fetch<ReponseInscription>(
      `${config.apiBase}/auth/inscription/etablissement`,
      { method: 'POST', body: donnees },
    );

    setResponseStatus(event, 201);

    return reponse;
  } catch (cause) {
    return relayerErreur(event, cause);
  }
});
