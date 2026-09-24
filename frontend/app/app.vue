<template>
  <!--
    Un seul layout, `default`, qui choisit lui-meme entre deux coques selon la
    session : publique — en-tete collant, navigation vitrine, pied de page — ou
    applicative, a barre laterale. Le layout `onboarding` et son cadre mobile
    ont disparu avec les ecrans qu'ils encadraient.
  -->
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
