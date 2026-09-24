/**
 * Revoque la session cote API puis efface les cookies. L'echec de la revocation
 * ne doit pas empecher la deconnexion locale : l'utilisateur a demande a sortir.
 */
export default defineEventHandler(async (event): Promise<null> => {
  const config = useRuntimeConfig();
  const session = getCookie(event, COOKIE_SESSION);

  if (session) {
    await $fetch(`${config.apiBase}/auth/deconnexion`, {
      method: 'POST',
      body: { jetonRafraichissement: session },
    }).catch(() => undefined);
  }

  effacerCookies(event);
  setResponseStatus(event, 204);

  return null;
});
