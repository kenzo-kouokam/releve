import type { H3Event } from 'h3';

/**
 * Relais d'un telechargement de piece justificative.
 *
 * Le relais generique (`/bff/**`) rend du JSON : il laisse `$fetch` interpreter
 * la reponse, ce qui conviendrait mal a un PDF. Ce chemin-ci lit les octets tels
 * quels et reporte les deux en-tetes qui comptent — le type et le nom du
 * fichier — pour que le navigateur propose l'enregistrement plutot que d'ouvrir
 * un document televerse dans un onglet.
 */
export async function relayerTelechargement(event: H3Event, chemin: string): Promise<Uint8Array> {
  const config = useRuntimeConfig();
  const acces = getCookie(event, COOKIE_ACCES);

  const reponse = await $fetch.raw<ArrayBuffer>(`${config.apiBase}${chemin}`, {
    responseType: 'arrayBuffer',
    headers: acces ? { Authorization: `Bearer ${acces}` } : {},
  });

  const typeMime = reponse.headers.get('content-type');
  const disposition = reponse.headers.get('content-disposition');

  if (typeMime) {
    setResponseHeader(event, 'content-type', typeMime);
  }

  if (disposition) {
    setResponseHeader(event, 'content-disposition', disposition);
  }

  // Une piece justificative n'a rien a faire dans un cache partage.
  setResponseHeader(event, 'cache-control', 'private, no-store');

  return new Uint8Array(reponse._data ?? new ArrayBuffer(0));
}
