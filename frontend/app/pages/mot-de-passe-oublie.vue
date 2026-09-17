<script setup lang="ts">
useHead({ title: 'Mot de passe oublié — Relève' });

const { demanderReinitialisation } = useSession();

const email = ref('');
const envoi = ref(false);
const demande = ref(false);

/**
 * Le même écran de confirmation dans tous les cas.
 *
 * L'API ne dit jamais si l'adresse correspond à un compte, et la page ne doit
 * pas trahir ce qu'elle tait : afficher « adresse inconnue » ferait de ce
 * formulaire public un annuaire des inscrits — et ici, être inscrit révèle
 * qu'on cherche des missions d'aide à domicile. Même une panne réseau est donc
 * absorbée : mieux vaut une relance inutile qu'une fuite.
 */
async function soumettre(): Promise<void> {
  envoi.value = true;
  await demanderReinitialisation(email.value).catch(() => undefined);
  envoi.value = false;
  demande.value = true;
}
</script>

<template>
  <section class="oubli">
    <h1>Mot de passe oublié</h1>

    <template v-if="demande">
      <p class="intro">
        Si un compte existe pour <strong>{{ email }}</strong
        >, un lien vient d'y être envoyé. Ouvrez-le pour choisir un nouveau mot de passe.
      </p>

      <AppCarte class="rappel">
        <p>
          Le lien est valable <strong>une heure</strong> et ne fonctionne qu'une fois. Pensez à
          regarder dans les indésirables.
        </p>
        <p class="note">
          Tant que vous n'avez pas cliqué, rien ne change : votre mot de passe actuel reste valable.
        </p>
      </AppCarte>

      <p class="aide"><NuxtLink to="/connexion">Retour à la connexion</NuxtLink></p>
    </template>

    <template v-else>
      <p class="intro">
        Indiquez l'adresse de votre compte. Nous vous enverrons un lien pour en choisir un nouveau.
      </p>

      <AppCarte class="formulaire">
        <form @submit.prevent="soumettre">
          <label class="champ" for="email">Adresse e-mail</label>
          <input
            id="email"
            v-model="email"
            type="email"
            autocomplete="username"
            placeholder="vous@exemple.fr"
            required
          />
          <AppBouton type="submit" :desactive="envoi">
            {{ envoi ? 'Envoi...' : 'Recevoir un lien' }}
          </AppBouton>
        </form>
      </AppCarte>

      <p class="aide">
        Vous vous en souvenez ? <NuxtLink to="/connexion">Connectez-vous</NuxtLink>.
      </p>
    </template>
  </section>
</template>

<style scoped>
.oubli {
  max-width: 420px;
  margin: 0 auto;
  padding-block: 48px 0;
}

h1 {
  margin: 0 0 12px;
  font-size: 30px;
  font-weight: 400;
  line-height: 1.12;
}

.intro {
  margin: 0 0 24px;
  font-size: 14px;
  line-height: 1.6;
  color: var(--muted);
}

.formulaire,
.rappel {
  padding: 20px;
}

.rappel p {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
}

.rappel .note {
  margin-top: 10px;
  color: var(--muted);
}

form {
  display: grid;
  gap: 12px;
}

.champ {
  font-size: 13px;
  font-weight: 500;
}

input {
  width: 100%;
  height: 48px;
  padding-inline: 14px;
  font-family: var(--sans);
  font-size: 14px;
  color: var(--ink);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-champ);
}

input:focus-visible {
  outline: 2px solid var(--dom);
  outline-offset: 2px;
}

.aide {
  margin: 16px 0 0;
  font-size: 12px;
  text-align: center;
  color: var(--muted);
}
</style>
