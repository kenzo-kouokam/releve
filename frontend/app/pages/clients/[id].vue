<script setup lang="ts">
import type { ClientDetail, StatutJuridique } from '@releve/shared';
import {
  AUTORISATION_PAR_TYPE,
  STATUT_JURIDIQUE_CADRE_SALARIAL,
  STATUT_JURIDIQUE_LIBELLES,
  TYPE_CLIENT_LIBELLES,
  TYPE_LIEU_LIBELLES,
} from '@releve/shared';

const route = useRoute();
const { requete } = useApi();

const identifiant = computed(() => String(route.params.id));

const {
  data: client,
  error,
  refresh,
} = await useAsyncData<ClientDetail>(
  () => `client:${identifiant.value}`,
  () => requete<ClientDetail>(`/clients/${identifiant.value}`),
);

const introuvable = computed(
  () => (error.value as { statusCode?: number } | null)?.statusCode === 404,
);

// --- activation

const enCours = ref(false);
const message = ref('');

/**
 * La saisie de l'autorisation, pre-remplie par ce que la fiche porte deja.
 *
 * Pre-remplie et non vide : une fiche creee par l'agence peut arriver ici avec
 * ses pieces, et les redemander ferait ressaisir ce qui est deja verifie. Une
 * fiche venue de l'inscription publique, elle, arrive vide — c'est le cas
 * courant, et c'est voulu : le formulaire public ne demande pas l'autorisation,
 * parce que rien ne l'y verifiait.
 */
const saisie = reactive({
  statutJuridique: '' as StatutJuridique | '',
  numeroFiness: '',
  arreteReference: '',
  arreteDate: '',
});

watchEffect(() => {
  if (!client.value) {
    return;
  }

  saisie.statutJuridique = client.value.statutJuridique ?? '';
  saisie.numeroFiness = client.value.numeroFiness ?? '';
  saisie.arreteReference = client.value.arreteReference ?? '';
  saisie.arreteDate = client.value.arreteDate ?? '';
});

/** La piece a lire depend du type : voir `AUTORISATION_PAR_TYPE`. */
const autorisation = computed(() =>
  client.value ? AUTORISATION_PAR_TYPE[client.value.type] : null,
);

const STATUTS = Object.keys(STATUT_JURIDIQUE_LIBELLES) as StatutJuridique[];

/**
 * L'ecriture rend un resume, pas le detail : on relit la fiche plutot que de
 * rafistoler l'etat local, ce qui evite qu'un ecran reste desynchronise d'une
 * regle appliquee cote serveur — ici, le refus d'activer sans les trois champs.
 */
async function ecrire(corps: Record<string, unknown>): Promise<void> {
  message.value = '';
  enCours.value = true;

  try {
    await requete(`/clients/${identifiant.value}`, { method: 'PATCH', body: corps });
    await refresh();
  } catch (cause) {
    message.value =
      (cause as { data?: { message?: string } }).data?.message ?? 'Activation impossible.';
  } finally {
    enCours.value = false;
  }
}

/**
 * Activer, c'est ouvrir le depot de besoins — et declencher le courriel qui
 * l'annonce. Les pieces partent dans la meme requete que `actif` : les envoyer
 * separement laisserait une fenetre ou la fiche serait active sans autorisation
 * documentee, ce que l'API refuse de toute facon, mais qui produirait deux
 * erreurs la ou il n'y a qu'un geste.
 */
function activer(): Promise<void> {
  return ecrire({
    actif: true,
    statutJuridique: saisie.statutJuridique,
    numeroFiness: saisie.numeroFiness,
    arreteReference: saisie.arreteReference,
    ...(saisie.arreteDate ? { arreteDate: saisie.arreteDate } : {}),
  });
}

/**
 * La desactivation n'a pas de formulaire : elle retire un droit, elle n'en
 * documente pas un. Aucun courriel non plus — une suspension se dit de vive
 * voix, et l'annoncer par un message automatique serait la pire facon de
 * l'apprendre.
 */
function desactiver(): Promise<void> {
  return ecrire({ actif: false });
}
</script>

<template>
  <section class="fiche">
    <NuxtLink class="retour" to="/clients">&larr; Tous les clients</NuxtLink>

    <p v-if="introuvable" class="alerte">
      Ce client n existe pas, ou il appartient a une autre agence.
    </p>

    <p v-else-if="error" class="alerte">API injoignable.</p>

    <template v-else-if="client">
      <div class="titre">
        <h1>{{ client.raisonSociale }}</h1>
        <span class="pastille">{{ TYPE_CLIENT_LIBELLES[client.type] }}</span>
        <span v-if="!client.actif" class="pastille inactif">Inactif</span>
        <span v-if="client.statutJuridique" class="pastille regime">
          {{ STATUT_JURIDIQUE_LIBELLES[client.statutJuridique] }}
        </span>
        <span v-else class="pastille manque">Statut a renseigner</span>
      </div>

      <dl class="proprietes">
        <div>
          <dt>SIRET</dt>
          <dd>{{ client.siret }}</dd>
        </div>
        <!--
          Deux valeurs pour tous — FINESS et reference d'autorisation — mais pas
          la meme piece : un EHPAD tient son droit d'accueillir d'un arrete
          conjoint, un hopital ou une clinique d'une autorisation d'activite de
          soins. Nommer la bonne evite de reclamer a une clinique un document
          qui n'existe pas, et de prendre ce qu'elle repondrait pour une
          verification. L'absence est nommee plutot que laissee vide — c'est
          elle qui bloque l'activation de la fiche.
        -->
        <div>
          <dt>Statut et autorisation</dt>
          <dd>
            <template v-if="client.statutJuridique">
              {{ STATUT_JURIDIQUE_LIBELLES[client.statutJuridique] }}
              <template v-if="client.numeroFiness">
                &middot; FINESS {{ client.numeroFiness }}
              </template>
              <template v-if="client.arreteReference">
                &middot; arrete {{ client.arreteReference }}
                <template v-if="client.arreteDate"> du {{ client.arreteDate }}</template>
              </template>
            </template>
            <span v-else class="manquant">a renseigner avant activation</span>
          </dd>
        </div>
        <div>
          <dt>Convention collective</dt>
          <dd>
            <template v-if="client.conventionCollective">
              {{ client.conventionCollective }}
              <template v-if="client.idcc"> (IDCC {{ client.idcc }})</template>
            </template>
            <!--
              Tant qu elle manque, le statut juridique en dit le cadre probable.
              Indicatif et presente comme tel : deux etablissements de meme
              statut peuvent relever de conventions differentes, et c est la
              fiche qui fait foi. Le montrer ici evite d aller chercher ailleurs
              ce que la fiche sait deja.
            -->
            <template v-else-if="client.statutJuridique">
              <span class="manquant">a renseigner</span>
              &middot; cadre probable : {{ STATUT_JURIDIQUE_CADRE_SALARIAL[client.statutJuridique] }}
            </template>
            <span v-else class="manquant">a renseigner</span>
          </dd>
        </div>
        <div>
          <dt>Contact</dt>
          <dd>
            <template v-if="client.contactNom || client.contactEmail || client.contactTel">
              {{ client.contactNom }}
              <template v-if="client.contactEmail"> &middot; {{ client.contactEmail }}</template>
              <template v-if="client.contactTel"> &middot; {{ client.contactTel }}</template>
            </template>
            <span v-else class="manquant">a renseigner</span>
          </dd>
        </div>
      </dl>

      <p class="note">
        La convention collective affichee ici est celle de l entreprise utilisatrice. C est elle qui
        fixe le salaire de reference de l interimaire, pas celle de son employeur.
      </p>

      <p
        v-if="!client.statutJuridique || !client.numeroFiness || !client.arreteReference"
        class="note avertissement"
      >
        L autorisation n est pas documentee : il manque le statut juridique du gestionnaire, le
        numero FINESS geographique ou la reference de l autorisation. Piece a reclamer pour ce
        type d etablissement :
        <strong>{{ AUTORISATION_PAR_TYPE[client.type].piece }}</strong>
        ({{ AUTORISATION_PAR_TYPE[client.type].fondement }}). Cela se saisit sur piece, et tant qu
        il manque l etablissement ne peut pas etre active — placer du personnel dans une structure
        dont on n a lu aucune autorisation reviendrait a ignorer si elle a le droit d accueillir
        qui que ce soit.
      </p>

      <!--
        L'encart d'activation, et le seul endroit d'ou l'agence ouvre le depot
        de besoins. Il ne s'affiche que pour une fiche inactive : une fois
        active, il n'aurait plus rien a demander.
      -->
      <form v-if="!client.actif" class="activation" @submit.prevent="activer()">
        <h2>Activer l etablissement</h2>
        <p class="intro">
          Reportez ici ce que dit la piece que vous avez sous les yeux :
          <strong>{{ autorisation?.piece }}</strong> ({{ autorisation?.fondement }}). Tant qu elle
          n est pas saisie, l etablissement ne peut deposer aucun besoin.
        </p>

        <div class="grille">
          <label>
            <span>Statut juridique du gestionnaire</span>
            <select v-model="saisie.statutJuridique" required>
              <option value="" disabled>A selectionner</option>
              <option v-for="statut in STATUTS" :key="statut" :value="statut">
                {{ STATUT_JURIDIQUE_LIBELLES[statut] }}
              </option>
            </select>
            <!-- Le statut ne dit pas le droit d exercer, il dit la convention
                 collective : c est elle qui fixe le salaire de reference de
                 l interimaire. L afficher evite un choix fait au hasard. -->
            <small v-if="saisie.statutJuridique" class="aide">
              {{ STATUT_JURIDIQUE_CADRE_SALARIAL[saisie.statutJuridique] }}
            </small>
          </label>

          <label>
            <span>Numero FINESS geographique</span>
            <input
              v-model="saisie.numeroFiness"
              type="text"
              inputmode="numeric"
              placeholder="9 chiffres"
              required
            />
            <small class="aide">Celui du site, pas celui du gestionnaire.</small>
          </label>

          <label>
            <span>Reference de l autorisation</span>
            <input v-model="saisie.arreteReference" type="text" placeholder="ARR-2024-0117" required />
          </label>

          <label>
            <span>Date de l autorisation <small>facultatif</small></span>
            <input v-model="saisie.arreteDate" type="date" />
          </label>
        </div>

        <p v-if="message" class="alerte">{{ message }}</p>

        <p class="consequence">
          L activation ouvre le depot de besoins et envoie un courriel au contact de
          l etablissement.
        </p>

        <button type="submit" class="valider" :disabled="enCours">
          {{ enCours ? 'Activation…' : 'Activer l etablissement' }}
        </button>
      </form>

      <!-- Le controle inverse, qui existait avant l ouverture de l inscription :
           c est lui qui rend le verrou defendable, puisque c est le meme. -->
      <div v-else class="suspension">
        <p v-if="message" class="alerte">{{ message }}</p>
        <button type="button" class="retirer" :disabled="enCours" @click="desactiver()">
          Desactiver l etablissement
        </button>
        <span class="explication">
          Suspend le depot de besoins. Sans courriel : une suspension se dit de vive voix.
        </span>
      </div>

      <h2>
        Lieux d intervention <span class="compte">{{ client.lieux.length }}</span>
      </h2>

      <p v-if="!client.lieux.length" class="vide">Aucun lieu d intervention enregistre.</p>

      <ul v-else class="liste">
        <li v-for="lieu in client.lieux" :key="lieu.id" class="lieu">
          <div class="entete-lieu">
            <p class="libelle">{{ lieu.libelle }}</p>
            <span class="pastille" :class="lieu.type === 'ETABLISSEMENT' ? 'eta' : 'dom'">
              {{ TYPE_LIEU_LIBELLES[lieu.type] }}
            </span>
          </div>

          <p class="adresse">{{ lieu.adresse }}, {{ lieu.codePostal }} {{ lieu.ville }}</p>

          <p class="acces">
            <template v-if="lieu.etage">{{ lieu.etage }}</template>
            <template v-if="lieu.codeAcces"> &middot; code {{ lieu.codeAcces }}</template>
            <template v-if="lieu.nombreMissions">
              &middot; {{ lieu.nombreMissions }} mission(s)
            </template>
          </p>

          <p v-if="lieu.consignes" class="consignes">{{ lieu.consignes }}</p>
        </li>
      </ul>
    </template>
  </section>
</template>

<style scoped>
.fiche {
  padding-block: 32px 0;
}

.retour {
  font-family: var(--mono);
  font-size: 11.5px;
  color: var(--muted);
  text-decoration: none;
}

.retour:hover {
  color: var(--dom);
}

.titre {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 14px;
  margin: 14px 0 20px;
}

h1 {
  margin: 0;
  font-size: 1.6rem;
  font-weight: 700;
  letter-spacing: -0.01em;
}

h2 {
  margin: 30px 0 12px;
  font-size: 1.05rem;
  font-weight: 700;
}

h2 .compte {
  font-family: var(--mono);
  font-size: 12px;
  font-weight: 400;
  color: var(--muted);
}

.proprietes {
  margin: 0;
  display: grid;
  gap: 1px;
  background: var(--line);
  border: 1px solid var(--line);
}

.proprietes > div {
  background: var(--surface);
  padding: 12px 16px;
  display: grid;
  grid-template-columns: minmax(160px, 220px) 1fr;
  gap: 8px 18px;
}

@media (max-width: 620px) {
  .proprietes > div {
    grid-template-columns: 1fr;
    gap: 3px;
  }
}

dt {
  font-family: var(--mono);
  font-size: 10.5px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}

dd {
  margin: 0;
  font-size: 0.94rem;
}

.note {
  margin: 14px 0 0;
  font-size: 0.86rem;
  color: var(--muted);
  padding: 12px 14px;
  background: var(--dom-soft);
  border-left: 3px solid var(--dom);
}

.liste {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 1px;
  background: var(--line);
  border: 1px solid var(--line);
}

.lieu {
  background: var(--surface);
  padding: 15px 18px;
  display: grid;
  gap: 5px;
}

.entete-lieu {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.libelle {
  margin: 0;
  font-weight: 700;
}

.adresse,
.acces,
.consignes {
  margin: 0;
  font-family: var(--mono);
  font-size: 11.5px;
  color: var(--muted);
}

.consignes {
  padding-top: 4px;
  border-top: 1px dashed var(--line);
}

.pastille {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 3px 8px;
  border-radius: 2px;
  border: 1px solid var(--eta);
  color: var(--eta);
  background: var(--eta-soft);
}

.pastille.dom {
  color: var(--dom);
  background: var(--dom-soft);
  border-color: var(--dom);
}

.pastille.regime {
  background: var(--dom-soft);
}

.pastille.manque {
  background: var(--eta-soft);
  color: var(--eta);
}

.note.avertissement {
  padding: 12px 14px;
  background: var(--eta-soft);
  border-radius: var(--r-champ);
  color: var(--eta);
}

.pastille.inactif {
  border-style: dashed;
}

.manquant {
  color: var(--eta);
}

.vide,
.alerte {
  font-size: 0.92rem;
  color: var(--muted);
  padding: 18px;
  background: var(--surface);
  border: 1px solid var(--line);
}

.alerte {
  margin-top: 16px;
  border-left: 3px solid var(--eta);
}

/* ---------- activation ---------- */

.activation {
  padding: 22px;
  margin-top: 28px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-carte);
}

.activation h2 {
  margin: 0 0 8px;
}

.activation .intro {
  margin: 0 0 20px;
  font-size: 0.92rem;
  line-height: 1.6;
  color: var(--muted);
}

/* `auto-fit` sur une largeur minimale plutot qu un nombre de colonnes fige :
 * la fiche client s affiche aussi sur un ecran etroit, et deux colonnes de
 * 140 px y seraient illisibles. */
.activation .grille {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
  gap: 16px;
}

.activation label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  font-size: 0.82rem;
  font-weight: 600;
}

.activation label small {
  font-weight: 400;
  color: var(--muted);
}

.activation input,
.activation select {
  width: 100%;
  min-width: 0;
  padding: 10px 12px;
  font: inherit;
  font-weight: 400;
  color: var(--ink);
  background: var(--ground);
  border: 1px solid var(--line);
  border-radius: var(--r-champ);
}

.activation .aide {
  font-size: 0.78rem;
  font-weight: 400;
  line-height: 1.5;
  color: var(--muted);
}

.consequence {
  margin: 20px 0 16px;
  font-size: 0.85rem;
  color: var(--muted);
}

.valider {
  padding: 11px 22px;
  font: inherit;
  font-weight: 600;
  color: var(--surface);
  cursor: pointer;
  background: var(--dom);
  border: 0;
  border-radius: var(--r-champ);
}

.valider:hover:not(:disabled) {
  background: var(--dom-fonce);
}

.valider:disabled {
  cursor: default;
  opacity: 0.6;
}

.suspension {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 14px;
  align-items: center;
  margin-top: 28px;
}

.retirer {
  padding: 9px 16px;
  font: inherit;
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--eta-encre);
  cursor: pointer;
  background: var(--surface);
  border: 1px solid var(--eta-line);
  border-radius: var(--r-champ);
}

.retirer:hover:not(:disabled) {
  background: var(--eta-soft);
}

.retirer:disabled {
  cursor: default;
  opacity: 0.6;
}

.explication {
  flex: 1 1 260px;
  font-size: 0.82rem;
  color: var(--muted);
}

.valider:focus-visible,
.retirer:focus-visible {
  outline: 2px solid var(--dom);
  outline-offset: 2px;
}
</style>
