/**
 * Telechargement d'une de ses propres pieces.
 *
 * Route dediee plutot que le relais generique : celui-ci interprete la reponse
 * comme du JSON, ce qui ne convient pas a un PDF ou a une image.
 */
export default defineEventHandler(async (event) => {
  const documentId = getRouterParam(event, 'documentId') ?? '';

  return relayerTelechargement(event, `/mon-profil/documents/${documentId}/contenu`);
});
