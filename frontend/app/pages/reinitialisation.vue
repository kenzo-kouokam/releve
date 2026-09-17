<script setup lang="ts">
import { motDePasseReinitialisationSchema } from '@releve/shared';

useHead({ title: 'Nouveau mot de passe — Relève' });

const route = useRoute();
const { reinitialiserMotDePasse } = useSession();

const jeton = computed(() => String(route.query.jeton ?? ''));

const nouveau = ref('');
const confirmation = ref('');
const erreur = ref('');
const envoi = ref(false);
const fait = ref(false);

async function soumettre(): Promise<void> {
  erreur.value = '';

  if (nouveau.value !== confirmation.value) {
    erreur.value = 'Les deux mots de passe different.';
    return;
  }

  // Le même schéma que l'API : le message affiché ici est exactement celui
  // qu'elle renverrait, sans l'attendre.
  const verifie = motDePasseReinitialisationSchema.safeParse({
    jeton: jeton.value,
    nouveau: nouveau.value,
  });

  if (!verifie.success) {
    erreur.value = verifie.error.issues[0]?.message ?? 'Saisie invalide.';
    return;
  }

  envoi.value = true;

  try {
    await reinitialiserMotDePasse(jeton.value, nouveau.value);
    fait.value = true;
  } catch (cause) {
    const reponse = cause as { data?: { message?: string } };

    erreur.value =
      reponse.data?.message ??
      'Ce lien de reinitialisation est invalide ou expire. Demandez-en un nouveau.';
  } finally {
    envoi.value = false;
  }
}
</script>

<template>
  <section class="reinit">
    <template v-if="fait">
      <h1>Mot de passe enregistré</h1>
      <p class="intro">
        Vous pouvez vous connecter avec votre nouveau mot de passe. Toutes vos sessions ouvertes ont
        été fermées : il faut vous reconnecter sur chacun de vos appareils.
      </p>
      <AppBouton to="/connexion">Se connecter</AppBouton>
    </template>

    <template v-else-if="!jeton">
      <h1>Lien incomplet</h1>
      <p class="intro">
        Copiez le lien en entier depuis votre courriel, ou demandez-en un nouveau.
      </p>
      <AppBouton variante="secondaire" to="/mot-de-passe-oublie">Demander un lien</AppBouton>
    </template>

    <template v-else>
      <h1>Choisir un nouveau mot de passe</h1>
      <p class="intro">
        Il remplacera l'ancien immédiatement, et fermera toutes vos sessions en cours.
      </p>

      <AppCarte class="formulaire">
        <form @submit.prevent="soumettre">
          <label class="champ" for="nouveau">Nouveau mot de passe</label>
          <input
            id="nouveau"
            v-model="nouveau"
            type="password"
            autocomplete="new-password"
            required
          />

          <label class="champ" for="confirmation">Confirmer le mot de passe</label>
          <input
            id="confirmation"
            v-model="confirmation"
            type="password"
            autocomplete="new-password"
            required
          />

          <p v-if="erreur" class="erreur">{{ erreur }}</p>

          <AppBouton type="submit" :desactive="envoi">
            {{ envoi ? 'Enregistrement...' : 'Enregistrer' }}
          </AppBouton>
        </form>
      </AppCarte>

      <p class="aide">
        Lien expiré ? <NuxtLink to="/mot-de-passe-oublie">Demandez-en un nouveau</NuxtLink>.
      </p>
    </template>
  </section>
</template>

<style scoped>
.reinit {
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

.formulaire {
  padding: 20px;
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

.erreur {
  margin: 0;
  padding: 10px 12px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--eta);
  background: var(--eta-soft);
  border-radius: var(--r-champ);
}

.aide {
  margin: 16px 0 0;
  font-size: 12px;
  text-align: center;
  color: var(--muted);
}
</style>
