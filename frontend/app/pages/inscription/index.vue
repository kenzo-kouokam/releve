<script setup lang="ts">
/**
 * L'écran de choix, rétabli.
 *
 * Il avait été supprimé quand il n'existait qu'un parcours : une page qui pose
 * une question dont une seule réponse est possible ne fait perdre qu'un clic.
 * Maintenant que l'établissement peut ouvrir son compte lui-même, la question
 * se pose vraiment — et se poser au bon moment, c'est éviter à un cadre de
 * santé de remplir un formulaire de candidature avant de comprendre son
 * erreur.
 *
 * Les deux cartes disent ce que le compte permet, pas ce qu'il est : « déposer
 * vos besoins » et « accéder aux missions » se distinguent sans qu'on ait à
 * savoir ce que Relève appelle un client ou un candidat.
 */
useHead({
  title: 'Créer un compte — Relève',
  meta: [
    {
      name: 'description',
      content:
        "Créez votre compte Relève : dossier candidat pour les soignants, compte établissement pour les EHPAD, hôpitaux et cliniques qui cherchent un remplacement.",
    },
  ],
});
</script>

<template>
  <section class="choix">
    <p class="accroche">Le soin, sans attendre</p>
    <h1>Qui êtes-vous ?</h1>
    <p class="chapeau">
      Deux comptes, deux usages. Vous pourrez toujours nous écrire si vous vous êtes trompé.
    </p>

    <div class="cartes">
      <NuxtLink to="/inscription/interimaire" class="carte">
        <h2>Je cherche des missions</h2>
        <p>
          Aide-soignant, accompagnant éducatif et social : créez votre dossier une fois, puis
          candidatez aux missions proches de chez vous.
        </p>
        <ul>
          <li>Vos diplômes vérifiés par l'agence</li>
          <li>Les missions qui correspondent, par e-mail</li>
          <li>Un vrai contrat de mission d'intérim</li>
        </ul>
        <span class="action">Créer mon dossier candidat →</span>
      </NuxtLink>

      <NuxtLink to="/inscription/etablissement" class="carte">
        <h2>Je cherche un remplaçant</h2>
        <p>
          EHPAD, hôpital, clinique : déposez votre besoin et recevez des profils qualifiés, dont
          les diplômes ont déjà été contrôlés.
        </p>
        <ul>
          <li>Dépôt d'un besoin en quelques minutes</li>
          <li>Le taux du marché affiché à la saisie</li>
          <li>Compte activé après vérification de votre autorisation</li>
        </ul>
        <span class="action">Créer le compte de mon établissement →</span>
      </NuxtLink>
    </div>

    <p class="deja">
      Vous avez déjà un compte ? <NuxtLink to="/connexion">Se connecter</NuxtLink>.
    </p>
  </section>
</template>

<style scoped>
.choix {
  max-width: 880px;
  padding: 48px 20px 80px;
  margin: 0 auto;
}

.accroche {
  margin: 0 0 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--dom);
}

h1 {
  margin: 0 0 10px;
  font-size: clamp(28px, 5vw, 38px);
  line-height: 1.12;
}

.chapeau {
  max-width: 56ch;
  margin: 0 0 34px;
  font-size: 15.5px;
  line-height: 1.6;
  color: var(--muted);
}

.cartes {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 18px;
}

.carte {
  display: flex;
  flex-direction: column;
  padding: 26px 24px;
  color: inherit;
  text-decoration: none;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 16px;
  transition: border-color 0.15s ease;
}

.carte:hover,
.carte:focus-visible {
  border-color: var(--dom);
}

.carte h2 {
  margin: 0 0 10px;
  font-size: 19px;
  line-height: 1.25;
}

.carte p {
  margin: 0 0 16px;
  font-size: 14px;
  line-height: 1.6;
  color: var(--muted);
}

.carte ul {
  flex: 1;
  padding: 0;
  margin: 0 0 20px;
  list-style: none;
}

.carte li {
  position: relative;
  padding-left: 20px;
  margin-bottom: 7px;
  font-size: 13.5px;
  line-height: 1.5;
}

.carte li::before {
  position: absolute;
  left: 0;
  content: '·';
  font-size: 20px;
  line-height: 1;
  color: var(--dom);
}

.action {
  font-size: 14px;
  font-weight: 600;
  color: var(--dom);
}

.deja {
  margin-top: 30px;
  font-size: 13.5px;
  color: var(--muted);
}
</style>
