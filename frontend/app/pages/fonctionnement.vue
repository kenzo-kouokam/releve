<script setup lang="ts">
import { PARCOURS } from '~/data/vitrine';

useHead({
  title: 'Comment ça marche — Relève',
  meta: [
    {
      name: 'description',
      content:
        "De l'inscription à la mission : les six étapes du parcours candidat chez Relève, agence d'intérim de l'aide à domicile.",
    },
  ],
});
</script>

<template>
  <main class="vitrine">
    <p class="vitrine-accroche">Comment ça marche</p>
    <h1 class="vitrine-titre">De l'inscription à la mission</h1>
    <p class="vitrine-chapeau">
      Le parcours tient en six étapes. Deux d'entre elles ne dépendent pas de vous : l'agence
      vérifie vos diplômes et votre expérience sur pièce, et c'est l'établissement qui retient une
      candidature.
    </p>

    <ol class="parcours">
      <li v-for="etape in PARCOURS" :key="etape.n" class="vitrine-carte etape">
        <span class="numero">{{ etape.n }}</span>
        <div>
          <p class="titre">{{ etape.titre }}</p>
          <p class="corps">{{ etape.corps }}</p>
        </div>
      </li>
    </ol>

    <NuxtLink to="/inscription/interimaire" class="vitrine-bouton depart">Commencer mon inscription</NuxtLink>
  </main>
</template>

<style scoped>
.parcours {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 0;
  margin: 0;
  list-style: none;
}

.etape {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr);
  gap: 22px;
  align-items: start;
  padding: 26px 28px;
}

.numero {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  font-size: 16px;
  font-weight: 700;
  color: var(--dom);
  background: var(--surface-2);
  border-radius: 12px;
}

.titre {
  margin: 0 0 8px;
  font-size: 19px;
  font-weight: 600;
}

.corps {
  margin: 0;
  font-size: 15px;
  line-height: 1.65;
  color: var(--muted);
}

.depart {
  margin-top: 36px;
}

@media (max-width: 560px) {
  .etape {
    gap: 16px;
    padding: 20px;
  }
}
</style>
