<script setup lang="ts">
import { VALEURS } from '~/data/vitrine';

useHead({
  title: 'À propos — Relève',
  meta: [
    {
      name: 'description',
      content:
        "Relève est une agence d'intérim consacrée à l'aide à domicile : mise en relation des aides à domicile et des structures qui ont besoin d'un renfort rapide.",
    },
  ],
});
</script>

<template>
  <main class="vitrine">
    <p class="vitrine-accroche">À propos</p>
    <h1 class="vitrine-titre">Une agence d'intérim qui ne fait que de l'aide à domicile</h1>

    <p class="vitrine-chapeau">
      Relève met en relation les aides à domicile et les structures qui ont besoin d'un renfort
      rapide. L'agence prend en charge le cadre administratif — déclaration d'embauche, contrat de
      mission, fiches de paie et assurance — pour que le remplacement se décide en heures plutôt
      qu'en jours.
    </p>

    <div class="valeurs">
      <div v-for="valeur in VALEURS" :key="valeur.titre" class="vitrine-carte">
        <p class="titre">{{ valeur.titre }}</p>
        <p class="corps">{{ valeur.corps }}</p>
      </div>
    </div>

    <section class="methode">
      <h2>Déclaré n'est pas vérifié</h2>
      <p>
        C'est le principe qui structure la plateforme. Un candidat déclare ses diplômes et son
        expérience ; l'agence les contrôle sur justificatif avant qu'ils ne comptent. Tant qu'un
        diplôme n'est pas vérifié, il ne rend éligible à aucune mission — ce qui protège autant la
        personne accompagnée que la personne qui intervient.
      </p>
      <p>
        Une structure ne s'inscrit pas seule non plus : elle est enregistrée par l'agence, après
        lecture de sa déclaration de services à la personne, de son agrément ou de son arrêté
        d'autorisation.
      </p>
    </section>
  </main>
</template>

<style scoped>
.valeurs {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
  gap: 20px;
}

.titre {
  margin: 0 0 10px;
  font-size: 17px;
  font-weight: 600;
}

.corps {
  margin: 0;
  font-size: 14.5px;
  line-height: 1.6;
  color: var(--muted);
}

.methode {
  max-width: 64ch;
  margin-top: 56px;
}

.methode h2 {
  margin: 0 0 16px;
  font-size: clamp(24px, 4vw, 30px);
  font-weight: 700;
  letter-spacing: -0.03em;
}

.methode p {
  margin: 0 0 16px;
  font-size: 16px;
  line-height: 1.7;
  color: var(--muted);
}

.methode p:last-child {
  margin-bottom: 0;
}
</style>
