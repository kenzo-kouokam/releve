<script setup lang="ts">
import {
  inscriptionEtablissementSchema,
  TYPE_CLIENT_LIBELLES,
  TYPE_LIEU_AIDE,
  TYPE_LIEU_LIBELLES,
  type TypeClient,
  type TypeLieu,
} from '@releve/shared';

useHead({
  title: 'Inscription établissement — Relève',
  meta: [
    {
      name: 'description',
      content:
        "Ouvrez le compte de votre EHPAD, hôpital ou clinique sur Relève et déposez vos besoins de remplacement en aide-soignant ou accompagnant éducatif et social.",
    },
  ],
});

const { inscrireEtablissement } = useSession();

const form = reactive({
  raisonSociale: '',
  siret: '',
  type: '' as TypeClient | '',
  contactNom: '',
  contactTel: '',

  lieuType: 'ETABLISSEMENT' as TypeLieu,
  lieuLibelle: '',
  adresse: '',
  codePostal: '',
  ville: '',

  email: '',
  motDePasse: '',
  confirmation: '',
  conditionsAcceptees: false,
});

const erreurs = ref<Record<string, string>>({});
const voirMotDePasse = ref(false);
const voirConfirmation = ref(false);
const erreurGenerale = ref('');
const envoi = ref(false);

/**
 * Adresse à laquelle le lien vient de partir. Non vide = l'inscription a
 * abouti, et le formulaire cède la place à l'écran d'attente : le laisser
 * affiché inviterait à re-soumettre, ce qui ne rendrait qu'un 409.
 */
const enAttente = ref('');

const TYPES_CLIENT = Object.keys(TYPE_CLIENT_LIBELLES) as TypeClient[];
const TYPES_LIEU = Object.keys(TYPE_LIEU_LIBELLES) as TypeLieu[];

/**
 * Le libellé du lieu se pré-remplit avec la raison sociale.
 *
 * Un établissement mono-site n'a pas envie de nommer son propre bâtiment, et
 * laisser le champ vide bloquerait la validation sans qu'il comprenne pourquoi.
 * Il reste modifiable : un gestionnaire multi-sites, lui, a besoin de
 * distinguer « Les Tilleuls — hébergement » de « Les Tilleuls — unité protégée ».
 */
watchEffect(() => {
  if (!form.lieuLibelle && form.raisonSociale) {
    form.lieuLibelle = form.raisonSociale;
  }
});

function corps() {
  return {
    etablissement: {
      raisonSociale: form.raisonSociale,
      siret: form.siret,
      type: form.type,
      contactNom: form.contactNom,
      contactTel: form.contactTel,
    },
    lieu: {
      type: form.lieuType,
      libelle: form.lieuLibelle,
      adresse: form.adresse,
      codePostal: form.codePostal,
      ville: form.ville,
    },
    compte: { email: form.email, motDePasse: form.motDePasse },
    conditionsAcceptees: form.conditionsAcceptees,
  };
}

async function soumettre(): Promise<void> {
  erreurs.value = {};
  erreurGenerale.value = '';

  if (form.motDePasse !== form.confirmation) {
    erreurs.value.confirmation = 'Les deux mots de passe diffèrent';
    return;
  }

  // Le même schéma que celui qui valide la requête côté serveur : un message
  // affiché avant l'aller-retour, jamais une seconde règle qui pourrait diverger.
  const verifie = inscriptionEtablissementSchema.safeParse(corps());

  if (!verifie.success) {
    for (const souci of verifie.error.issues) {
      erreurs.value[String(souci.path.at(-1))] = souci.message;
    }
    return;
  }

  envoi.value = true;

  try {
    const reponse = await inscrireEtablissement(corps());

    enAttente.value = reponse.email;
  } catch (cause) {
    const erreur = cause as { statusCode?: number; data?: { message?: string } };
    erreurGenerale.value =
      erreur.statusCode === 409
        ? (erreur.data?.message ?? 'Un compte existe déjà pour cet établissement.')
        : 'Inscription impossible pour le moment. Réessayer dans un instant.';
  } finally {
    envoi.value = false;
  }
}
</script>

<template>
  <section class="inscription">
    <p class="accroche">Le soin, sans attendre</p>
    <h1>Ouvrez le compte de votre établissement</h1>

    <ol class="etapes">
      <li :class="{ actif: !enAttente }">
        <span class="puce">1</span>
        Votre établissement
      </li>
      <li :class="{ actif: !!enAttente }">
        <span class="puce">2</span>
        Confirmation
      </li>
    </ol>

    <AppAttenteVerification v-if="enAttente" :email="enAttente" />

    <form v-else novalidate @submit.prevent="soumettre">
      <fieldset class="carte">
        <legend>Votre établissement</legend>
        <p class="sous-titre">
          Ces informations figureront sur les contrats de mise à disposition.
        </p>

        <div class="grille">
          <label class="large">
            <span>Raison sociale</span>
            <input v-model="form.raisonSociale" type="text" autocomplete="organization" />
            <em v-if="erreurs.raisonSociale">{{ erreurs.raisonSociale }}</em>
          </label>

          <label>
            <span>SIRET</span>
            <input v-model="form.siret" type="text" inputmode="numeric" placeholder="14 chiffres" />
            <em v-if="erreurs.siret">{{ erreurs.siret }}</em>
          </label>

          <!--
            Le seul champ administratif du formulaire, et il ne demande aucun
            document : le type décide de la pièce que l'agence réclamera ensuite
            — arrêté conjoint pour un EHPAD, autorisation d'activité de soins
            pour un établissement de santé. Le statut juridique du gestionnaire,
            qui fixe la convention collective, se renseigne à la validation avec
            elle.
          -->
          <label>
            <span>Type d'établissement</span>
            <select v-model="form.type">
              <option value="" disabled>À sélectionner</option>
              <option v-for="type in TYPES_CLIENT" :key="type" :value="type">
                {{ TYPE_CLIENT_LIBELLES[type] }}
              </option>
            </select>
            <em v-if="erreurs.type">{{ erreurs.type }}</em>
          </label>

          <label>
            <span>Nom du contact</span>
            <input v-model="form.contactNom" type="text" autocomplete="name" />
            <em v-if="erreurs.contactNom">{{ erreurs.contactNom }}</em>
          </label>

          <label>
            <span>Téléphone</span>
            <input v-model="form.contactTel" type="tel" autocomplete="tel" />
            <em v-if="erreurs.contactTel">{{ erreurs.contactTel }}</em>
          </label>
        </div>
      </fieldset>

      <fieldset class="carte">
        <legend>Votre premier site</legend>
        <p class="sous-titre">
          L'adresse où les intérimaires viendront travailler. Vous pourrez en ajouter d'autres
          depuis votre espace.
        </p>

        <div class="grille">
          <label>
            <span>Type de lieu</span>
            <select v-model="form.lieuType">
              <option v-for="type in TYPES_LIEU" :key="type" :value="type">
                {{ TYPE_LIEU_LIBELLES[type] }}
              </option>
            </select>
            <small class="aide">{{ TYPE_LIEU_AIDE[form.lieuType] }}</small>
          </label>

          <label>
            <span>Nom du site</span>
            <input v-model="form.lieuLibelle" type="text" />
            <em v-if="erreurs.libelle">{{ erreurs.libelle }}</em>
          </label>

          <label class="large">
            <span>Adresse</span>
            <input v-model="form.adresse" type="text" autocomplete="street-address" />
            <em v-if="erreurs.adresse">{{ erreurs.adresse }}</em>
          </label>

          <label>
            <span>Code postal</span>
            <input v-model="form.codePostal" type="text" inputmode="numeric" />
            <em v-if="erreurs.codePostal">{{ erreurs.codePostal }}</em>
          </label>

          <label>
            <span>Ville</span>
            <input v-model="form.ville" type="text" />
            <em v-if="erreurs.ville">{{ erreurs.ville }}</em>
          </label>
        </div>
      </fieldset>

      <fieldset class="carte">
        <legend>Votre compte</legend>
        <p class="sous-titre">
          L'adresse sert d'identifiant de connexion et de canal de contact. Nous y envoyons un lien
          de confirmation.
        </p>

        <div class="grille">
          <label class="large">
            <span>Adresse e-mail</span>
            <input v-model="form.email" type="email" autocomplete="email" />
            <em v-if="erreurs.email">{{ erreurs.email }}</em>
          </label>

          <label>
            <span>Mot de passe</span>
            <div class="champ-mot-de-passe">
              <input
                v-model="form.motDePasse"
                :type="voirMotDePasse ? 'text' : 'password'"
                autocomplete="new-password"
              />
              <AppBasculeMotDePasse v-model:visible="voirMotDePasse" />
            </div>
            <em v-if="erreurs.motDePasse">{{ erreurs.motDePasse }}</em>
          </label>

          <label>
            <span>Confirmation</span>
            <div class="champ-mot-de-passe">
              <input
                v-model="form.confirmation"
                :type="voirConfirmation ? 'text' : 'password'"
                autocomplete="new-password"
              />
              <AppBasculeMotDePasse v-model:visible="voirConfirmation" champ="la confirmation" />
            </div>
            <em v-if="erreurs.confirmation">{{ erreurs.confirmation }}</em>
          </label>
        </div>

        <label class="consentement">
          <input v-model="form.conditionsAcceptees" type="checkbox" />
          <span>
            J'accepte les
            <NuxtLink to="/conditions-utilisation">conditions générales d'utilisation</NuxtLink>
            et la
            <NuxtLink to="/politique-confidentialite">politique de confidentialité</NuxtLink>.
          </span>
        </label>
        <em v-if="erreurs.conditionsAcceptees" class="erreur-consentement">
          {{ erreurs.conditionsAcceptees }}
        </em>
      </fieldset>

      <p v-if="erreurGenerale" class="alerte">{{ erreurGenerale }}</p>

      <!--
        Dit avant le bouton, pas après l'envoi : quelqu'un qui remplit quatre
        blocs doit savoir ce qu'il obtient, et un compte qui ne peut encore rien
        faire est une surprise désagréable s'il la découvre une fois connecté.
      -->
      <p class="note-validation">
        Votre compte sera créé immédiatement, et <strong>activé après vérification</strong> de
        votre autorisation par notre équipe nous vous demanderons la pièce par retour de
        courriel. Vous pourrez suivre l'avancement depuis votre espace ; le dépôt de besoins
        s'ouvrira à l'activation.
      </p>

      <AppBouton type="submit" :desactive="envoi">
        {{ envoi ? 'Envoi…' : 'Créer le compte de mon établissement' }}
      </AppBouton>
    </form>

    <p class="bascule">
      Vous cherchez des missions d'intérim ?
      <NuxtLink to="/inscription/interimaire">Créer un dossier candidat</NuxtLink>.
    </p>
  </section>
</template>

<style scoped>
.inscription {
  max-width: 760px;
  padding: 40px 20px 72px;
  margin: 0 auto;
}

.accroche {
  margin: 0 0 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--dom);
}

h1 {
  margin: 0 0 24px;
  font-size: clamp(26px, 4vw, 34px);
  line-height: 1.15;
}

.etapes {
  display: flex;
  gap: 24px;
  padding: 0;
  margin: 0 0 28px;
  list-style: none;
}

.etapes li {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 14px;
  color: var(--muted);
}

.etapes li.actif {
  font-weight: 600;
  color: var(--text);
}

.puce {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  font-size: 12px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 50%;
}

.etapes li.actif .puce {
  color: var(--surface);
  background: var(--dom);
  border-color: var(--dom);
}

.carte {
  padding: 22px;
  margin: 0 0 18px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 14px;
}

legend {
  padding: 0 8px;
  font-size: 15px;
  font-weight: 600;
}

.sous-titre {
  margin: 0 0 18px;
  font-size: 13.5px;
  line-height: 1.6;
  color: var(--muted);
}

.grille {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
}

label.large {
  grid-column: 1 / -1;
}

label small {
  font-weight: 400;
  color: var(--muted);
}

input,
select {
  padding: 10px 12px;
  font: inherit;
  font-weight: 400;
  color: var(--text);
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 9px;
}

em {
  font-size: 12px;
  font-style: normal;
  font-weight: 500;
  color: var(--eta);
}

.aide {
  font-size: 12px;
  line-height: 1.5;
  font-weight: 400;
  color: var(--muted);
}

.consentement {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  margin-top: 18px;
  font-size: 13px;
  font-weight: 400;
  line-height: 1.6;
}

.consentement input {
  margin-top: 3px;
}

.erreur-consentement {
  display: block;
  margin-top: 6px;
}

.alerte {
  padding: 12px 14px;
  margin: 0 0 16px;
  font-size: 13.5px;
  color: var(--eta);
  background: var(--eta-soft);
  border-radius: 10px;
}

.note-validation {
  padding: 14px 16px;
  margin: 0 0 20px;
  font-size: 13.5px;
  line-height: 1.6;
  color: var(--muted);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 12px;
}

.bascule {
  margin-top: 28px;
  font-size: 13.5px;
  color: var(--muted);
}

@media (max-width: 620px) {
  .grille {
    grid-template-columns: minmax(0, 1fr);
  }

  .etapes {
    gap: 16px;
  }
}
</style>
