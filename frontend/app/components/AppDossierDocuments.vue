<script setup lang="ts">
import {
  DUREE_CONSERVATION_MOIS,
  EXTENSIONS_DOCUMENT,
  TAILLE_MAX_DOCUMENT,
  TYPES_MIME_DOCUMENT,
  type LigneDossier,
  type TypeDocument,
} from '@releve/shared';

/**
 * Le dossier de pieces justificatives.
 *
 * Affiche une ligne par piece attendue, remplie ou non : c'est le vide qui
 * informe, et une liste des seuls documents deposes ne dirait pas ce qui
 * manque.
 *
 * `base` decide de la porte empruntee — `/mon-profil` pour l'interesse,
 * `/candidats/:id` pour l'agence — et `lectureSeule` ferme le depot et le
 * retrait : l'agence lit pour verifier, elle ne depose ni ne retire a la place
 * de quelqu'un.
 */
const { base, lectureSeule = false } = defineProps<{ base: string; lectureSeule?: boolean }>();

const { requete, televerser } = useApi();

const { data: dossier, refresh } = await useAsyncData(`dossier:${base}`, () =>
  requete<LigneDossier[]>(`${base}/documents`),
);

const enCours = ref<TypeDocument | ''>('');
const erreur = ref('');

/**
 * Ouvre le selecteur de fichier de la ligne.
 *
 * Le champ est retrouve par son identifiant plutot que par une reference
 * stockee : ecrire dans un objet reactif au moment ou Vue pose les references
 * declenche un nouveau rendu, et la page part en boucle une fois hydratee.
 */
function ouvrirSelecteur(type: TypeDocument): void {
  erreur.value = '';
  document.querySelector<HTMLInputElement>(`#fichier-${type}`)?.click();
}

async function deposer(type: TypeDocument, evenement: Event): Promise<void> {
  const champ = evenement.target as HTMLInputElement;
  const fichier = champ.files?.[0];

  if (!fichier) return;

  erreur.value = '';

  // Controle local avant l'envoi : refuser 10 Mo apres les avoir televerses sur
  // une connexion mobile serait une perte de temps et de forfait. L'API refait
  // le meme controle, elle ne fait pas confiance a celui-ci.
  if (fichier.size > TAILLE_MAX_DOCUMENT) {
    erreur.value = `« ${fichier.name} » dépasse ${Math.round(TAILLE_MAX_DOCUMENT / 1024 / 1024)} Mo.`;
    champ.value = '';

    return;
  }

  if (!(TYPES_MIME_DOCUMENT as readonly string[]).includes(fichier.type)) {
    erreur.value = `« ${fichier.name} » n'est ni un PDF, ni une image JPEG ou PNG.`;
    champ.value = '';

    return;
  }

  enCours.value = type;

  try {
    await televerser(`${base}/documents/${type}`, fichier);
    await refresh();
    // La jauge de la barre laterale et celle du profil lisent la meme cle :
    // sans ce rafraichissement, elles resteraient sur l'etat d'avant le depot.
    await refreshNuxtData('mon-profil:completude');
  } catch (cause) {
    const corps = (cause as { data?: { message?: string } }).data;
    erreur.value = corps?.message ?? 'Dépôt impossible pour le moment.';
  } finally {
    enCours.value = '';
    champ.value = '';
  }
}

async function retirer(ligne: LigneDossier): Promise<void> {
  if (!ligne.document) return;

  erreur.value = '';
  enCours.value = ligne.type;

  try {
    await requete<LigneDossier[]>(`${base}/documents/${ligne.document.id}`, { method: 'DELETE' });
    await refresh();
    await refreshNuxtData('mon-profil:completude');
  } catch (cause) {
    const corps = (cause as { data?: { message?: string } }).data;
    erreur.value = corps?.message ?? 'Retrait impossible pour le moment.';
  } finally {
    enCours.value = '';
  }
}

function poids(octets: number): string {
  return octets < 1024 * 1024
    ? `${Math.max(1, Math.round(octets / 1024))} Ko`
    : `${(octets / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`;
}

const deposees = computed(() => (dossier.value ?? []).filter((ligne) => ligne.document).length);
</script>

<template>
  <section class="dossier">
    <div class="entete">
      <h2>Mon dossier</h2>
      <p class="compte">{{ deposees }} / {{ dossier?.length ?? 0 }} pièces déposées</p>
    </div>

    <p class="intro">
      PDF, JPEG ou PNG, {{ Math.round(TAILLE_MAX_DOCUMENT / 1024 / 1024) }} Mo au plus par fichier.
      Déposer à nouveau remplace la pièce précédente.
      <template v-if="!lectureSeule">
        Chaque pièce est conservée {{ DUREE_CONSERVATION_MOIS }} mois&nbsp;; passé ce délai, nous
        vous demandons par courriel si vous souhaitez que nous la gardions.
      </template>
    </p>

    <p v-if="erreur" class="erreur" role="alert">{{ erreur }}</p>

    <ul>
      <li v-for="ligne in dossier ?? []" :key="ligne.type" class="piece">
        <span class="pastille" :class="{ remplie: !!ligne.document }" aria-hidden="true">
          {{ ligne.document ? '✓' : '!' }}
        </span>

        <div class="copie">
          <p class="libelle">{{ ligne.libelle }}</p>

          <p v-if="ligne.document" class="etat">
            <a :href="`/bff${base}/documents/${ligne.document.id}/contenu`" download>
              {{ ligne.document.nomOrigine }}
            </a>
            · {{ poids(ligne.document.taille) }} ·
            <span v-if="ligne.document.verifieLe" class="verifie">Vérifiée par l'agence</span>
            <span v-else>En attente de vérification</span>
            <br />
            <span class="echeance">
              Conservée jusqu'au {{ dateComplete(ligne.document.conservationJusquAu) }}
            </span>
          </p>

          <p v-else class="motif">{{ ligne.motif }}</p>
        </div>

        <div v-if="!lectureSeule" class="actions">
          <input
            :id="`fichier-${ligne.type}`"
            type="file"
            class="sr-only"
            :accept="EXTENSIONS_DOCUMENT"
            @change="deposer(ligne.type, $event)"
          />

          <button
            type="button"
            class="action"
            :disabled="enCours === ligne.type"
            @click="ouvrirSelecteur(ligne.type)"
          >
            {{
              enCours === ligne.type ? 'Envoi...' : ligne.document ? 'Remplacer' : 'Charger un fichier'
            }}
          </button>

          <button
            v-if="ligne.document"
            type="button"
            class="action retirer"
            :disabled="enCours === ligne.type"
            @click="retirer(ligne)"
          >
            Retirer
          </button>
        </div>
      </li>
    </ul>

    <p class="avertissement">
      Ces pièces ne sont visibles que par vous et par l'agence. Elles ne sont jamais transmises aux
      établissements.
    </p>
  </section>
</template>

<style scoped>
.dossier {
  display: grid;
  gap: 14px;
  padding: 26px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 20px;
}

.entete {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  align-items: baseline;
  justify-content: space-between;
}

h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}

.compte {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--muted);
}

.intro {
  margin: 0;
  font-size: 14.5px;
  line-height: 1.6;
  color: var(--muted);
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

ul {
  display: grid;
  gap: 12px;
  padding: 0;
  margin: 0;
  list-style: none;
}

.piece {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 16px;
  align-items: center;
  padding: 18px 22px;
  background: var(--ground);
  border: 1px solid var(--line);
  border-radius: 16px;
}

.pastille {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  font-size: 15px;
  font-weight: 700;
  color: var(--dom);
  background: var(--surface-2);
  border-radius: 10px;
}

.pastille.remplie {
  color: var(--surface);
  background: var(--dom);
}

.copie {
  flex: 1;
  min-width: 180px;
}

.libelle {
  margin: 0;
  font-size: 15.5px;
  font-weight: 600;
}

.motif,
.etat {
  margin: 3px 0 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--muted);
}

.etat a {
  font-weight: 600;
  color: var(--dom);
}

.verifie {
  font-weight: 600;
  color: var(--dom);
}

/* Une ligne de plus, discrète : l'échéance se consulte, elle ne s'annonce pas.
   Le message qui compte part par courriel, pas par cet écran. */
.echeance {
  font-size: 12.5px;
}

.actions {
  display: flex;
  flex: none;
  flex-wrap: wrap;
  gap: 8px;
}

.action {
  padding: 9px 16px;
  font-family: var(--sans);
  font-size: 13px;
  font-weight: 600;
  color: var(--dom);
  background: var(--surface);
  border: 1px solid var(--line-forte);
  border-radius: 20px;
  cursor: pointer;
}

.action:hover:not(:disabled) {
  border-color: var(--dom);
}

.action:disabled {
  opacity: 0.55;
  cursor: progress;
}

.action:focus-visible {
  outline: 2px solid var(--dom);
  outline-offset: 2px;
}

.retirer {
  color: var(--muted);
}

.retirer:hover:not(:disabled) {
  color: var(--eta);
  border-color: var(--eta);
}

.avertissement {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--muted);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

@media (max-width: 560px) {
  .dossier {
    padding: 20px;
  }

  .piece {
    padding: 16px;
  }
}
</style>
