import { appliquerPreferences } from '~/composables/usePreferencesAffichage';

/**
 * Les preferences d'affichage doivent valoir partout, pas seulement sur l'ecran
 * qui les regle. Elles sont donc posees des le demarrage cote navigateur, avant
 * que la premiere page ne s'affiche.
 */
export default defineNuxtPlugin(() => {
  try {
    const brut = localStorage.getItem('releve:affichage');
    if (!brut) return;

    const lu = JSON.parse(brut) as { contrasteFort?: boolean; animationsReduites?: boolean };

    appliquerPreferences({
      contrasteFort: lu.contrasteFort === true,
      animationsReduites: lu.animationsReduites === true,
    });
  } catch {
    // Stockage refuse ou illisible : l'affichage par defaut s'applique.
  }
});
