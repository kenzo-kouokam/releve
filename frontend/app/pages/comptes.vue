<script setup lang="ts">
import type {
  CandidatResume,
  ClientResume,
  PageResultat,
  RoleUtilisateur,
  UtilisateurResume,
} from '@releve/shared';
import { MOT_DE_PASSE_LONGUEUR_MIN, ROLE_LIBELLES } from '@releve/shared';

const { requete } = useApi();
const { utilisateur: moi } = useSession();

const estAdministrateur = computed(() => moi.value?.role === 'ADMIN_AGENCE');

const { data, error, refresh } = await useAsyncData<PageResultat<UtilisateurResume>>(
  'comptes',
  () => requete<PageResultat<UtilisateurResume>>('/utilisateurs', { query: { limite: 100 } }),
  { immediate: estAdministrateur.value },
);

// Charges pour les listes deroulantes de rattachement seulement.
const { data: clients } = await useAsyncData<PageResultat<ClientResume>>(
  'comptes:clients',
  () => requete<PageResultat<ClientResume>>('/clients', { query: { limite: 100 } }),
  { immediate: estAdministrateur.value },
);

const { data: candidats } = await useAsyncData<PageResultat<CandidatResume>>(
  'comptes:candidats',
  () => requete<PageResultat<CandidatResume>>('/candidats', { query: { limite: 100 } }),
  { immediate: estAdministrateur.value },
);

const comptes = computed(() => data.value?.donnees ?? []);

const message = ref('');
const succes = ref('');
const enCours = ref(false);

async function appliquer(action: () => Promise<unknown>, confirmation = ''): Promise<void> {
  message.value = '';
  succes.value = '';
  enCours.value = true;

  try {
    await action();
    await refresh();
    succes.value = confirmation;
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

// --- creation

const nouvelEmail = ref('');
const nouveauMotDePasse = ref('');
const nouveauRole = ref<RoleUtilisateur>('CHARGE_RECRUTEMENT');
const rattachementClient = ref('');
const rattachementCandidat = ref('');

const rattachementAttendu = computed(() => {
  if (nouveauRole.value === 'CLIENT') return 'client';
  if (nouveauRole.value === 'CANDIDAT') return 'candidat';
  return null;
});

function creerCompte(): Promise<void> {
  const corps: Record<string, unknown> = {
    email: nouvelEmail.value,
    motDePasse: nouveauMotDePasse.value,
    role: nouveauRole.value,
  };

  if (rattachementAttendu.value === 'client') corps.clientId = rattachementClient.value;
  if (rattachementAttendu.value === 'candidat') corps.candidatId = rattachementCandidat.value;

  return appliquer(async () => {
    await requete<UtilisateurResume>('/utilisateurs', { method: 'POST', body: corps });
    nouvelEmail.value = '';
    nouveauMotDePasse.value = '';
    rattachementClient.value = '';
    rattachementCandidat.value = '';
  }, 'Compte cree.');
}

// --- actions sur un compte

function basculerActif(compte: UtilisateurResume): Promise<void> {
  return appliquer(
    () =>
      requete<UtilisateurResume>(`/utilisateurs/${compte.id}`, {
        method: 'PATCH',
        body: { actif: !compte.actif },
      }),
    compte.actif ? 'Compte desactive.' : 'Compte reactive.',
  );
}

function changerRole(compte: UtilisateurResume, role: RoleUtilisateur): Promise<void> {
  return appliquer(
    () =>
      requete<UtilisateurResume>(`/utilisateurs/${compte.id}`, {
        method: 'PATCH',
        body: { role },
      }),
    'Role modifie.',
  );
}

const reinitialisationPour = ref('');
const motDePasseReinitialise = ref('');

function reinitialiser(): Promise<void> {
  const id = reinitialisationPour.value;

  return appliquer(async () => {
    await requete<UtilisateurResume>(`/utilisateurs/${id}/mot-de-passe`, {
      method: 'POST',
      body: { motDePasse: motDePasseReinitialise.value },
    });
    reinitialisationPour.value = '';
    motDePasseReinitialise.value = '';
  }, 'Mot de passe reinitialise. Le transmettre a la personne par un autre canal.');
}

function libelleRattachement(compte: UtilisateurResume): string {
  if (compte.clientNom) return `client : ${compte.clientNom}`;
  if (compte.candidatNom) return `candidat : ${compte.candidatNom}`;
  return "personnel de l'agence";
}
</script>

<template>
  <section class="comptes">
    <div class="titre">
      <h1>Comptes</h1>
      <p v-if="estAdministrateur" class="compte-total">{{ data?.total ?? 0 }} compte(s)</p>
    </div>

    <p v-if="!estAdministrateur" class="alerte">
      Seul un administrateur d agence gere les acces. Ton role est
      {{ moi ? ROLE_LIBELLES[moi.role] : 'inconnu' }}.
    </p>

    <template v-else>
      <p v-if="error" class="alerte">API injoignable.</p>
      <p v-if="message" class="alerte">{{ message }}</p>
      <p v-if="succes" class="succes">{{ succes }}</p>

      <ul class="liste">
        <li v-for="compte in comptes" :key="compte.id" class="rangee">
          <div>
            <p class="email">
              {{ compte.email }}
              <span v-if="compte.id === moi?.id" class="soi">vous</span>
            </p>
            <p class="detail">
              {{ ROLE_LIBELLES[compte.role] }} &middot; {{ libelleRattachement(compte) }}
              <template v-if="compte.derniereCnx">
                &middot; derniere connexion {{ compte.derniereCnx.slice(0, 10) }}
              </template>
              <template v-else> &middot; jamais connecte</template>
            </p>
          </div>

          <span class="etat" :class="compte.actif ? 'ouvert' : 'ferme'">
            {{ compte.actif ? 'Actif' : 'Desactive' }}
          </span>

          <div class="actions">
            <button
              v-if="compte.role === 'CHARGE_RECRUTEMENT'"
              type="button"
              class="lien"
              :disabled="enCours"
              @click="changerRole(compte, 'ADMIN_AGENCE')"
            >
              Passer administrateur
            </button>
            <button
              v-else-if="compte.role === 'ADMIN_AGENCE' && compte.id !== moi?.id"
              type="button"
              class="lien"
              :disabled="enCours"
              @click="changerRole(compte, 'CHARGE_RECRUTEMENT')"
            >
              Retirer les droits admin
            </button>

            <button
              type="button"
              class="lien"
              :disabled="enCours"
              @click="reinitialisationPour = compte.id"
            >
              Reinitialiser le mot de passe
            </button>

            <button
              type="button"
              class="lien"
              :class="{ danger: compte.actif }"
              :disabled="enCours || compte.id === moi?.id"
              @click="basculerActif(compte)"
            >
              {{ compte.actif ? 'Desactiver' : 'Reactiver' }}
            </button>
          </div>
        </li>
      </ul>

      <!-- reinitialisation -->
      <form v-if="reinitialisationPour" class="bloc" @submit.prevent="reinitialiser()">
        <h2>Reinitialiser un mot de passe</h2>
        <p class="detail">
          Compte : {{ comptes.find((c) => c.id === reinitialisationPour)?.email }}
        </p>
        <div class="ligne-form">
          <label class="grandir">
            <span>Nouveau mot de passe ({{ MOT_DE_PASSE_LONGUEUR_MIN }} caracteres minimum)</span>
            <input
              id="reinit-mot-de-passe"
              v-model="motDePasseReinitialise"
              type="text"
              :minlength="MOT_DE_PASSE_LONGUEUR_MIN"
              required
            />
          </label>
          <button type="submit" :disabled="enCours">Reinitialiser</button>
          <button type="button" class="choix" @click="reinitialisationPour = ''">Annuler</button>
        </div>
        <p class="note">
          Le mot de passe est affiche en clair pour que tu puisses le transmettre, puis il n est
          plus jamais lisible : seule son empreinte est stockee.
        </p>
      </form>

      <!-- creation -->
      <form class="bloc" @submit.prevent="creerCompte()">
        <h2>Creer un compte</h2>

        <div class="ligne-form">
          <label class="grandir">
            <span>Adresse e-mail</span>
            <input id="nouvel-email" v-model="nouvelEmail" type="email" required />
          </label>

          <label class="grandir">
            <span>Mot de passe ({{ MOT_DE_PASSE_LONGUEUR_MIN }} caracteres minimum)</span>
            <input
              id="nouveau-mot-de-passe"
              v-model="nouveauMotDePasse"
              type="text"
              :minlength="MOT_DE_PASSE_LONGUEUR_MIN"
              required
            />
          </label>

          <label>
            <span>Role</span>
            <select id="nouveau-role" v-model="nouveauRole">
              <option value="CHARGE_RECRUTEMENT">Charge de recrutement</option>
              <option value="ADMIN_AGENCE">Administrateur d agence</option>
              <option value="CLIENT">Client</option>
              <option value="CANDIDAT">Candidat</option>
            </select>
          </label>

          <label v-if="rattachementAttendu === 'client'" class="grandir">
            <span>Client rattache</span>
            <select id="rattachement-client" v-model="rattachementClient" required>
              <option value="">Choisir un client</option>
              <option v-for="c in clients?.donnees ?? []" :key="c.id" :value="c.id">
                {{ c.raisonSociale }}
              </option>
            </select>
          </label>

          <label v-if="rattachementAttendu === 'candidat'" class="grandir">
            <span>Candidat rattache</span>
            <select id="rattachement-candidat" v-model="rattachementCandidat" required>
              <option value="">Choisir un candidat</option>
              <option v-for="c in candidats?.donnees ?? []" :key="c.id" :value="c.id">
                {{ c.prenom }} {{ c.nom }}
              </option>
            </select>
          </label>

          <button type="submit" :disabled="enCours">Creer</button>
        </div>

        <p class="note">
          Un compte de l agence n est rattache ni a un client ni a un candidat. Un compte client ou
          candidat, lui, tient son perimetre de ce rattachement : c est lui qui decide de ce que la
          personne verra une fois les espaces externes ouverts.
        </p>
      </form>
    </template>
  </section>
</template>

<style scoped>
.comptes {
  padding-block: 32px 0;
}

.titre {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px 14px;
  margin-bottom: 20px;
}

h1 {
  margin: 0;
  font-size: 1.6rem;
  font-weight: 700;
  letter-spacing: -0.01em;
}

h2 {
  margin: 0 0 12px;
  font-size: 1rem;
  font-weight: 700;
}

.compte-total {
  margin: 0;
  font-family: var(--mono);
  font-size: 12px;
  color: var(--muted);
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

.rangee {
  background: var(--surface);
  padding: 14px 16px;
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 10px 18px;
  align-items: center;
}

@media (max-width: 860px) {
  .rangee {
    grid-template-columns: 1fr;
    align-items: start;
  }
}

.email {
  margin: 0;
  font-weight: 700;
  font-size: 0.94rem;
}

.soi {
  font-family: var(--mono);
  font-size: 9.5px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  margin-left: 8px;
  padding: 2px 6px;
  border-radius: 2px;
  background: var(--dom-soft);
  color: var(--dom);
}

.detail {
  margin: 3px 0 0;
  font-family: var(--mono);
  font-size: 11px;
  color: var(--muted);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
}

.etat {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 3px 8px;
  border-radius: 2px;
  border: 1px solid;
  justify-self: start;
}

.etat.ouvert {
  color: var(--dom);
  background: var(--dom-soft);
  border-color: var(--dom);
}

.etat.ferme {
  color: var(--eta);
  background: var(--eta-soft);
  border-color: var(--eta);
}

.bloc {
  margin-top: 26px;
  padding: 18px;
  background: var(--surface);
  border: 1px solid var(--line);
}

.ligne-form {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: end;
}

.ligne-form label {
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}

.ligne-form .grandir {
  flex: 1;
  min-width: 220px;
}

select,
input {
  font-family: var(--sans);
  font-size: 0.92rem;
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-radius: 3px;
  background: var(--ground);
  color: var(--ink);
}

button {
  font-family: var(--sans);
  font-size: 0.9rem;
  font-weight: 700;
  padding: 9px 16px;
  border: 0;
  border-radius: 3px;
  background: var(--dom);
  color: var(--surface);
  cursor: pointer;
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.choix {
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  font-weight: 400;
  padding: 8px 12px;
  background: var(--ground);
  color: var(--muted);
  border: 1px solid var(--line);
}

.lien {
  background: none;
  color: var(--dom);
  font-weight: 400;
  font-size: 0.84rem;
  padding: 4px 0;
  text-decoration: underline;
}

.lien.danger {
  color: var(--eta);
}

.note {
  margin: 14px 0 0;
  font-size: 0.84rem;
  color: var(--muted);
}

.alerte,
.succes {
  font-size: 0.9rem;
  padding: 12px 14px;
  margin-bottom: 18px;
  background: var(--eta-soft);
  border-left: 3px solid var(--eta);
  color: var(--ink);
}

.succes {
  background: var(--dom-soft);
  border-left-color: var(--dom);
}
</style>
