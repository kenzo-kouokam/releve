/**
 * Prolonge la session avant que la page ou le relais ne travaillent.
 *
 * Le rafraichissement a lieu ici, sur la requete reelle du navigateur, et pas
 * dans le relais : seul ce niveau peut reposer un cookie qui arrivera jusqu au
 * navigateur. Fait plus bas, dans un appel interne du rendu serveur, le nouveau
 * jeton serait perdu et le suivant declencherait la detection de rejeu.
 */
export default defineEventHandler(async (event) => {
  const session = getCookie(event, COOKIE_SESSION);

  if (!session || getCookie(event, COOKIE_ACCES)) {
    return;
  }

  await rafraichirSession(event, session);
});
