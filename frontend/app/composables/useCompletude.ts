import type { CompletudeProfil } from '@releve/shared';

/**
 * L'avancement du dossier candidat, partage par la barre laterale et la page
 * « Mon profil ».
 *
 * Une seule definition plutot que deux appels a `useAsyncData` sous la meme
 * cle : Nuxt refuse deux gestionnaires differents pour une meme cle, et lequel
 * l'emporte depend de l'ordre de montage. Ici, les deux endroits lisent la meme
 * fonction, donc un seul appel reseau et une jauge qui bouge partout a la fois
 * apres un depot de piece.
 *
 * Rend `null` pour tout profil qui n'est pas candidat : la route n'existe que
 * pour eux, et un compte d'agence prendrait un 403 a chaque page.
 */
export function useCompletude() {
  const { requete } = useApi();
  const { utilisateur } = useSession();

  return useAsyncData(
    'mon-profil:completude',
    async () => {
      if (utilisateur.value?.role !== 'CANDIDAT') {
        return null;
      }

      return requete<CompletudeProfil>('/mon-profil/completude').catch(() => null);
    },
    { watch: [utilisateur] },
  );
}
