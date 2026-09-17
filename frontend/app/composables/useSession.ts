import type { ReponseInscription, UtilisateurSession } from '@releve/shared';

/**
 * Session partagee par toute l'application.
 *
 * Le front ne detient aucun jeton : ils vivent dans des cookies `httpOnly` que
 * seul Nitro sait lire, et c'est le relais /bff qui les presente a l'API. Ce
 * composable ne connait donc que l'identite de la personne connectee.
 */
export function useSession() {
  const utilisateur = useState<UtilisateurSession | null>('releve:utilisateur', () => null);
  const requeteAvecCookies = useRequestFetch();

  const connecte = computed(() => utilisateur.value !== null);

  async function connexion(email: string, motDePasse: string): Promise<void> {
    utilisateur.value = await $fetch<UtilisateurSession>('/bff/auth/connexion', {
      method: 'POST',
      body: { email, motDePasse },
    });
  }

  /**
   * Inscription d'un intervenant — le seul parcours public.
   *
   * Elle n'ouvre aucune session, et ne touche donc pas `utilisateur` : le
   * compte existe, mais l'acces attend que l'adresse soit confirmee. La page
   * recoit l'adresse a afficher sur l'ecran d'attente, rien de plus.
   */
  async function inscrire(donnees: Record<string, unknown>): Promise<ReponseInscription> {
    return $fetch<ReponseInscription>('/bff/auth/inscription/interimaire', {
      method: 'POST',
      body: donnees,
    });
  }

  /**
   * Confirmation de l'adresse par le lien recu : c'est ici, et nulle part
   * ailleurs dans le parcours d'inscription, qu'une session naît. La
   * destination vient du relais, qui la deduit du role.
   */
  async function confirmerEmail(jeton: string): Promise<string> {
    const reponse = await $fetch<{ utilisateur: UtilisateurSession; destination: string }>(
      '/bff/auth/verification/confirmer',
      { method: 'POST', body: { jeton } },
    );

    utilisateur.value = reponse.utilisateur;

    return reponse.destination;
  }

  /** Renvoi du lien. Toujours silencieux : l'API ne dit jamais si l'adresse existe. */
  async function renvoyerVerification(email: string): Promise<void> {
    await $fetch('/bff/auth/verification/renvoyer', { method: 'POST', body: { email } });
  }

  /**
   * Demande d'un lien de reinitialisation. Silencieuse elle aussi : l'API ne
   * dit jamais si l'adresse correspond a un compte.
   */
  async function demanderReinitialisation(email: string): Promise<void> {
    await $fetch('/bff/auth/mot-de-passe/oublie', { method: 'POST', body: { email } });
  }

  /**
   * Pose du nouveau mot de passe depuis le lien recu. N'ouvre pas de session :
   * la personne enchaine sur l'ecran de connexion.
   */
  async function reinitialiserMotDePasse(jeton: string, nouveau: string): Promise<void> {
    await $fetch('/bff/auth/mot-de-passe/reinitialiser', {
      method: 'POST',
      body: { jeton, nouveau },
    });
  }

  /** Relit la session depuis l'API ; laisse `utilisateur` a null si elle est morte. */
  async function rafraichir(): Promise<void> {
    try {
      utilisateur.value = await requeteAvecCookies<UtilisateurSession>('/bff/auth/moi');
    } catch {
      utilisateur.value = null;
    }
  }

  async function deconnexion(): Promise<void> {
    await $fetch('/bff/auth/deconnexion', { method: 'POST' }).catch(() => undefined);
    utilisateur.value = null;
  }

  /** Oubli local, sans appel reseau : la session est deja morte cote serveur. */
  function oublier(): void {
    utilisateur.value = null;
  }

  return {
    utilisateur,
    connecte,
    connexion,
    inscrire,
    confirmerEmail,
    renvoyerVerification,
    demanderReinitialisation,
    reinitialiserMotDePasse,
    rafraichir,
    deconnexion,
    oublier,
  };
}
