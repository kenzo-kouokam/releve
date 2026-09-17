<script setup lang="ts">
import { ADRESSE_CONTACT, DERNIERE_REVISION } from '~/data/legal';

useHead({
  title: "Conditions d'utilisation — Relève",
  meta: [{ name: 'robots', content: 'noindex' }],
});
</script>

<template>
  <main class="vitrine legal">
    <p class="vitrine-accroche">Conditions d'utilisation</p>
    <h1 class="vitrine-titre">Ce que vous pouvez attendre du service</h1>
    <p class="vitrine-chapeau">
      Ces conditions décrivent le fonctionnement réel de la plateforme. Les clauses qui dépendent de
      l'agence — identité de l'éditeur, droit applicable, médiation — reposent sur un jeu de
      démonstration, et le texte doit être relu par un professionnel du droit avant d'engager qui
      que ce soit.
    </p>

    <AppBandeauDemonstration />

    <section>
      <h2>1. Objet</h2>
      <p>
        Relève est une plateforme de mise en relation entre des intervenants de l'aide à domicile et
        des services d'aide et d'accompagnement à domicile (SAAD) qui cherchent un remplacement.
        L'agence intervient comme entreprise de travail temporaire : c'est elle qui emploie
        l'intérimaire et le met à disposition de l'établissement.
      </p>
    </section>

    <section>
      <h2>2. Accès au service</h2>
      <p>
        La création de compte est ouverte aux <strong>candidats</strong> uniquement. Un
        établissement ne s'inscrit pas de lui-même : il est enregistré par l'agence après
        vérification de sa déclaration de services à la personne, de son agrément ou de son arrêté
        d'autorisation. Ces pièces engagent juridiquement et se contrôlent sur document.
      </p>
      <p>
        Un compte est personnel. L'adresse mail sert d'identifiant et doit être confirmée avant la
        première connexion : tant que le lien reçu n'est pas ouvert, l'accès est refusé.
      </p>
    </section>

    <section>
      <h2>3. Vos engagements</h2>
      <ul>
        <li>
          <strong>Déclarer des informations exactes.</strong> Votre adresse, vos disponibilités et
          vos diplômes décident des missions qui vous sont proposées ; une déclaration inexacte
          produit des propositions inadaptées, au détriment des personnes accompagnées.
        </li>
        <li>
          <strong>Ne présenter que des justificatifs authentiques.</strong> L'agence vérifie chaque
          diplôme et chaque expérience sur pièce.
        </li>
        <li><strong>Garder votre mot de passe confidentiel</strong> et signaler tout accès suspect.</li>
        <li>
          <strong>Honorer les missions acceptées</strong>, ou prévenir l'agence dans les meilleurs
          délais : une vacation non couverte est une personne sans aide.
        </li>
      </ul>
    </section>

    <section>
      <h2>4. Vérification, et ce qu'elle conditionne</h2>
      <p>
        Une déclaration n'est pas une vérification. Un diplôme ou un poste déclaré n'entre dans le
        calcul de correspondance qu'une fois contrôlé par l'agence. Tant qu'il ne l'est pas, il ne
        vous rend éligible à aucune mission, et une candidature déposée sans le diplôme exigé est
        refusée — avec l'indication de ce qui manque.
      </p>
    </section>

    <section>
      <h2>5. Ce que le service ne garantit pas</h2>
      <ul>
        <li>
          <strong>Aucune garantie de mission.</strong> L'inscription, même avec un dossier complet,
          ne crée aucun droit à recevoir des propositions.
        </li>
        <li>
          <strong>Une candidature ne vaut pas embauche.</strong> L'établissement retient ou non un
          profil ; le contrat de mission est un acte distinct, établi par l'agence.
        </li>
        <li>
          <strong>La disponibilité du site n'est pas garantie sans interruption</strong> :
          maintenance, incident technique ou indisponibilité d'un service tiers peuvent la
          suspendre.
        </li>
        <li>
          Les rémunérations affichées avant candidature sont <strong>indicatives</strong> ; seul le
          contrat de mission fait foi.
        </li>
      </ul>
    </section>

    <section>
      <h2>6. Suspension et fermeture du compte</h2>
      <p>
        Vous pouvez demander la fermeture de votre compte à tout moment en écrivant à
        <a :href="`mailto:${ADRESSE_CONTACT}`">{{ ADRESSE_CONTACT }}</a
        >. L'agence peut suspendre un compte en cas de déclaration frauduleuse, de justificatif
        falsifié ou de manquement grave. Les données dont la conservation est imposée par la loi —
        celles liées à un contrat de mission exécuté, notamment — sont conservées le temps requis
        même après fermeture.
      </p>
    </section>

    <section>
      <h2>7. Données personnelles</h2>
      <p>
        Les traitements sont décrits dans la
        <NuxtLink to="/politique-confidentialite">politique de confidentialité</NuxtLink>, qui fait
        partie intégrante des présentes conditions.
      </p>
    </section>

    <section>
      <h2>8. Ce qui reste à compléter</h2>
      <p class="reste">
        <strong>Avant toute mise en ligne :</strong> l'identité réelle de l'éditeur, qui remplacera
        le jeu de démonstration des <NuxtLink to="/mentions-legales">mentions légales</NuxtLink> ;
        le droit applicable et la juridiction compétente ; les modalités de modification des
        présentes conditions et d'information des utilisateurs ; le dispositif de médiation de la
        consommation ; et les clauses de propriété intellectuelle. Ce document est un brouillon de
        structure : il n'a pas été relu par un professionnel du droit.
      </p>
    </section>

    <p class="revision">Dernière révision : {{ DERNIERE_REVISION }}</p>
  </main>
</template>
