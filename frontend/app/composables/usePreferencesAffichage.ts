/**
 * Les deux reglages d'affichage de l'ecran « Parametres » du canvas.
 *
 * Le canvas en dessine un troisieme, « Notifications par e-mail ». Il n'est pas
 * repris : le modele Utilisateur ne porte aucune preference de notification, et
 * un interrupteur qui ne commande rien ment a la personne qui le bascule.
 *
 * Ces deux-la, au contraire, sont entierement du ressort du navigateur : ils
 * vivent donc dans le stockage local, sans aller-retour serveur. Consequence
 * assumee : le reglage suit l'appareil, pas le compte.
 */
const CLE = 'releve:affichage';

interface PreferencesAffichage {
  contrasteFort: boolean;
  animationsReduites: boolean;
}

function lireLeStockage(): PreferencesAffichage {
  const defaut: PreferencesAffichage = { contrasteFort: false, animationsReduites: false };

  try {
    const brut = localStorage.getItem(CLE);
    if (!brut) return defaut;

    const lu = JSON.parse(brut) as Partial<PreferencesAffichage>;

    return {
      contrasteFort: lu.contrasteFort === true,
      animationsReduites: lu.animationsReduites === true,
    };
  } catch {
    // Navigation privee, stockage refuse, contenu illisible : on retombe sur
    // l'affichage par defaut plutot que de casser la page.
    return defaut;
  }
}

/** Pose les attributs que la feuille de style observe. */
export function appliquerPreferences(preferences: PreferencesAffichage): void {
  const racine = document.documentElement;

  racine.dataset.contraste = preferences.contrasteFort ? 'fort' : 'normal';
  racine.dataset.animations = preferences.animationsReduites ? 'reduites' : 'completes';
}

export function usePreferencesAffichage() {
  // `useState` plutot qu'un `ref` de module : la valeur est partagee entre les
  // composants sans fuiter d'une requete serveur a l'autre.
  const contrasteFort = useState('affichage:contraste', () => false);
  const animationsReduites = useState('affichage:animations', () => false);

  // Le rendu serveur ne connait pas le stockage local : l'etat initial est donc
  // celui par defaut des deux cotes, et la preference reelle est posee au
  // montage. Lire plus tot provoquerait une divergence d'hydratation.
  onMounted(() => {
    const lues = lireLeStockage();

    contrasteFort.value = lues.contrasteFort;
    animationsReduites.value = lues.animationsReduites;
    appliquerPreferences(lues);
  });

  function enregistrer(): void {
    const valeurs: PreferencesAffichage = {
      contrasteFort: contrasteFort.value,
      animationsReduites: animationsReduites.value,
    };

    appliquerPreferences(valeurs);

    try {
      localStorage.setItem(CLE, JSON.stringify(valeurs));
    } catch {
      // Stockage indisponible : le reglage vaut pour la session en cours, ce
      // qui reste mieux que rien.
    }
  }

  function basculerContraste(): void {
    contrasteFort.value = !contrasteFort.value;
    enregistrer();
  }

  function basculerAnimations(): void {
    animationsReduites.value = !animationsReduites.value;
    enregistrer();
  }

  return { contrasteFort, animationsReduites, basculerContraste, basculerAnimations };
}
