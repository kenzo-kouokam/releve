import type { ReponseInscription } from '@releve/shared';

/**
 * Inscription d'un intervenant — le seul parcours public. Les ESMS sont crees
 * par l'agence depuis le back-office, leur statut reglementaire se verifiant
 * sur piece.
 *
 * Contrairement a la connexion, ce relais ne pose aucun cookie : une
 * inscription n'ouvre plus de session. C'est le lien recu par courriel qui le
 * fait, via `/bff/auth/verification/confirmer`. La reponse ne porte donc rien
 * d'autre que l'adresse a afficher sur l'ecran d'attente.
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const donnees = await readBody<Record<string, unknown>>(event);

  try {
    const reponse = await $fetch<ReponseInscription>(
      `${config.apiBase}/auth/inscription/interimaire`,
      { method: 'POST', body: donnees },
    );

    setResponseStatus(event, 201);

    return reponse;
  } catch (cause) {
    return relayerErreur(event, cause);
  }
});
