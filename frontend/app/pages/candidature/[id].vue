<script setup lang="ts">
import type { MissionDetail } from '@releve/shared';

const route = useRoute();
const { requete } = useApi();

const identifiant = String(route.params.id);

const { data: donnees } = await useAsyncData(`mission:${identifiant}`, () =>
  requete<MissionDetail>(`/missions/${identifiant}`),
);

if (!donnees.value) {
  throw createError({ statusCode: 404, statusMessage: 'Mission introuvable', fatal: true });
}

const mission = computed(() =>
  donnees.value ? { etablissement: { nom: donnees.value.client.raisonSociale } } : undefined,
);

useHead({ title: 'Candidature envoyee - Relève' });

/**
 * Le Figma fige l'heure d'envoi a 09:42. On l'affiche apres le montage :
 * l'inscrire dans le rendu serveur ferait diverger l'hydratation, et une heure
 * fausse sur un accuse de reception se remarque.
 */
const heure = ref('');

onMounted(() => {
  heure.value = new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date());
});
</script>

<template>
  <section v-if="mission" class="confirmation">
    <span class="marque"><AppIcon nom="check-circle" :taille="42" /></span>

    <h1>Candidature envoyee !</h1>
    <p class="intro">
      {{ mission.etablissement.nom }} a recu votre profil. Vous serez prevenu&middot;e des qu'une
      reponse sera disponible.
    </p>

    <AppCarte class="suivi">
      <ol class="etapes">
        <li class="etape">
          <span class="puce faite" />
          <div>
            <p class="titre">Candidature transmise</p>
            <p class="moment">{{ heure ? `Aujourd'hui, ${heure}` : "A l'instant" }}</p>
          </div>
        </li>
        <li class="etape attente">
          <span class="puce" />
          <div>
            <p class="titre">Reponse de l'etablissement</p>
            <p class="moment">En attente</p>
          </div>
        </li>
      </ol>
    </AppCarte>

    <div class="actions">
      <AppBouton to="/suivi">Suivre ma candidature</AppBouton>
      <AppBouton variante="secondaire" to="/missions">Voir d'autres missions</AppBouton>
    </div>
  </section>
</template>

<style scoped>
.confirmation {
  max-width: 480px;
  margin: 0 auto;
  padding-block: 56px 0;
  text-align: center;
}

.marque {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 92px;
  height: 92px;
  color: var(--dom);
  background: var(--dom-soft);
  border-radius: 999px;
}

h1 {
  margin: 22px 0 10px;
  font-size: 28px;
  font-weight: 400;
}

.intro {
  margin: 0 0 22px;
  font-size: 14px;
  line-height: 1.5;
  color: var(--muted);
}

.suivi {
  padding: 18px;
  text-align: left;
}

.etapes {
  display: grid;
  gap: 16px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.etape {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

/* Le design marque les deux etats par un rond plein et un rond vide. */
.puce {
  flex: none;
  width: 12px;
  height: 12px;
  margin-top: 3px;
  border: 2px solid var(--line);
  border-radius: 999px;
}

.puce.faite {
  background: var(--dom);
  border-color: var(--dom);
}

.titre {
  margin: 0 0 3px;
  font-size: 14px;
  font-weight: 700;
}

.attente .titre {
  font-weight: 400;
  color: var(--muted);
}

.moment {
  margin: 0;
  font-size: 11px;
  color: var(--muted);
}

.actions {
  display: grid;
  gap: 10px;
  margin-top: 22px;
}
</style>
