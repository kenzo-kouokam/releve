<script setup lang="ts">
import { MENTIONS_DEMONSTRATION } from '~/data/legal';

/**
 * Avertit que les mentions affichees sont un jeu de demonstration.
 *
 * En tete des trois pages legales, et pas en pied : quelqu'un qui cherche le
 * SIRET de l'editeur le lit avant de descendre, et un avertissement place
 * apres l'information qu'il corrige arrive trop tard.
 *
 * Il ne s'agit pas de decorer la page d'une reserve : les valeurs sont
 * inventees, et les afficher sans le dire reviendrait a publier de fausses
 * mentions legales. C'est exactement la chose que ces pages existent pour
 * empecher.
 */
const affiche = MENTIONS_DEMONSTRATION;
</script>

<template>
  <aside v-if="affiche" class="bandeau" role="note">
    <p class="titre">Jeu de démonstration</p>
    <p>
      Les informations d'identification ci-dessous — raison sociale, SIRET, garantie financière,
      hébergeur — sont <strong>fictives</strong>. Aucune ne désigne une entreprise réelle&nbsp;: le
      SIRET et le numéro de TVA ne sont que des zéros, et les organismes cités n'existent pas.
    </p>
    <p>
      Ces pages servent à montrer la structure attendue. Elles n'ont pas été relues par un
      professionnel du droit, et ne sont pas indexées.
    </p>
  </aside>
</template>

<style scoped>
.bandeau {
  display: grid;
  gap: 10px;
  padding: 20px 22px;
  margin-bottom: 32px;
  border: 1px solid var(--ambre-line);
  border-left: 4px solid var(--ambre-encre);
  border-radius: 14px;
  background: var(--ambre);
}

.bandeau p {
  max-width: 68ch;
  margin: 0;
  font-size: 14.5px;
  line-height: 1.6;
  color: var(--ambre-encre);
}

.titre {
  font-size: 12px !important;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.bandeau strong {
  font-weight: 700;
}

@media (max-width: 560px) {
  .bandeau {
    padding: 16px 18px;
  }
}
</style>
