/**
 * Telechargement d'une piece par l'agence, pour la verifier. Le cloisonnement
 * par agence est tranche cote API, comme sur toutes les routes du vivier.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? '';
  const documentId = getRouterParam(event, 'documentId') ?? '';

  return relayerTelechargement(event, `/candidats/${id}/documents/${documentId}/contenu`);
});
