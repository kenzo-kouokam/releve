<script setup lang="ts">
import type {
  ClassementArchiveResume,
  ClassementMission,
  MissionDetail,
  PropositionResume,
} from '@releve/shared';

/**
 * Le classement d'un besoin, et la trace de ce qu'on en a fait.
 *
 * Trois choses sur un seul écran, et elles vont ensemble : qui est retenu avec
 * le détail de son score, qui est écarté et par quel filtre, et l'historique de
 * ce qui a déjà été proposé. Les séparer obligerait à naviguer entre la
 * décision et ce qui la motive.
 *
 * Le classement affiché est **recalculé** à chaque visite : il reflète les
 * fiches d'aujourd'hui. L'historique, lui, est figé — c'est la différence que la
 * page doit rendre lisible, et le bandeau du journal le dit en toutes lettres.
 */
const route = useRoute();
const { requete } = useApi();

const identifiant = computed(() => String(route.params.id));

const { data: mission } = await useAsyncData<MissionDetail>(
  () => `besoin:${identifiant.value}`,
  () => requete<MissionDetail>(`/missions/${identifiant.value}`),
);

if (!mission.value) {
  throw createError({ statusCode: 404, statusMessage: 'Besoin introuvable', fatal: true });
}

const { data: classement, refresh: rafraichirClassement } =
  await useAsyncData<ClassementMission>(
    () => `classement:${identifiant.value}`,
    () =>
      requete<ClassementMission>(`/missions/${identifiant.value}/candidats`, {
        query: { ecartes: true, limite: 50 },
      }),
  );

const { data: journal, refresh: rafraichirJournal } = await useAsyncData<
  ClassementArchiveResume[]
>(
  () => `classements:${identifiant.value}`,
  () => requete<ClassementArchiveResume[]>(`/missions/${identifiant.value}/classements`),
);

useHead({ title: () => `${mission.value?.reference ?? 'Besoin'} - Relève` });

const retenus = computed(() => classement.value?.retenus ?? []);
const ecartes = computed(() => classement.value?.ecartes ?? []);

/** Regroupe les écartés par filtre : c'est ce qui dit où agir. */
const parMotif = computed(() => {
  const table = new Map<string, { libelle: string; noms: string[] }>();

  for (const ligne of ecartes.value) {
    for (const motif of ligne.motifs) {
      const entree = table.get(motif.cle) ?? { libelle: motif.libelle, noms: [] };

      entree.noms.push(`${ligne.candidat.prenom} ${ligne.candidat.nom}`);
      table.set(motif.cle, entree);
    }
  }

  return [...table].sort((a, b) => b[1].noms.length - a[1].noms.length);
});

const selection = ref<string[]>([]);
const envoi = ref(false);
const message = ref('');
const erreur = ref('');

function basculer(candidatId: string): void {
  selection.value = selection.value.includes(candidatId)
    ? selection.value.filter((id) => id !== candidatId)
    : [...selection.value, candidatId];
}

/**
 * Envoyer les propositions, et archiver le classement dans le même geste.
 *
 * L'archivage est fait côté serveur : il ne dépend pas de cet écran, et un
 * appel direct à l'API laisse la même trace.
 */
async function proposer(): Promise<void> {
  erreur.value = '';
  message.value = '';
  envoi.value = true;

  try {
    const creees = await requete<PropositionResume[]>(
      `/missions/${identifiant.value}/propositions`,
      { method: 'POST', body: { candidatIds: selection.value } },
    );

    message.value =
      creees.length === 0
        ? 'Ces candidats avaient déjà reçu une proposition.'
        : `${creees.length} proposition${creees.length > 1 ? 's' : ''} envoyée${creees.length > 1 ? 's' : ''}.`;
    selection.value = [];

    await Promise.all([rafraichirClassement(), rafraichirJournal()]);
  } catch (cause) {
    const corps = (cause as { data?: { message?: string } }).data;

    erreur.value = corps?.message ?? 'Proposition impossible pour le moment.';
  } finally {
    envoi.value = false;
  }
}

function horodatage(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    dateStyle: 'long',
    timeStyle: 'short',
  });
}
</script>

<template>
  <section v-if="mission" class="besoin">
    <NuxtLink to="/besoins" class="retour">← Tous les besoins</NuxtLink>

    <header class="tete">
      <div>
        <p class="reference">{{ mission.reference }}</p>
        <h1>{{ mission.client.raisonSociale }}</h1>
        <p class="lieu">{{ mission.lieu.libelle }} · {{ mission.adresse }}</p>
      </div>

      <dl class="essentiel">
        <div><dt>Date</dt><dd>{{ mission.dateDebut }}</dd></div>
        <div><dt>Horaires</dt><dd>{{ mission.heureDebut }}–{{ mission.heureFin }}</dd></div>
        <div><dt>Diplôme</dt><dd>{{ mission.qualificationRequise.code }}</dd></div>
        <div><dt>Statut</dt><dd>{{ mission.statut }}</dd></div>
      </dl>
    </header>

    <p v-if="message" class="confirme" role="status">{{ message }}</p>
    <p v-if="erreur" class="refus" role="alert">{{ erreur }}</p>

    <!-- ----------------------------------------------------------- retenus -->
    <section class="bloc">
      <h2>Profils retenus <span class="compte">{{ retenus.length }}</span></h2>
      <p class="aide">
        Classés par score. Chaque composante porte l'explication de ce qui a été mesuré — c'est ce
        qu'on doit pouvoir dire à un candidat qui demande pourquoi il est troisième.
      </p>

      <p v-if="!retenus.length" class="vide">
        Aucun profil éligible. Le détail des filtres qui écartent est juste en dessous.
      </p>

      <ul v-else class="profils">
        <li v-for="ligne in retenus" :key="ligne.candidat.id" class="profil">
          <label class="choix">
            <input
              type="checkbox"
              :checked="selection.includes(ligne.candidat.id)"
              :disabled="ligne.dejaPropose || envoi"
              @change="basculer(ligne.candidat.id)"
            >
            <span class="visuel" />
          </label>

          <div class="qui">
            <p class="nom">
              {{ ligne.candidat.prenom }} {{ ligne.candidat.nom }}
              <span v-if="ligne.dejaPropose" class="deja">déjà proposé</span>
            </p>
            <p class="meta">
              {{ ligne.candidat.qualification ?? 'sans diplôme rattaché' }}
              <template v-if="ligne.distanceKm !== null"> · {{ ligne.distanceKm }} km</template>
            </p>

            <ul class="composantes">
              <li v-for="c in ligne.score.composantes" :key="c.cle">
                <span class="cle">{{ c.libelle }}</span>
                <span class="points">{{ c.points }}/{{ c.sur }}</span>
                <span class="explication">{{ c.explication }}</span>
              </li>
            </ul>
          </div>

          <p class="total">{{ ligne.score.total }}<span>/100</span></p>
        </li>
      </ul>

      <div v-if="retenus.length" class="envoi">
        <p class="selection">
          {{ selection.length }} sélectionné{{ selection.length > 1 ? 's' : '' }}
        </p>
        <button type="button" :disabled="!selection.length || envoi" @click="proposer()">
          {{ envoi ? 'Envoi…' : 'Proposer à l’établissement' }}
        </button>
      </div>
    </section>

    <!-- ----------------------------------------------------------- écartés -->
    <section class="bloc">
      <h2>Profils écartés <span class="compte">{{ ecartes.length }}</span></h2>
      <p class="aide">
        Regroupés par filtre, du plus fréquent au moins fréquent : c'est ce qui dit où agir. Un
        diplôme à vérifier se corrige en une minute, un rayon trop court ne se corrige pas.
      </p>

      <p v-if="!ecartes.length" class="vide">Aucun profil écarté.</p>

      <ul v-else class="motifs">
        <li v-for="[cle, groupe] in parMotif" :key="cle">
          <p class="libelle-motif">
            {{ groupe.libelle }} <span class="compte">{{ groupe.noms.length }}</span>
          </p>
          <p class="noms">{{ groupe.noms.join(', ') }}</p>
        </li>
      </ul>
    </section>

    <!-- ----------------------------------------------------------- journal -->
    <section class="bloc">
      <h2>Journal des classements <span class="compte">{{ (journal ?? []).length }}</span></h2>
      <p class="aide">
        Écrit au moment où une proposition part, et jamais recalculé. Le classement ci-dessus
        reflète les fiches <strong>d'aujourd'hui</strong> ; celui-ci dit ce qu'on avait sous les
        yeux ce jour-là. Un diplôme vérifié depuis ne réécrit pas l'histoire.
      </p>

      <p v-if="!(journal ?? []).length" class="vide">
        Aucune proposition n'est encore partie sur ce besoin.
      </p>

      <ol v-else class="archives">
        <li v-for="archive in journal" :key="archive.id">
          <header class="entete-archive">
            <p class="quand">{{ horodatage(archive.creeLe) }}</p>
            <p class="par">par {{ archive.auteurEmail }}</p>
          </header>

          <p class="resume-archive">
            {{ archive.proposesIds.length }} proposé{{ archive.proposesIds.length > 1 ? 's' : '' }}
            sur {{ archive.retenus.length }} retenu{{ archive.retenus.length > 1 ? 's' : '' }},
            {{ archive.ecartes.length }} écarté{{ archive.ecartes.length > 1 ? 's' : '' }}
          </p>

          <details>
            <summary>Voir le détail figé</summary>

            <p class="sous-titre">Retenus</p>
            <ul class="fige">
              <li v-for="r in archive.retenus" :key="r.candidatId">
                <span :class="{ propose: archive.proposesIds.includes(r.candidatId) }">
                  {{ r.prenom }} {{ r.nom }}
                </span>
                <span class="points">{{ r.score }}/100</span>
                <span class="explication">
                  {{ r.detail.composantes.map((c) => `${c.libelle} ${c.points}/${c.sur}`).join(' · ') }}
                </span>
              </li>
            </ul>

            <template v-if="archive.ecartes.length">
              <p class="sous-titre">Écartés</p>
              <ul class="fige sans-score">
                <li v-for="e in archive.ecartes" :key="e.candidatId">
                  <span>{{ e.prenom }} {{ e.nom }}</span>
                  <span class="explication">{{ e.motifs.map((m) => m.libelle).join(' · ') }}</span>
                </li>
              </ul>
            </template>
          </details>
        </li>
      </ol>
    </section>
  </section>
</template>

<style scoped>
.besoin {
  display: grid;
  gap: 20px;
}

.retour {
  font-size: 0.85rem;
  color: var(--dom-encre);
}

.tete {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  align-items: flex-start;
  justify-content: space-between;
  padding: 20px 22px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 14px;
}

.reference {
  margin: 0;
  font-family: var(--mono);
  font-size: 0.78rem;
  color: var(--muted);
}

h1 {
  margin: 2px 0 0;
  font-size: 1.4rem;
}

.lieu {
  margin: 4px 0 0;
  font-size: 0.9rem;
  color: var(--muted);
}

.essentiel {
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
  margin: 0;
}

.essentiel dt {
  font-family: var(--mono);
  font-size: 0.64rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}

.essentiel dd {
  margin: 2px 0 0;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.bloc {
  padding: 20px 22px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 14px;
}

h2 {
  margin: 0;
  font-size: 1.05rem;
}

.compte {
  font-family: var(--mono);
  font-size: 0.78rem;
  font-weight: 400;
  color: var(--muted);
}

.aide {
  max-width: 76ch;
  margin: 6px 0 16px;
  font-size: 0.85rem;
  line-height: 1.55;
  color: var(--muted);
}

.profils,
.motifs,
.archives,
.fige {
  display: grid;
  gap: 2px;
  padding: 0;
  margin: 0;
  list-style: none;
  background: var(--line);
  border: 1px solid var(--line);
  border-radius: 10px;
  overflow: hidden;
}

.profil {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 14px;
  align-items: start;
  padding: 14px 16px;
  background: var(--surface);
}

.choix input {
  width: 18px;
  height: 18px;
  margin: 0;
}

.choix .visuel {
  display: none;
}

.nom {
  margin: 0;
  font-weight: 600;
}

.deja {
  margin-left: 8px;
  padding: 2px 7px;
  font-family: var(--mono);
  font-size: 0.62rem;
  text-transform: uppercase;
  color: var(--muted);
  background: var(--ground);
  border-radius: 999px;
}

.meta {
  margin: 2px 0 8px;
  font-size: 0.85rem;
  color: var(--muted);
}

.composantes {
  display: grid;
  gap: 3px;
  padding: 0;
  margin: 0;
  list-style: none;
}

.composantes li {
  display: grid;
  grid-template-columns: 110px 60px 1fr;
  gap: 10px;
  font-size: 0.8rem;
  color: var(--muted);
}

.cle {
  font-weight: 600;
  color: var(--ink);
}

.points {
  font-family: var(--mono);
  font-variant-numeric: tabular-nums;
}

.total {
  margin: 0;
  font-family: var(--mono);
  font-size: 1.5rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.total span {
  font-size: 0.8rem;
  color: var(--muted);
}

.envoi {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: flex-end;
  margin-top: 14px;
}

.selection {
  margin: 0;
  font-size: 0.85rem;
  color: var(--muted);
}

.libelle-motif,
.noms {
  margin: 0;
}

.motifs li {
  padding: 12px 16px;
  background: var(--surface);
}

.libelle-motif {
  font-weight: 600;
}

.noms {
  margin-top: 3px;
  font-size: 0.85rem;
  color: var(--muted);
}

.archives li {
  padding: 14px 16px;
  background: var(--surface);
}

.entete-archive {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  align-items: baseline;
}

.quand {
  margin: 0;
  font-weight: 600;
}

.par,
.resume-archive {
  margin: 0;
  font-size: 0.85rem;
  color: var(--muted);
}

.resume-archive {
  margin-top: 4px;
}

details {
  margin-top: 8px;
}

summary {
  font-size: 0.85rem;
  color: var(--dom-encre);
  cursor: pointer;
}

.sous-titre {
  margin: 12px 0 4px;
  font-family: var(--mono);
  font-size: 0.64rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}

.fige li {
  display: grid;
  grid-template-columns: minmax(140px, 180px) 70px minmax(0, 1fr);
  gap: 10px;
  padding: 7px 12px;
  font-size: 0.8rem;
  line-height: 1.5;
  color: var(--muted);
  background: var(--ground);
}

/* Les ecartes n'ont pas de score : sans cette regle, leurs motifs tombaient
 * dans la colonne de 70 px prevue pour les points, et se lisaient a deux mots
 * par ligne. */
.fige.sans-score li {
  grid-template-columns: minmax(140px, 180px) minmax(0, 1fr);
}

.fige .propose {
  font-weight: 600;
  color: var(--dom-encre);
}

.confirme,
.refus {
  margin: 0;
  padding: 11px 14px;
  font-size: 0.9rem;
  border-radius: 10px;
}

.confirme {
  color: var(--dom-encre);
  background: var(--dom-soft);
}

.refus {
  color: var(--eta);
  background: var(--eta-soft);
}

.vide {
  margin: 0;
  font-size: 0.9rem;
  color: var(--muted);
}

@media (max-width: 720px) {
  .profil {
    grid-template-columns: auto 1fr;
  }

  .total {
    grid-column: 2;
  }

  .composantes li,
  .fige li {
    grid-template-columns: 1fr;
    gap: 1px;
  }
}
</style>
