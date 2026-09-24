<script setup lang="ts">
useHead({ title: 'Confirmation de votre adresse — Relève' });

const route = useRoute();
const { confirmerEmail, renvoyerVerification } = useSession();

type Etat = 'attente' | 'echec';

const etat = ref<Etat>('attente');
const message = ref('');
const email = ref('');
const renvoi = ref(false);
const renvoye = ref(false);

/**
 * La confirmation part d'elle-meme, sans bouton.
 *
 * Demander un clic de plus apres celui du courriel n'apporte aucune securite :
 * la possession du lien est deja la preuve. Le seul cas ou ce choix gene est
 * celui d'un client de messagerie qui pre-charge les liens — c'est pour cela
 * que la confirmation est un POST et non un GET, qu'aucun prefetch n'emet.
 */
onMounted(async () => {
  const jeton = String(route.query.jeton ?? '');

  if (!jeton) {
    etat.value = 'echec';
    message.value = 'Ce lien est incomplet. Copiez-le en entier depuis votre courriel.';
    return;
  }

  try {
    const destination = await confirmerEmail(jeton);

    // `replace` et non `push` : revenir en arriere rejouerait un jeton
    // desormais consomme, et afficherait un echec a quelqu'un qui vient
    // pourtant de reussir.
    await navigateTo(destination, { replace: true });
  } catch (cause) {
    const erreur = cause as { data?: { message?: string } };

    etat.value = 'echec';
    message.value =
      erreur.data?.message ??
      'Ce lien de verification est invalide ou expire. Demandez-en un nouveau.';
  }
});

async function renvoyer(): Promise<void> {
  if (!email.value) return;

  renvoi.value = true;
  await renvoyerVerification(email.value).catch(() => undefined);
  renvoi.value = false;
  renvoye.value = true;
}
</script>

<template>
  <section class="verification">
    <template v-if="etat === 'attente'">
      <h1>Confirmation en cours</h1>
      <p class="intro">Un instant, nous validons votre adresse.</p>
    </template>

    <template v-else>
      <h1>Lien inutilisable</h1>
      <p class="intro">{{ message }}</p>

      <AppCarte class="relance">
        <p v-if="renvoye" class="confirme" role="status">
          Si un compte existe pour cette adresse et attend confirmation, un nouveau lien vient de
          partir.
        </p>

        <form v-else @submit.prevent="renvoyer">
          <label class="champ" for="email">Votre adresse e-mail</label>
          <input
            id="email"
            v-model="email"
            type="email"
            autocomplete="username"
            placeholder="vous@exemple.fr"
            required
          />
          <AppBouton type="submit" :desactive="renvoi">
            {{ renvoi ? 'Envoi...' : 'Recevoir un nouveau lien' }}
          </AppBouton>
        </form>
      </AppCarte>

      <p class="aide">Deja confirme ? <NuxtLink to="/connexion">Connectez-vous</NuxtLink>.</p>
    </template>
  </section>
</template>

<style scoped>
.verification {
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

.relance {
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

.confirme {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
}

.aide {
  margin: 16px 0 0;
  font-size: 12px;
  text-align: center;
  color: var(--muted);
}
</style>
