<script setup lang="ts">
import type { DecisionConservation, DossierEnAttente } from '@releve/shared';

useHead({
  title: 'Conservation de vos pièces — Relève',
  // Une page qui n'a de sens qu'avec un jeton n'a rien a faire dans un index.
  meta: [{ name: 'robots', content: 'noindex' }],
});

const route = useRoute();
const { requete } = useApi();

const jeton = computed(() => String(route.query.jeton ?? ''));

/**
 * Le dossier est lu, jamais decide, au chargement.
 *
 * L'API ne consomme pas le jeton pour cet appel : un client de messagerie qui
 * precharge les liens brulerait sinon la decision de quelqu'un qui n'a encore
 * rien lu. La decision, elle, part en POST — qu'aucun prefetch n'emet.
 */
const { data: dossier, error } = await useAsyncData('conservation', () => {
  if (!jeton.value) {
    return Promise.resolve(null);
  }

  return requete<DossierEnAttente>('/conservation', { query: { jeton: jeton.value } });
});

type Etat = 'choix' | 'conserve' | 'efface';

const etat = ref<Etat>('choix');
const enCours = ref<DecisionConservation | ''>('');
const echec = ref('');

const echeance = computed(() =>
  dossier.value ? dateComplete(dossier.value.effacementLe) : '',
);

async function repondre(decision: DecisionConservation): Promise<void> {
  echec.value = '';
  enCours.value = decision;

  try {
    await requete('/conservation', { method: 'POST', body: { jeton: jeton.value, decision } });
    etat.value = decision === 'CONSERVER' ? 'conserve' : 'efface';
  } catch (cause) {
    const corps = (cause as { data?: { message?: string } }).data;
    echec.value =
      corps?.message ?? 'Ce lien est expiré ou a déjà servi. Écrivez-nous et nous reprendrons cela.';
  } finally {
    enCours.value = '';
  }
}
</script>

<template>
  <section class="conservation">
    <template v-if="etat === 'choix'">
      <template v-if="dossier">
        <p class="accroche">Vos pièces justificatives</p>
        <h1>
          {{ dossier.prenom ? `${dossier.prenom}, souhaitez-vous` : 'Souhaitez-vous' }} que nous
          gardions vos documents&nbsp;?
        </h1>

        <p class="intro">
          Les pièces ci-dessous ont été déposées il y a un an. Passé ce délai, nous ne les gardons
          pas sans vous le redemander.
        </p>

        <ul class="pieces">
          <li v-for="piece in dossier.pieces" :key="piece">{{ piece }}</li>
        </ul>

        <p class="delai">
          Sans réponse de votre part avant le <strong>{{ echeance }}</strong
          >, elles seront effacées.
        </p>

        <p v-if="echec" class="erreur" role="alert">{{ echec }}</p>

        <div class="choix">
          <button
            type="button"
            class="principal"
            :disabled="!!enCours"
            @click="repondre('CONSERVER')"
          >
            {{ enCours === 'CONSERVER' ? 'Enregistrement...' : 'Gardez-les un an de plus' }}
          </button>

          <button type="button" class="second" :disabled="!!enCours" @click="repondre('EFFACER')">
            {{ enCours === 'EFFACER' ? 'Effacement...' : 'Effacez-les maintenant' }}
          </button>
        </div>

        <p class="note">
          Vous pouvez redéposer vos pièces à tout moment depuis votre profil. Nous ne conservons
          rien d'autre de ces fichiers.
        </p>
      </template>

      <template v-else>
        <h1>Lien inutilisable</h1>
        <p class="intro">
          <template v-if="!jeton">
            Ce lien est incomplet. Copiez-le en entier depuis votre courriel.
          </template>
          <template v-else-if="error">
            Ce lien est expiré, a déjà servi, ou vos pièces ont déjà été traitées.
          </template>
        </p>
        <p class="note">
          Vos pièces restent consultables depuis votre profil, une fois connecté.
          <NuxtLink to="/connexion">Se connecter</NuxtLink>
        </p>
      </template>
    </template>

    <template v-else-if="etat === 'conserve'">
      <p class="accroche">C'est noté</p>
      <h1>Vos pièces restent en place</h1>
      <p class="intro">
        Nous les conservons un an de plus. Vous recevrez un nouveau message à cette échéance, et
        vous pouvez les retirer d'ici là depuis votre profil.
      </p>
      <NuxtLink class="principal" to="/connexion">Accéder à mon profil</NuxtLink>
    </template>

    <template v-else>
      <p class="accroche">C'est fait</p>
      <h1>Vos pièces ont été effacées</h1>
      <p class="intro">
        Les fichiers ont été supprimés de nos serveurs. Votre compte et votre dossier restent
        ouverts&nbsp;: vous pourrez déposer de nouvelles pièces quand vous le souhaiterez.
      </p>
      <NuxtLink class="principal" to="/connexion">Accéder à mon profil</NuxtLink>
    </template>
  </section>
</template>

<style scoped>
.conservation {
  max-width: 620px;
  padding-block: 56px 72px;
  margin: 0 auto;
}

.accroche {
  margin: 0 0 8px;
  font-size: 12.5px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--dom);
}

h1 {
  margin: 0 0 14px;
  font-size: clamp(26px, 5vw, 34px);
  font-weight: 700;
  line-height: 1.15;
  letter-spacing: -0.03em;
  text-wrap: balance;
}

.intro {
  margin: 0 0 26px;
  font-size: 16px;
  line-height: 1.65;
  color: var(--muted);
}

.pieces {
  display: grid;
  gap: 1px;
  padding: 0;
  margin: 0 0 22px;
  list-style: none;
  background: var(--line);
  border: 1px solid var(--line);
  border-radius: 16px;
  overflow: hidden;
}

.pieces li {
  padding: 15px 20px;
  font-size: 15.5px;
  font-weight: 600;
  background: var(--surface);
}

.delai {
  padding: 15px 18px;
  margin: 0 0 24px;
  font-size: 14.5px;
  line-height: 1.6;
  color: var(--ambre-encre);
  background: var(--ambre);
  border: 1px solid var(--ambre-line);
  border-radius: 13px;
}

.erreur {
  padding: 13px 15px;
  margin: 0 0 20px;
  font-size: 14px;
  color: var(--eta);
  background: var(--eta-soft);
  border: 1px solid var(--eta-line);
  border-radius: 12px;
}

.choix {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 26px;
}

.principal,
.second {
  padding: 14px 24px;
  font-family: var(--sans);
  font-size: 15px;
  font-weight: 600;
  text-decoration: none;
  border-radius: 12px;
  cursor: pointer;
}

.principal {
  color: var(--surface);
  background: var(--dom);
  border: 1px solid var(--dom);
}

.principal:hover:not(:disabled) {
  background: var(--dom-fonce);
  border-color: var(--dom-fonce);
}

/* L'effacement est irreversible : il reste atteignable, sans etre le geste que
   la page pousse a faire. */
.second {
  color: var(--muted);
  background: var(--surface);
  border: 1px solid var(--line-forte);
}

.second:hover:not(:disabled) {
  color: var(--eta);
  border-color: var(--eta);
}

.principal:disabled,
.second:disabled {
  opacity: 0.55;
  cursor: progress;
}

.principal:focus-visible,
.second:focus-visible {
  outline: 2px solid var(--dom);
  outline-offset: 2px;
}

.note {
  margin: 0;
  font-size: 13.5px;
  line-height: 1.6;
  color: var(--muted);
}

.note a {
  font-weight: 600;
  color: var(--dom);
}

@media (max-width: 560px) {
  .conservation {
    padding-block: 36px 56px;
  }

  .choix {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
