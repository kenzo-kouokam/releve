<script setup lang="ts">
import { inscriptionInterimaireSchema } from '@releve/shared';

useHead({ title: 'Inscription interimaire — Relève' });

const { inscrire } = useSession();

const form = reactive({
  nom: '',
  prenom: '',
  telephone: '',
  adresse: '',
  codePostal: '',
  ville: '',
  rayonKm: 20,
  permisB: false,
  vehicule: false,
  email: '',
  motDePasse: '',
  confirmation: '',
  conditionsAcceptees: false,
});

const erreurs = ref<Record<string, string>>({});
const erreurGenerale = ref('');
const envoi = ref(false);

/**
 * Adresse a laquelle le lien vient de partir. Non vide = l'inscription a
 * abouti, et le formulaire cede la place a l'ecran d'attente : le laisser
 * affiche inviterait a re-soumettre, ce qui ne rendrait qu'un 409.
 */
const enAttente = ref('');

function corps() {
  return {
    interimaire: {
      nom: form.nom,
      prenom: form.prenom,
      telephone: form.telephone,
      adresse: form.adresse,
      codePostal: form.codePostal,
      ville: form.ville,
      rayonKm: Number(form.rayonKm),
      permisB: form.permisB,
      vehicule: form.vehicule,
    },
    compte: { email: form.email, motDePasse: form.motDePasse },
    conditionsAcceptees: form.conditionsAcceptees,
  };
}

async function soumettre(): Promise<void> {
  erreurs.value = {};
  erreurGenerale.value = '';

  if (form.motDePasse !== form.confirmation) {
    erreurs.value.confirmation = 'Les deux mots de passe different';
    return;
  }

  const verifie = inscriptionInterimaireSchema.safeParse(corps());

  if (!verifie.success) {
    for (const souci of verifie.error.issues) {
      erreurs.value[String(souci.path.at(-1))] = souci.message;
    }
    return;
  }

  envoi.value = true;

  try {
    const reponse = await inscrire(corps());

    enAttente.value = reponse.email;
  } catch (cause) {
    const erreur = cause as { statusCode?: number; data?: { message?: string } };
    erreurGenerale.value =
      erreur.statusCode === 409
        ? (erreur.data?.message ?? 'Un compte existe deja pour cette adresse.')
        : 'Inscription impossible pour le moment. Reessayer dans un instant.';
  } finally {
    envoi.value = false;
  }
}
</script>

<template>
  <section class="inscription">
    <p class="accroche">Le soin, sans attendre</p>
    <h1>Créez votre dossier candidat</h1>

    <!--
      Le canvas numerote le parcours « Vos informations » puis « Vos documents ».
      La seconde etape n'est pas reprise telle quelle : l'API n'a ni modele ni
      route de piece jointe, et cinq boutons de chargement sans destination
      vaudraient moins que rien. Le jalon affiche donc l'etape qui existe
      vraiment apres le formulaire — la confirmation de l'adresse.
    -->
    <ol class="etapes">
      <li :class="{ actif: !enAttente }">
        <span class="puce">1</span>
        Vos informations
      </li>
      <li :class="{ actif: !!enAttente }">
        <span class="puce">2</span>
        Confirmation
      </li>
    </ol>

    <AppAttenteVerification v-if="enAttente" :email="enAttente" />

    <form v-else novalidate @submit.prevent="soumettre">
      <fieldset class="carte">
        <legend>Entrez les informations suivantes</legend>
        <p class="sous-titre">
          Ces informations servent à établir vos contrats et vos fiches de paie.
        </p>

        <div class="grille">
          <label class="champ">
            <span>Prénom</span>
            <input
              id="prenom"
              v-model="form.prenom"
              type="text"
              autocomplete="given-name"
              placeholder="John"
            />
            <em v-if="erreurs.prenom">{{ erreurs.prenom }}</em>
          </label>

          <label class="champ">
            <span>Nom</span>
            <input
              id="nom"
              v-model="form.nom"
              type="text"
              autocomplete="family-name"
              placeholder="Doe"
            />
            <em v-if="erreurs.nom">{{ erreurs.nom }}</em>
          </label>

          <label class="champ">
            <span>Numéro de téléphone</span>
            <input
              id="telephone"
              v-model="form.telephone"
              type="tel"
              autocomplete="tel"
              placeholder="06 00 00 00 00"
            />
            <em v-if="erreurs.telephone">{{ erreurs.telephone }}</em>
          </label>
        </div>
      </fieldset>

      <fieldset class="carte">
        <legend>Votre secteur d'intervention</legend>
        <p class="sous-titre">
          Il détermine les missions qui vous sont proposées : seules celles à portée de votre
          adresse vous seront envoyées.
        </p>

        <div class="grille">
          <label class="champ large">
            <span>Adresse</span>
            <input
              id="adresse"
              v-model="form.adresse"
              type="text"
              autocomplete="street-address"
              placeholder="12 rue des Lilas"
            />
            <em v-if="erreurs.adresse">{{ erreurs.adresse }}</em>
          </label>

          <label class="champ">
            <span>Code postal</span>
            <input
              id="code-postal"
              v-model="form.codePostal"
              type="text"
              inputmode="numeric"
              autocomplete="postal-code"
              placeholder="69003"
            />
            <em v-if="erreurs.codePostal">{{ erreurs.codePostal }}</em>
          </label>

          <label class="champ">
            <span>Ville d'intervention</span>
            <input
              id="ville"
              v-model="form.ville"
              type="text"
              autocomplete="address-level2"
              placeholder="Lyon"
            />
            <em v-if="erreurs.ville">{{ erreurs.ville }}</em>
          </label>

          <label class="champ large">
            <span>Rayon de déplacement : {{ form.rayonKm }} km</span>
            <input id="rayon" v-model.number="form.rayonKm" type="range" min="1" max="150" />
            <em v-if="erreurs.rayonKm">{{ erreurs.rayonKm }}</em>
          </label>

          <div class="cases large">
            <label class="case">
              <input id="permis" v-model="form.permisB" type="checkbox" />
              <span>J'ai le permis B</span>
            </label>
            <label class="case">
              <input id="vehicule" v-model="form.vehicule" type="checkbox" />
              <span>J'ai un véhicule</span>
            </label>
          </div>
        </div>
      </fieldset>

      <fieldset class="carte">
        <legend>Votre compte</legend>
        <p class="sous-titre">
          Un lien de confirmation part vers cette adresse dès la création du dossier.
        </p>

        <div class="grille">
          <label class="champ large">
            <span>Adresse mail</span>
            <input
              id="email"
              v-model="form.email"
              type="email"
              autocomplete="email"
              placeholder="johndoe@gmail.com"
            />
            <em v-if="erreurs.email">{{ erreurs.email }}</em>
          </label>

          <label class="champ">
            <span>Mot de passe</span>
            <input
              id="mot-de-passe"
              v-model="form.motDePasse"
              type="password"
              autocomplete="new-password"
              placeholder="••••••••••"
            />
            <em v-if="erreurs.motDePasse">{{ erreurs.motDePasse }}</em>
          </label>

          <label class="champ">
            <span>Confirmer le mot de passe</span>
            <input
              id="confirmation"
              v-model="form.confirmation"
              type="password"
              autocomplete="new-password"
              placeholder="••••••••••"
            />
            <em v-if="erreurs.confirmation">{{ erreurs.confirmation }}</em>
          </label>
        </div>
      </fieldset>

      <!-- La case est hors des cartes de saisie : ce qu'on accepte n'est pas
           une donnee de plus a renseigner, et la noyer dans la grille du compte
           reviendrait a la faire cocher sans la lire. -->
      <label class="consentement" :class="{ manquant: !!erreurs.conditionsAcceptees }">
        <input id="conditions" v-model="form.conditionsAcceptees" type="checkbox" />
        <span>
          J'accepte les
          <NuxtLink to="/conditions-utilisation" target="_blank">conditions générales</NuxtLink>
          et j'ai pris connaissance de la
          <NuxtLink to="/politique-confidentialite" target="_blank">
            politique de confidentialité
          </NuxtLink>
          .
          <em v-if="erreurs.conditionsAcceptees">{{ erreurs.conditionsAcceptees }}</em>
        </span>
      </label>

      <p v-if="erreurGenerale" class="erreur">{{ erreurGenerale }}</p>

      <div class="pied-formulaire">
        <button type="submit" class="principal" :disabled="envoi">
          {{ envoi ? 'Création...' : 'Créer mon dossier candidat' }}
        </button>

        <p class="deja">
          Déjà un compte ?
          <NuxtLink to="/connexion">Connectez-vous</NuxtLink>
        </p>
      </div>
    </form>

    <p v-if="!enAttente" class="note">
      Aucune donnée de santé ne vous est demandée. L'agence enregistre seulement si vous êtes
      déployable, jamais pourquoi.
    </p>

    <!-- Reprise de l'ecran de choix supprime : c'est la seule information qu'il
         portait et qui n'existait nulle part ailleurs. -->
    <p v-if="!enAttente" class="note">
      Vous représentez un service d'aide à domicile ? Votre structure est enregistrée par nos
      équipes, après vérification de votre déclaration SAP ou de votre autorisation.
      <a href="mailto:contact@releve.example">Écrivez-nous</a>.
    </p>
  </section>
</template>

<style scoped>
.inscription {
  padding-inline: 28px;
  max-width: 720px;
  margin: 0 auto;
  padding-block: 56px 100px;
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
  /* Le canvas pose 40 px ; la borne basse evite qu'un ecran de telephone ne
   * coupe le titre en quatre lignes. */
  margin: 0 0 30px;
  font-size: clamp(30px, 6vw, 40px);
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: -0.035em;
}

.etapes {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding: 0;
  margin: 0 0 32px;
  list-style: none;
}

.etapes li {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 12px 18px;
  font-size: 14.5px;
  font-weight: 600;
  white-space: nowrap;
  color: var(--muted);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 12px;
}

.etapes .actif {
  color: var(--dom-fonce);
  background: var(--surface-2);
  border-color: var(--dom);
}

.puce {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  font-size: 12.5px;
  font-weight: 700;
  color: var(--dom);
  background: var(--surface-2);
  border-radius: 50%;
}

.etapes .actif .puce {
  color: var(--surface);
  background: var(--dom);
}

form {
  display: grid;
  gap: 18px;
}

.carte {
  padding: 32px;
  margin: 0;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 22px;
}

legend {
  padding: 0;
  font-size: 20px;
  font-weight: 600;
}

.sous-titre {
  margin: 6px 0 26px;
  font-size: 14.5px;
  line-height: 1.6;
  color: var(--muted);
}

.grille {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18px;
}

.large {
  grid-column: 1 / -1;
}

.champ {
  display: grid;
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

input::placeholder {
  color: var(--muted);
  opacity: 0.55;
}

input:focus-visible {
  outline: 2px solid var(--dom);
  outline-offset: 2px;
}

input[type='range'] {
  padding: 0;
  background: transparent;
  border: 0;
  accent-color: var(--dom);
}

.cases {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 20px;
}

.case {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 14.5px;
  font-weight: 500;
  color: var(--ink);
}

.case input {
  width: auto;
  padding: 0;
  accent-color: var(--dom);
}

em {
  font-size: 13px;
  font-style: normal;
  font-weight: 500;
  color: var(--eta);
}

.consentement {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 18px 20px;
  font-size: 14.5px;
  line-height: 1.6;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 16px;
}

/* Le filet passe au rouge quand la case manque : sans cela, le message se
   perdrait sous un formulaire long, et on chercherait l'erreur en haut. */
.consentement.manquant {
  background: var(--eta-soft);
  border-color: var(--eta-line);
}

.consentement input {
  width: auto;
  padding: 0;
  margin-top: 3px;
  accent-color: var(--dom);
}

.consentement a {
  font-weight: 600;
  color: var(--dom);
}

.consentement em {
  display: block;
  margin-top: 4px;
}

.erreur {
  padding: 13px 15px;
  margin: 0;
  font-size: 14px;
  color: var(--eta);
  background: var(--eta-soft);
  border: 1px solid var(--eta-line);
  border-radius: 12px;
}

.pied-formulaire {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 20px;
  align-items: center;
  margin-top: 10px;
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

.principal:focus-visible {
  outline: 2px solid var(--dom);
  outline-offset: 3px;
}

.deja {
  margin: 0;
  font-size: 13px;
  color: var(--muted);
}

.deja a {
  font-weight: 600;
  color: var(--dom);
  text-decoration: underline;
}

.note {
  margin: 24px 0 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--muted);
}

.note + .note {
  margin-top: 12px;
}

.note a {
  color: var(--dom);
}

@media (max-width: 560px) {
  .carte {
    padding: 22px;
  }

  .grille {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 560px) {
.inscription {
    padding-inline: 20px;
  }
}
</style>
