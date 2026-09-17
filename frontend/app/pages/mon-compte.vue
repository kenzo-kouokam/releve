<script setup lang="ts">
import {
  MOT_DE_PASSE_LONGUEUR_MIN,
  ROLE_LIBELLES,
  type PreferencesNotification,
} from '@releve/shared';

useHead({ title: 'Mon compte — Relève' });

const { requete } = useApi();
const { utilisateur, deconnexion } = useSession();

const { contrasteFort, animationsReduites, basculerContraste, basculerAnimations } =
  usePreferencesAffichage();

/**
 * Le seul reglage des trois qui vive cote serveur.
 *
 * Les deux autres sont rendus par le navigateur et suivent l'appareil ; celui-ci
 * commande ce que l'API envoie, donc il appartient au compte. L'interrupteur
 * n'affiche jamais l'etat suppose : il attend la reponse et affiche ce que la
 * base dit, faute de quoi un echec d'ecriture laisserait un bouton allume sur
 * un reglage eteint.
 */
const { data: preferences } = await useAsyncData('mon-compte:notifications', () =>
  requete<PreferencesNotification>('/auth/notifications').catch(() => null),
);

const notificationsEmail = computed(() => preferences.value?.notificationsEmail ?? false);
const bascule = ref(false);
const erreurNotifications = ref('');

async function basculerNotifications(): Promise<void> {
  erreurNotifications.value = '';
  bascule.value = true;

  try {
    preferences.value = await requete<PreferencesNotification>('/auth/notifications', {
      method: 'PUT',
      body: { notificationsEmail: !notificationsEmail.value },
    });
  } catch {
    erreurNotifications.value = 'Réglage non enregistré. Réessayez dans un instant.';
  } finally {
    bascule.value = false;
  }
}

const ancien = ref('');
const nouveau = ref('');
const confirmation = ref('');

const message = ref('');
const succes = ref('');
const enCours = ref(false);

async function changer(): Promise<void> {
  message.value = '';
  succes.value = '';

  if (nouveau.value !== confirmation.value) {
    message.value = 'Les deux saisies du nouveau mot de passe diffèrent.';
    return;
  }

  enCours.value = true;

  try {
    await requete<void>('/auth/mot-de-passe', {
      method: 'POST',
      body: { ancien: ancien.value, nouveau: nouveau.value },
    });

    ancien.value = '';
    nouveau.value = '';
    confirmation.value = '';
    succes.value = 'Mot de passe changé.';
  } catch (cause) {
    const corps = (
      cause as { data?: { message?: string; erreurs?: { champ: string; message: string }[] } }
    ).data;

    message.value = corps?.erreurs?.length
      ? corps.erreurs.map((e) => `${e.champ} : ${e.message}`).join(' · ')
      : (corps?.message ?? 'Erreur inattendue');
  } finally {
    enCours.value = false;
  }
}

async function sortir(): Promise<void> {
  await deconnexion();
  await navigateTo('/connexion');
}
</script>

<template>
  <section class="compte">
    <h1>Mon compte</h1>

    <div v-if="utilisateur" class="identite">
      <span class="pastille">{{ initiales(utilisateur.email) }}</span>
      <div>
        <p class="adresse">{{ utilisateur.email }}</p>
        <p class="role">{{ ROLE_LIBELLES[utilisateur.role] }}</p>
      </div>
    </div>

    <h2>Notifications</h2>

    <div class="reglages">
      <div class="reglage">
        <div class="copie">
          <p class="libelle">Notifications par e-mail</p>
          <p class="aide">
            Validation de votre dossier, et missions publiées qui correspondent à votre profil — un
            message par jour au plus. Les courriels liés à la sécurité de votre compte et à la
            conservation de vos pièces partent toujours.
          </p>
        </div>

        <button
          type="button"
          class="bascule"
          :class="{ actif: notificationsEmail }"
          role="switch"
          :aria-checked="notificationsEmail"
          aria-label="Notifications par e-mail"
          :disabled="bascule"
          @click="basculerNotifications()"
        >
          <span class="bouton" />
        </button>
      </div>
    </div>

    <p v-if="erreurNotifications" class="alerte" role="alert">{{ erreurNotifications }}</p>

    <p class="portee">
      Ce réglage est attaché à votre compte : il vous suit d'un appareil à l'autre.
    </p>

    <h2>Affichage</h2>

    <div class="reglages">
      <div class="reglage">
        <div class="copie">
          <p class="libelle">Contraste renforcé</p>
          <p class="aide">Assombrit le texte secondaire et marque davantage les filets.</p>
        </div>

        <button
          type="button"
          class="bascule"
          :class="{ actif: contrasteFort }"
          role="switch"
          :aria-checked="contrasteFort"
          aria-label="Contraste renforcé"
          @click="basculerContraste()"
        >
          <span class="bouton" />
        </button>
      </div>

      <div class="reglage">
        <div class="copie">
          <p class="libelle">Réduire les animations</p>
          <p class="aide">Limite les mouvements et les transitions dans l'interface.</p>
        </div>

        <button
          type="button"
          class="bascule"
          :class="{ actif: animationsReduites }"
          role="switch"
          :aria-checked="animationsReduites"
          aria-label="Réduire les animations"
          @click="basculerAnimations()"
        >
          <span class="bouton" />
        </button>
      </div>
    </div>

    <p class="portee">
      Ces deux réglages sont enregistrés dans ce navigateur : ils suivent cet appareil, pas votre
      compte.
    </p>

    <h2>Sécurité</h2>

    <form class="carte" @submit.prevent="changer()">
      <p class="titre-carte">Changer mon mot de passe</p>

      <p v-if="message" class="alerte" role="alert">{{ message }}</p>
      <p v-if="succes" class="succes" role="status">{{ succes }}</p>

      <label>
        <span>Mot de passe actuel</span>
        <input
          id="ancien"
          v-model="ancien"
          type="password"
          autocomplete="current-password"
          required
        />
      </label>

      <label>
        <span>Nouveau mot de passe ({{ MOT_DE_PASSE_LONGUEUR_MIN }} caractères minimum)</span>
        <input
          id="nouveau"
          v-model="nouveau"
          type="password"
          autocomplete="new-password"
          :minlength="MOT_DE_PASSE_LONGUEUR_MIN"
          required
        />
      </label>

      <label>
        <span>Confirmer le nouveau mot de passe</span>
        <input
          id="confirmation"
          v-model="confirmation"
          type="password"
          autocomplete="new-password"
          :minlength="MOT_DE_PASSE_LONGUEUR_MIN"
          required
        />
      </label>

      <div>
        <button type="submit" class="principal" :disabled="enCours">
          {{ enCours ? 'Enregistrement...' : 'Changer le mot de passe' }}
        </button>
      </div>

      <p class="note">
        Les sessions déjà ouvertes ailleurs restent valables jusqu'à expiration de leur jeton, soit
        quinze minutes. En cas de compte compromis, demander en plus à un administrateur de
        désactiver le compte.
      </p>
    </form>

    <button type="button" class="sortir" @click="sortir()">Se déconnecter</button>
  </section>
</template>

<style scoped>
.compte {
  max-width: 820px;
}

h1 {
  margin: 0 0 24px;
  font-size: clamp(28px, 5vw, 34px);
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: -0.03em;
}

h2 {
  margin: 30px 0 14px;
  font-size: 12.5px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--muted);
}

.identite {
  display: flex;
  gap: 16px;
  align-items: center;
  padding: 20px 22px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 16px;
}

.pastille {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  font-size: 14px;
  font-weight: 700;
  color: var(--dom);
  background: var(--surface-2);
  border-radius: 12px;
}

.adresse {
  margin: 0;
  font-size: 15.5px;
  font-weight: 600;
  word-break: break-all;
}

.role {
  margin: 2px 0 0;
  font-size: 13px;
  color: var(--muted);
}

/* ---------- Reglages ---------- */

.reglages {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.reglage {
  display: flex;
  gap: 16px;
  align-items: center;
  padding: 20px 22px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 16px;
}

.copie {
  flex: 1;
  min-width: 0;
}

.libelle {
  margin: 0;
  font-size: 15.5px;
  font-weight: 600;
}

.aide {
  margin: 2px 0 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--muted);
}

.bascule {
  display: flex;
  flex: none;
  justify-content: flex-start;
  width: 46px;
  height: 26px;
  padding: 3px;
  background: var(--line-forte);
  border: 0;
  border-radius: 20px;
  cursor: pointer;
}

.bascule.actif {
  justify-content: flex-end;
  background: var(--dom);
}

.bascule:focus-visible {
  outline: 2px solid var(--dom);
  outline-offset: 3px;
}

/* Pendant l'aller-retour avec l'API : l'interrupteur reste sur l'etat
   enregistre, et se ferme a un second clic qui partirait en sens inverse. */
.bascule:disabled {
  opacity: 0.6;
  cursor: progress;
}

.bouton {
  display: block;
  width: 20px;
  height: 20px;
  background: var(--surface);
  border-radius: 50%;
}

.portee {
  margin: 14px 0 0;
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--muted);
}

/* ---------- Mot de passe ---------- */

.carte {
  display: grid;
  gap: 16px;
  padding: 26px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 20px;
}

.titre-carte {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

label {
  display: flex;
  flex-direction: column;
  gap: 7px;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--muted);
}

input {
  width: 100%;
  padding: 14px 15px;
  font-family: var(--sans);
  font-size: 15px;
  font-weight: 400;
  color: var(--ink);
  background: var(--ground);
  border: 1px solid var(--line);
  border-radius: 11px;
}

input:focus-visible {
  outline: 2px solid var(--dom);
  outline-offset: 2px;
}

.principal {
  padding: 15px 28px;
  font-family: var(--sans);
  font-size: 15.5px;
  font-weight: 600;
  color: var(--surface);
  background: var(--dom);
  border: 0;
  border-radius: 12px;
  cursor: pointer;
}

.principal:hover:not(:disabled) {
  background: var(--dom-fonce);
}

.principal:disabled {
  opacity: 0.6;
  cursor: progress;
}

.principal:focus-visible,
.sortir:focus-visible {
  outline: 2px solid var(--dom);
  outline-offset: 3px;
}

.alerte,
.succes {
  padding: 13px 15px;
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  border-radius: 12px;
}

.alerte {
  color: var(--eta);
  background: var(--eta-soft);
  border: 1px solid var(--eta-line);
}

.succes {
  color: var(--dom-fonce);
  background: var(--surface-2);
  border: 1px solid var(--line-forte);
}

.note {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--muted);
}

/* Le canvas met la deconnexion en rouge sur fond blanc, cernee : c'est la seule
 * action de cet ecran qui fait perdre quelque chose. */
.sortir {
  padding: 14px 24px;
  margin-top: 30px;
  font-family: var(--sans);
  font-size: 15px;
  font-weight: 600;
  color: var(--eta);
  background: var(--surface);
  border: 1px solid var(--line-forte);
  border-radius: 12px;
  cursor: pointer;
}

.sortir:hover {
  border-color: var(--eta);
}

@media (max-width: 560px) {
  .carte,
  .identite,
  .reglage {
    padding: 20px;
  }
}
</style>
