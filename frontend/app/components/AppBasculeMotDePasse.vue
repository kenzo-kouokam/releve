<script setup lang="ts">
/**
 * Le bouton « afficher le mot de passe », et lui seul.
 *
 * Il ne porte pas le champ. Les pages stylent leurs `input` dans un bloc
 * `scoped` : un champ rendu par ce composant perdrait cette mise en forme, et
 * il faudrait la recopier ici — donc la maintenir à deux endroits. L'input
 * reste chez lui, ce composant n'apporte que le bouton et son état.
 *
 * Pourquoi cette fonction existe. Un mot de passe masqué se tape à l'aveugle,
 * et l'erreur la plus banale — une majuscule restée enfoncée, un caractère
 * doublé — se paie d'un refus sans explication. Sur un écran de création de
 * compte, où le même mot de passe doit être saisi deux fois, le coût monte
 * encore. Le masquage protège d'un regard par-dessus l'épaule ; le rendre
 * réversible rend ce choix à la personne, qui est la seule à savoir si
 * quelqu'un se tient derrière elle.
 */

const visible = defineModel<boolean>('visible', { default: false });

const { champ = 'le mot de passe' } = defineProps<{
  /**
   * Ce que désigne le bouton, pour les lecteurs d'écran : « le mot de passe »,
   * « la confirmation ». Sans cela, trois boutons identiques se suivent sur
   * l'écran de changement de mot de passe et rien ne les distingue à l'écoute.
   */
  champ?: string;
}>();

const intitule = computed(() =>
  visible.value ? `Masquer ${champ}` : `Afficher ${champ}`,
);
</script>

<template>
  <button
    type="button"
    class="bascule-visibilite"
    :aria-label="intitule"
    :title="intitule"
    :aria-pressed="visible"
    @click="visible = !visible"
  >
    <AppIcon :nom="visible ? 'eye-off' : 'eye'" :taille="20" />
  </button>
</template>

<style scoped>
.bascule-visibilite {
  /* Positionné par `.champ-mot-de-passe`, déclaré globalement dans main.css :
   * le champ appartient à la page, son habillage aussi. */
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  color: var(--muted);
  background: none;
  border: 0;
  border-radius: 8px;
  cursor: pointer;
}

.bascule-visibilite:hover {
  color: var(--ink);
}

/* Le bouton est à l'intérieur du champ : un contour qui déborde serait rogné
 * par le bord de l'input. On le rentre. */
.bascule-visibilite:focus-visible {
  outline: 2px solid var(--dom);
  outline-offset: -2px;
}

.bascule-visibilite[aria-pressed='true'] {
  color: var(--dom);
}
</style>
