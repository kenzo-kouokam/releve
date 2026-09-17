<script setup lang="ts">
import { QUESTIONS } from '~/data/vitrine';

useHead({
  title: 'Questions fréquentes — Relève',
  meta: [
    {
      name: 'description',
      content:
        'Dossier candidat, vérification des diplômes, rayon de déplacement, suivi des candidatures : les questions les plus fréquentes.',
    },
  ],
});

/**
 * Le canvas n'ouvre qu'une question a la fois. Le repli natif de <details> fait
 * exactement ce qu'il faut — clavier, lecteurs d'ecran, recherche dans la page
 * — et il suffit de le refermer les uns les autres pour retrouver le comportement
 * du canvas, sans etat a tenir.
 */
const ouverte = ref(-1);
</script>

<template>
  <main class="vitrine faq">
    <p class="vitrine-accroche">FAQ</p>
    <h1 class="vitrine-titre">Questions fréquentes</h1>

    <div class="questions">
      <details
        v-for="(item, rang) in QUESTIONS"
        :key="item.question"
        class="question"
        :open="ouverte === rang"
        @toggle="ouverte = ($event.target as HTMLDetailsElement).open ? rang : -1"
      >
        <summary>
          <span>{{ item.question }}</span>
          <span class="signe" aria-hidden="true">{{ ouverte === rang ? '−' : '+' }}</span>
        </summary>
        <p>{{ item.reponse }}</p>
      </details>
    </div>

    <section class="aide">
      <div>
        <p class="titre-aide">Besoin d'aide ?</p>
        <p class="corps-aide">
          Écrivez-nous : une question sur une mission, un document ou un contrat trouve sa réponse
          plus vite par courriel que dans une page générale.
        </p>
      </div>

      <NuxtLink to="/contact" class="bouton-clair">Contacter l'agence</NuxtLink>
    </section>
  </main>
</template>

<style scoped>
.faq {
  max-width: 860px;
}

.vitrine-titre {
  margin-bottom: 40px;
}

.questions {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.question {
  overflow: hidden;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 16px;
}

summary {
  display: flex;
  gap: 20px;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  font-size: 16px;
  font-weight: 600;
  list-style: none;
  cursor: pointer;
}

/* Le triangle par defaut de <summary>, que le canvas remplace par un signe. */
summary::-webkit-details-marker {
  display: none;
}

summary:focus-visible {
  outline: 2px solid var(--dom);
  outline-offset: -2px;
}

.signe {
  flex: none;
  font-size: 18px;
  color: var(--dom);
}

.question p {
  padding: 0 24px 22px;
  margin: 0;
  font-size: 15px;
  line-height: 1.65;
  color: var(--muted);
}

.aide {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
  align-items: center;
  justify-content: space-between;
  padding: 28px;
  margin-top: 32px;
  background: var(--dom-fonce);
  border-radius: 20px;
}

.titre-aide {
  margin: 0 0 6px;
  font-size: 18px;
  font-weight: 600;
  color: var(--surface);
}

.corps-aide {
  max-width: 52ch;
  margin: 0;
  font-size: 14.5px;
  line-height: 1.6;
  color: var(--dom-contraste);
}

.bouton-clair {
  flex: none;
  padding: 14px 24px;
  font-size: 15px;
  font-weight: 600;
  color: var(--dom-fonce);
  text-decoration: none;
  background: var(--surface);
  border-radius: 12px;
}

.bouton-clair:hover {
  color: var(--dom-fonce);
  background: var(--surface-2);
}

.bouton-clair:focus-visible {
  outline: 2px solid var(--surface);
  outline-offset: 3px;
}

@media (max-width: 560px) {
  summary {
    padding: 18px;
  }

  .question p {
    padding: 0 18px 18px;
  }

  .aide {
    padding: 22px;
  }
}
</style>
