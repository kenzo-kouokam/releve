<script setup lang="ts">
useHead({ title: 'Connexion - Relève' });

import { CODE_EMAIL_NON_VERIFIE } from '@releve/shared';

const { connexion, renvoyerVerification } = useSession();

const email = ref('');
const motDePasse = ref('');
const erreur = ref('');
const envoi = ref(false);

/**
 * Vrai quand le mot de passe etait bon mais l'adresse jamais confirmee. Distinct
 * d'`erreur` parce que la conduite a tenir n'est pas la meme : il n'y a rien a
 * corriger dans le formulaire, seulement un lien a rouvrir.
 */
const adresseNonConfirmee = ref(false);
const renvoi = ref(false);
const renvoye = ref(false);

async function soumettre(): Promise<void> {
  erreur.value = '';
  adresseNonConfirmee.value = false;
  renvoye.value = false;
  envoi.value = true;

  try {
    await connexion(email.value, motDePasse.value);
    await navigateTo('/');
  } catch (cause) {
    const reponse = cause as { statusCode?: number; data?: { code?: string; message?: string } };

    if (reponse.data?.code === CODE_EMAIL_NON_VERIFIE) {
      adresseNonConfirmee.value = true;
      erreur.value = reponse.data.message ?? "Votre adresse n'a pas encore ete confirmee.";
    } else if (reponse.statusCode === 401) {
      erreur.value = 'Identifiants invalides.';
    } else {
      erreur.value = "API injoignable. Verifier que l'API tourne (pnpm dev:backend).";
    }
  } finally {
    envoi.value = false;
  }
}

async function renvoyer(): Promise<void> {
  renvoi.value = true;
  await renvoyerVerification(email.value).catch(() => undefined);
  renvoi.value = false;
  renvoye.value = true;
}
</script>

<template>
  <section class="connexion">
    <!-- Le bloc de marque du canvas n'est pas repris : l'entete du site affiche
         deja « Relève » juste au-dessus. -->
    <p class="accroche">Le soin, sans attendre</p>
    <h1>Ravi de vous revoir</h1>
    <p class="intro">Connectez-vous pour suivre vos candidatures et vos missions à venir.</p>

    <AppCarte class="formulaire">
      <form @submit.prevent="soumettre">
        <div class="champ">
          <label for="email">Adresse mail</label>
          <input
            id="email"
            v-model="email"
            type="email"
            autocomplete="username"
            placeholder="johndoe@gmail.com"
            required
          />
        </div>

        <div class="champ">
          <label for="mot-de-passe">Mot de passe</label>
          <input
            id="mot-de-passe"
            v-model="motDePasse"
            type="password"
            autocomplete="current-password"
            placeholder="••••••••••"
            required
          />
        </div>

        <p class="oubli">
          <NuxtLink to="/mot-de-passe-oublie">Mot de passe oublié ?</NuxtLink>
        </p>

        <p v-if="erreur" class="erreur">{{ erreur }}</p>

        <p v-if="renvoye" class="confirme" role="status">
          Un nouveau lien de confirmation vient de partir vers cette adresse.
        </p>

        <AppBouton
          v-else-if="adresseNonConfirmee"
          type="button"
          variante="secondaire"
          :desactive="renvoi"
          @click="renvoyer"
        >
          {{ renvoi ? 'Envoi...' : 'Renvoyer le lien de confirmation' }}
        </AppBouton>

        <AppBouton type="submit" :desactive="envoi">
          {{ envoi ? 'Connexion...' : 'Se connecter' }}
        </AppBouton>

        <AppBouton variante="secondaire" to="/inscription/interimaire">S'inscrire</AppBouton>
      </form>
    </AppCarte>

    <!-- Plus de phrase de consentement ici : on n'accepte rien en se
         connectant, l'engagement se prend a la creation du compte. Les deux
         textes restent accessibles depuis le pied de page. -->
    <p class="aide">
      Démonstration : <code>admin@releve.example</code> / <code>Releve2026!</code> après
      <code>pnpm db:seed</code>.
    </p>
  </section>
</template>

<style scoped>
.connexion {
  padding-inline: 28px;
  max-width: 460px;
  margin: 0 auto;
  padding-block: 72px 100px;
}

.accroche {
  margin: 0 0 14px;
  font-size: 12.5px;
  font-weight: 800;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--eta);
}

h1 {
  margin: 0 0 10px;
  font-size: 36px;
  font-weight: 700;
  line-height: 1.15;
  letter-spacing: -0.03em;
}

.intro {
  margin: 0 0 32px;
  font-size: 15.5px;
  line-height: 1.6;
  color: var(--muted);
}

/* Le canvas dessine la carte de connexion plus large et plus arrondie que la
 * carte generique, et la cerne d'un filet — d'ou les trois surcharges. */
.formulaire {
  padding: 28px;
  border: 1px solid var(--line);
  border-radius: 20px;
}

form {
  display: grid;
  gap: 14px;
}

.champ {
  display: grid;
  gap: 7px;
}

.champ label {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--muted);
}

input {
  width: 100%;
  padding: 14px 15px;
  font-family: var(--sans);
  font-size: 15px;
  color: var(--ink);
  background: var(--ground);
  border: 1px solid var(--line);
  border-radius: 11px;
}

input::placeholder {
  color: var(--muted);
  opacity: 0.55;
}

input:focus-visible {
  outline: 2px solid var(--dom);
  outline-offset: 2px;
}

/* Remonte le lien contre le champ et degage les 24 px que le canvas laisse
 * avant le bouton, sans casser la gouttiere du formulaire. */
.oubli {
  margin: -4px 0 10px;
  font-size: 12.5px;
}

.oubli a {
  color: var(--muted);
  text-decoration: underline;
}

.erreur {
  margin: 0;
  padding: 10px 12px;
  font-size: 13px;
  color: var(--eta);
  background: var(--eta-soft);
  border-radius: var(--r-champ);
}

.confirme {
  margin: 0;
  padding: 10px 12px;
  font-size: 13px;
  line-height: 1.5;
  background: var(--dom-soft);
  border-radius: var(--r-champ);
}

.aide {
  margin: 18px 0 0;
  font-size: 12px;
  line-height: 1.6;
  text-align: center;
  color: var(--muted);
}


code {
  font-family: var(--mono);
  font-size: 0.95em;
}

@media (max-width: 560px) {
.connexion {
    padding-inline: 20px;
  }
}
</style>
