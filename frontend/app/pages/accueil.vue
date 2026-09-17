<script setup lang="ts">
import {
  ACCROCHE,
  CHIFFRES_CLES,
  DOSSIER,
  ETAPES,
  MISSIONS_EXEMPLE,
  PRISE_EN_CHARGE,
} from '~/data/vitrine';

useHead({
  title: "Relève — intérim de l'aide à domicile",
  meta: [
    {
      name: 'description',
      content:
        "Relève est l'agence d'intérim dédiée à l'aide à domicile : créez votre dossier candidat une fois, puis candidatez aux missions proches de chez vous.",
    },
  ],
});
</script>

<template>
  <div class="accueil">
    <section class="heros">
      <div class="promesse">
        <p class="vitrine-accroche">{{ ACCROCHE }}</p>
        <h1>Des missions d'aide à domicile près de vous, dès demain.</h1>
        <p class="chapeau">
          Relève est l'agence d'intérim dédiée à l'aide à domicile. Créez votre dossier candidat une
          fois, puis candidatez en un clic aux missions qui correspondent à votre secteur, à vos
          disponibilités et à vos diplômes.
        </p>

        <div class="actions">
          <NuxtLink to="/inscription/interimaire" class="vitrine-bouton">Créer mon dossier candidat</NuxtLink>
          <NuxtLink to="/fonctionnement" class="vitrine-bouton secondaire">
            Comment ça marche
          </NuxtLink>
        </div>

        <!-- Bloc vide tant que l'agence n'a pas fourni ses chiffres : voir le
             commentaire de CHIFFRES_CLES dans app/data/vitrine.ts. -->
        <div v-if="CHIFFRES_CLES.length" class="chiffres">
          <div v-for="chiffre in CHIFFRES_CLES" :key="chiffre.libelle">
            <p class="valeur">{{ chiffre.valeur }}</p>
            <p class="libelle">{{ chiffre.libelle }}</p>
          </div>
        </div>
      </div>

      <div class="apercu">
        <div class="entete-apercu">
          <p class="titre-apercu">Missions près de Lyon</p>
          <span class="etiquette">Exemple fictif</span>
        </div>

        <ul>
          <li v-for="mission in MISSIONS_EXEMPLE" :key="mission.nom">
            <span class="pastille">{{ mission.initiales }}</span>
            <span class="copie">
              <span class="nom">{{ mission.nom }}</span>
              <span class="lieu">{{ mission.lieu }}</span>
            </span>
            <span class="chiffrage">
              <span class="taux">{{ mission.taux }}</span>
              <span class="horaires">{{ mission.horaires }}</span>
            </span>
          </li>
        </ul>

        <p class="note-apercu">
          Les missions réelles sont visibles depuis votre espace, une fois votre compte créé.
        </p>
      </div>
    </section>

    <section class="etapes">
      <div class="dedans">
        <p class="vitrine-accroche">Comment ça marche</p>
        <h2>Trois étapes, un seul dossier</h2>

        <div class="grille-etapes">
          <div v-for="etape in ETAPES" :key="etape.n" class="etape">
            <span class="numero">{{ etape.n }}</span>
            <p class="titre-etape">{{ etape.titre }}</p>
            <p class="corps">{{ etape.corps }}</p>
          </div>
        </div>
      </div>
    </section>

    <section class="dossier">
      <div>
        <h2>Votre dossier candidat, constitué une seule fois</h2>
        <p class="texte">
          Ce que vous déclarez sert à toutes vos missions. Ce que l'agence vérifie sur pièce est ce
          qui vous rend éligible : la distinction est visible à chaque ligne de votre profil.
        </p>

        <ul class="lignes">
          <li v-for="ligne in DOSSIER" :key="ligne.libelle">
            <span class="puce" :class="{ verifiee: ligne.verifie }">{{
              ligne.verifie ? '✓' : '•'
            }}</span>
            <span class="libelle-ligne">{{ ligne.libelle }}</span>
            <span class="etat">{{ ligne.etat }}</span>
          </li>
        </ul>
      </div>

      <aside class="charge">
        <p class="titre-charge">Ce que Relève prend en charge</p>
        <ul>
          <li v-for="element in PRISE_EN_CHARGE" :key="element">
            <span class="coche">✓</span>
            <span>{{ element }}</span>
          </li>
        </ul>
      </aside>
    </section>

    <section class="appel">
      <div class="bloc-appel">
        <div class="copie-appel">
          <p class="accroche-claire">{{ ACCROCHE }}</p>
          <h2>Inscription en quelques minutes, candidature dès votre dossier vérifié.</h2>
          <p>
            Vous restez libre de vos horaires et de votre secteur. L'agence gère les déclarations,
            les contrats et les fiches de paie.
          </p>
        </div>

        <NuxtLink to="/inscription/interimaire" class="bouton-clair">Créer mon compte</NuxtLink>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* L'accueil deborde de la colonne de contenu du layout : ses bandes occupent
 * toute la largeur. D'ou les marges negatives, seule facon de sortir d'un
 * conteneur centre sans deplacer le conteneur lui-meme. */
.accueil > section {
  padding-inline: 28px;
}

.heros {
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr);
  gap: 56px;
  align-items: center;
  max-width: 1200px;
  margin: 0 auto;
  padding-block: 72px 56px;
}

h1 {
  margin: 0 0 20px;
  font-size: clamp(34px, 7vw, 58px);
  font-weight: 700;
  line-height: 1.04;
  letter-spacing: -0.035em;
  text-wrap: pretty;
}

.chapeau {
  max-width: 52ch;
  margin: 0 0 32px;
  font-size: 18px;
  line-height: 1.6;
  color: var(--muted);
  text-wrap: pretty;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.chiffres {
  display: flex;
  flex-wrap: wrap;
  gap: 40px;
  margin-top: 40px;
}

.chiffres .valeur {
  margin: 0;
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--dom);
}

.chiffres .libelle {
  margin: 2px 0 0;
  font-size: 13.5px;
  color: var(--muted);
}

/* ---------- Apercu ---------- */

.apercu {
  padding: 28px;
  color: var(--surface);
  background: var(--dom-fonce);
  border-radius: 24px;
}

.entete-apercu {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.titre-apercu {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.etiquette {
  padding: 5px 10px;
  font-size: 12px;
  background: rgb(255 255 255 / 14%);
  border-radius: 20px;
}

.apercu ul {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 0;
  margin: 0;
  list-style: none;
}

.apercu li {
  display: flex;
  gap: 14px;
  align-items: center;
  padding: 16px;
  color: var(--ink);
  background: var(--surface);
  border-radius: 16px;
}

.pastille {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  font-size: 13px;
  font-weight: 700;
  color: var(--dom);
  background: var(--surface-2);
  border-radius: 10px;
}

.copie {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.nom {
  overflow: hidden;
  font-size: 14.5px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lieu {
  font-size: 12.5px;
  color: var(--muted);
}

.chiffrage {
  display: flex;
  flex: none;
  flex-direction: column;
  text-align: right;
}

.taux {
  font-size: 14.5px;
  font-weight: 700;
  color: var(--dom);
}

.horaires {
  font-size: 12px;
  color: var(--muted);
}

.note-apercu {
  margin: 18px 0 0;
  font-size: 13px;
  line-height: 1.55;
  color: var(--dom-contraste);
}

/* ---------- Etapes ---------- */

.etapes {
  background: var(--surface);
  border-block: 1px solid var(--line);
}

.etapes .dedans {
  max-width: 1200px;
  margin: 0 auto;
  padding-block: 72px;
}

h2 {
  margin: 0 0 44px;
  font-size: clamp(26px, 4.5vw, 36px);
  font-weight: 700;
  line-height: 1.15;
  letter-spacing: -0.03em;
  text-wrap: pretty;
}

.grille-etapes {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 24px;
}

.etape {
  padding: 26px;
  background: var(--ground);
  border: 1px solid var(--line);
  border-radius: 18px;
}

.numero {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  margin-bottom: 18px;
  font-size: 14px;
  font-weight: 700;
  color: var(--surface);
  background: var(--dom);
  border-radius: 9px;
}

.titre-etape {
  margin: 0 0 8px;
  font-size: 18px;
  font-weight: 600;
}

.corps {
  margin: 0;
  font-size: 14.5px;
  line-height: 1.6;
  color: var(--muted);
}

/* ---------- Dossier ---------- */

.dossier {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 56px;
  align-items: center;
  max-width: 1200px;
  margin: 0 auto;
  padding-block: 72px;
}

.dossier h2 {
  margin-bottom: 18px;
}

.texte {
  margin: 0 0 26px;
  font-size: 17px;
  line-height: 1.65;
  color: var(--muted);
}

.lignes {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 0;
  margin: 0;
  list-style: none;
}

.lignes li {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 14px 16px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 13px;
}

.puce {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  font-size: 13px;
  font-weight: 700;
  color: var(--dom);
  background: var(--surface-2);
  border-radius: 50%;
}

.puce.verifiee {
  color: var(--surface);
  background: var(--dom);
}

.libelle-ligne {
  flex: 1;
  min-width: 0;
  font-size: 14.5px;
  font-weight: 500;
}

.etat {
  flex: none;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--muted);
}

.charge {
  padding: 32px;
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: 24px;
}

.titre-charge {
  margin: 0 0 18px;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--muted);
}

.charge ul {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 0;
  margin: 0;
  list-style: none;
}

.charge li {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  font-size: 15px;
  line-height: 1.55;
}

.coche {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  margin-top: 2px;
  font-size: 12px;
  color: var(--surface);
  background: var(--dom);
  border-radius: 50%;
}

/* ---------- Appel final ---------- */

.appel {
  max-width: 1200px;
  margin: 0 auto;
  padding-block: 0 80px;
}

.bloc-appel {
  display: flex;
  flex-wrap: wrap;
  gap: 40px;
  align-items: center;
  justify-content: space-between;
  padding: 56px;
  background: var(--dom-fonce);
  border-radius: 26px;
}

.copie-appel {
  max-width: 620px;
}

.accroche-claire {
  margin: 0 0 14px;
  font-size: 12.5px;
  font-weight: 800;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--dom-clair);
}

.bloc-appel h2 {
  margin: 0 0 12px;
  font-size: clamp(26px, 4vw, 34px);
  color: var(--surface);
}

.copie-appel p:last-child {
  margin: 0;
  font-size: 16px;
  line-height: 1.6;
  color: var(--dom-contraste);
}

.bouton-clair {
  padding: 17px 30px;
  font-size: 16px;
  font-weight: 700;
  color: var(--dom-fonce);
  white-space: nowrap;
  text-decoration: none;
  background: var(--surface);
  border-radius: 13px;
}

.bouton-clair:hover {
  color: var(--dom-fonce);
  background: var(--surface-2);
}

.bouton-clair:focus-visible {
  outline: 2px solid var(--surface);
  outline-offset: 3px;
}

@media (max-width: 900px) {
  .heros,
  .dossier {
    grid-template-columns: minmax(0, 1fr);
    gap: 36px;
  }

  .bloc-appel {
    padding: 32px;
  }
}

@media (max-width: 560px) {
  .accueil > section {
    padding-inline: 20px;
  }

  .heros {
    padding-block: 44px 40px;
  }

  .etapes .dedans,
  .dossier {
    padding-block: 48px;
  }

  .charge,
  .apercu {
    padding: 22px;
  }
}
</style>
