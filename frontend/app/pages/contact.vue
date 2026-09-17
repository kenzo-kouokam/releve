<script setup lang="ts">
import { messageContactSchema, SUJETS_CONTACT, type SujetContact } from '@releve/shared';
import { COORDONNEES } from '~/data/vitrine';

useHead({
  title: 'Contact — Relève',
  meta: [
    {
      name: 'description',
      content:
        "Une question sur une mission, un dossier candidat ou un contrat : écrivez à l'agence Relève.",
    },
  ],
});

const { requete } = useApi();

const form = reactive({
  prenom: '',
  nom: '',
  email: '',
  sujet: SUJETS_CONTACT[0] as SujetContact,
  message: '',
  // Piege a robots : invisible a l'ecran, jamais rempli par une personne.
  siteWeb: '',
});

const erreurs = ref<Record<string, string>>({});
const erreurGenerale = ref('');
const envoi = ref(false);
const envoye = ref(false);

/**
 * Le message part vraiment : l'API le relaie a la boite de l'agence.
 *
 * Il ouvrait jusqu'ici le logiciel de messagerie avec un `mailto:` pre-rempli,
 * faute de route cote serveur. C'etait honnete tant que rien n'existait, mais
 * cela demandait a la personne de finir l'envoi elle-meme, et ne faisait rien
 * du tout chez qui n'a pas de client de messagerie configure — un bouton qui
 * ne repond pas, sans message d'erreur.
 *
 * La saisie est verifiee avec le meme schema que l'API : ce qui passe ici
 * passe la-bas, et les phrases d'erreur sont ecrites une seule fois.
 */
async function soumettre(): Promise<void> {
  erreurs.value = {};
  erreurGenerale.value = '';

  const verifie = messageContactSchema.safeParse({ ...form });

  if (!verifie.success) {
    for (const souci of verifie.error.issues) {
      erreurs.value[String(souci.path.at(-1))] = souci.message;
    }

    return;
  }

  envoi.value = true;

  try {
    await requete('/contact', { method: 'POST', body: verifie.data });
    envoye.value = true;
  } catch (cause) {
    const erreur = cause as { statusCode?: number; data?: { message?: string } };

    erreurGenerale.value =
      erreur.statusCode === 429
        ? 'Trop de messages envoyés coup sur coup. Réessayez dans quelques minutes.'
        : (erreur.data?.message ??
          "Envoi impossible pour le moment. Réessayez dans un instant, ou écrivez directement à l'agence.");
  } finally {
    envoi.value = false;
  }
}
</script>

<template>
  <main class="vitrine contact">
    <div>
      <p class="vitrine-accroche">Contact</p>
      <h1 class="vitrine-titre">Parlons de votre recherche</h1>
      <p class="chapeau">
        Une question sur une mission, sur votre dossier ou sur un contrat ? Écrivez-nous, nous
        répondons sous 24 heures ouvrées.
      </p>

      <div class="coordonnees">
        <div v-for="coordonnee in COORDONNEES" :key="coordonnee.libelle" class="coordonnee">
          <p class="libelle">{{ coordonnee.libelle }}</p>
          <p class="valeur">
            <a :href="`mailto:${coordonnee.valeur}`">{{ coordonnee.valeur }}</a>
          </p>
        </div>
      </div>

    </div>

    <!-- Après envoi, le formulaire cède la place à l'accusé de réception :
         le laisser affiché inviterait à renvoyer le même message. -->
    <div v-if="envoye" class="accuse">
      <p class="pastille" aria-hidden="true">✓</p>
      <h2>Message envoyé</h2>
      <p>
        L'agence l'a reçu et répondra à <strong>{{ form.email }}</strong> sous 24 heures ouvrées.
      </p>
      <button type="button" class="second" @click="envoye = false">Écrire un autre message</button>
    </div>

    <form v-else class="formulaire" @submit.prevent="soumettre()">
      <div class="paire">
        <label>
          <span>Prénom</span>
          <input id="prenom" v-model="form.prenom" type="text" autocomplete="given-name" />
          <em v-if="erreurs.prenom">{{ erreurs.prenom }}</em>
        </label>

        <label>
          <span>Nom</span>
          <input id="nom" v-model="form.nom" type="text" autocomplete="family-name" />
          <em v-if="erreurs.nom">{{ erreurs.nom }}</em>
        </label>
      </div>

      <label>
        <span>Adresse mail</span>
        <input id="email" v-model="form.email" type="email" autocomplete="email" />
        <em v-if="erreurs.email">{{ erreurs.email }}</em>
      </label>

      <label>
        <span>Sujet</span>
        <select id="sujet" v-model="form.sujet">
          <option v-for="option in SUJETS_CONTACT" :key="option" :value="option">
            {{ option }}
          </option>
        </select>
      </label>

      <label>
        <span>Votre message</span>
        <textarea
          id="message"
          v-model="form.message"
          rows="5"
          placeholder="Décrivez votre demande"
        />
        <em v-if="erreurs.message">{{ erreurs.message }}</em>
      </label>

      <!-- Piège à robots. `aria-hidden` et `tabindex` le retirent du parcours
           clavier et du lecteur d'écran : il n'existe que pour les programmes
           qui remplissent tous les champs d'un formulaire. -->
      <label class="piege" aria-hidden="true">
        <span>Site web</span>
        <input id="site-web" v-model="form.siteWeb" type="text" tabindex="-1" autocomplete="off" />
      </label>

      <p v-if="erreurGenerale" class="erreur" role="alert">{{ erreurGenerale }}</p>

      <button type="submit" class="envoyer" :disabled="envoi">
        {{ envoi ? 'Envoi...' : 'Envoyer' }}
      </button>

      <p class="note">
        Votre message part à l'agence par courriel. Nous n'en gardons aucune copie sur ce site, et
        votre adresse ne sert qu'à vous répondre.
      </p>
    </form>
  </main>
</template>

<style scoped>
.contact {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr);
  gap: 48px;
  align-items: start;
  max-width: 1100px;
}

.chapeau {
  margin: 0 0 32px;
  font-size: 17px;
  line-height: 1.65;
  color: var(--muted);
}

.coordonnees {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.coordonnee {
  padding: 18px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 14px;
}

.libelle {
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--muted);
}

.valeur {
  margin: 0;
  font-size: 15.5px;
  font-weight: 600;
}

.valeur a {
  color: inherit;
  text-decoration: none;
}

.valeur a:hover {
  color: var(--dom);
}

/* ---------- Accusé de réception ---------- */

.accuse {
  display: grid;
  gap: 12px;
  justify-items: start;
  padding: 32px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 22px;
}

.pastille {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: var(--surface);
  background: var(--dom);
  border-radius: 50%;
}

.accuse h2 {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.accuse p {
  max-width: 44ch;
  margin: 0;
  font-size: 15px;
  line-height: 1.65;
  color: var(--muted);
}

.second {
  padding: 12px 20px;
  margin-top: 8px;
  font-family: var(--sans);
  font-size: 14.5px;
  font-weight: 600;
  color: var(--dom);
  background: var(--surface);
  border: 1px solid var(--line-forte);
  border-radius: 11px;
  cursor: pointer;
}

.second:hover {
  border-color: var(--dom);
}

.second:focus-visible {
  outline: 2px solid var(--dom);
  outline-offset: 2px;
}

/* ---------- Formulaire ---------- */

.formulaire {
  display: grid;
  gap: 16px;
  padding: 32px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 22px;
}

.paire {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

label {
  display: flex;
  flex-direction: column;
  gap: 7px;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--muted);
}

input,
select,
textarea {
  width: 100%;
  padding: 13px 15px;
  font-family: var(--sans);
  font-size: 15px;
  font-weight: 400;
  color: var(--ink);
  background: var(--ground);
  border: 1px solid var(--line);
  border-radius: 11px;
}

textarea {
  line-height: 1.6;
  resize: vertical;
}

input:focus-visible,
select:focus-visible,
textarea:focus-visible {
  outline: 2px solid var(--dom);
  outline-offset: 2px;
}

label em {
  font-size: 13px;
  font-style: normal;
  font-weight: 500;
  color: var(--eta);
}

/* Le piège reste dans le flux du document mais hors de l'écran : `display:none`
   est ce que le moindre robot détecte en premier. */
.piege {
  position: absolute;
  left: -9999px;
  width: 1px;
  height: 1px;
  overflow: hidden;
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

.envoyer {
  padding: 15px;
  font-family: var(--sans);
  font-size: 15.5px;
  font-weight: 600;
  color: var(--surface);
  text-align: center;
  text-decoration: none;
  background: var(--dom);
  border: 0;
  border-radius: 12px;
  cursor: pointer;
}

.envoyer:hover:not(:disabled) {
  color: var(--surface);
  background: var(--dom-fonce);
}

.envoyer:disabled {
  opacity: 0.6;
  cursor: progress;
}

.envoyer:focus-visible {
  outline: 2px solid var(--dom);
  outline-offset: 3px;
}

.note {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--muted);
}

@media (max-width: 860px) {
  .contact {
    grid-template-columns: minmax(0, 1fr);
    gap: 36px;
  }
}

@media (max-width: 560px) {
  .formulaire {
    padding: 22px;
  }

  .paire {
    grid-template-columns: 1fr;
  }
}
</style>
