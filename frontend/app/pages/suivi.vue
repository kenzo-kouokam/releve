<script setup lang="ts">
import type { PropositionResume } from '@releve/shared';

useHead({ title: 'Suivi de mission - Relève' });

const { requete } = useApi();

/**
 * La route rend `null` quand rien n'est confirme : c'est un etat normal, pas
 * une erreur. L'ecran affiche alors une invitation a postuler plutot qu'une
 * carte vide.
 */
const { data: proposition } = await useAsyncData('mission-confirmee', () =>
  requete<PropositionResume | null>('/propositions/courante'),
);

const mission = computed(() => {
  const retenue = proposition.value?.mission;
  if (!retenue) return undefined;

  return {
    etablissement: {
      nom: retenue.client.raisonSociale,
      initiales: initiales(retenue.client.raisonSociale),
      localisation: `${retenue.lieu.libelle} · ${retenue.lieu.ville}`,
    },
    adresse: `${retenue.lieu.libelle}, ${retenue.lieu.codePostal} ${retenue.lieu.ville}`,
    jour: jourCourt(retenue.dateDebut),
    horaires: horaires(retenue.heureDebut, retenue.heureFin),
    debutDans: debutDans(retenue.dateDebut, retenue.heureDebut),
    // La messagerie et l'annuaire des cadres n'existent pas : le contact
    // affiche est l'etablissement lui-meme, seule information reelle dont on
    // dispose. Inventer un nom de cadre serait trompeur.
    contact: {
      nom: retenue.client.raisonSociale,
      initiales: initiales(retenue.client.raisonSociale),
      fonction: 'Etablissement employeur',
    },
    checklist: [
      `Diplome ${retenue.qualificationRequise.code} verifie`,
      'Candidature validee par l etablissement',
      retenue.travailNuit ? 'Vacation de nuit - repos a prevoir' : 'Consignes d acces consultees',
    ],
  };
});

/**
 * « Voir l'itineraire » n'a pas de cible dans la maquette et le projet n'embarque
 * pas de carte. Le lien ouvre donc l'adresse dans le service de cartographie du
 * navigateur, dans un nouvel onglet.
 */
const itineraire = computed(
  () =>
    `https://www.openstreetmap.org/search?query=${encodeURIComponent(mission.value?.adresse ?? '')}`,
);
</script>

<template>
  <section class="suivi">
    <div v-if="!mission" class="aucune">
      <h1>Aucune mission confirmee</h1>
      <p>Vos candidatures en cours apparaitront ici des qu un etablissement en aura retenu une.</p>
      <AppBouton to="/missions">Voir les missions disponibles</AppBouton>
    </div>

    <template v-else>
      <header class="tete">
        <p class="statut">Mission confirmee</p>
        <h1>Tout est pret</h1>
      </header>

      <AppCarte class="mission">
        <div class="etablissement">
          <AppAvatar :initiales="mission.etablissement.initiales" />
          <div class="copie">
            <p class="nom">{{ mission.etablissement.nom }}</p>
            <p class="lieu">{{ mission.etablissement.localisation }}</p>
          </div>
          <AppBadge teinte="vert">Confirmee</AppBadge>
        </div>

        <div class="creneau">
          <div class="bloc">
            <p class="libelle">{{ mission.jour }}</p>
            <p class="valeur">{{ mission.horaires }}</p>
          </div>
          <div class="bloc compte-a-rebours">
            <p class="libelle">Debut dans</p>
            <p class="valeur urgent">{{ mission.debutDans }}</p>
          </div>
        </div>

        <a class="itineraire" :href="itineraire" target="_blank" rel="noopener noreferrer">
          <AppIcon nom="navigation" :taille="18" />
          <span>Voir l'itineraire</span>
        </a>
      </AppCarte>

      <div class="colonnes">
        <section>
          <h2>Votre contact sur place</h2>
          <AppCarte class="contact">
            <AppAvatar :initiales="mission.contact.initiales" teinte="lavande" />
            <div class="copie">
              <p class="nom-contact">{{ mission.contact.nom }}</p>
              <p class="lieu">{{ mission.contact.fonction }}</p>
            </div>
            <!-- La messagerie n'existe pas encore : le bouton du design est
               conserve mais inactif, plutot que de pointer dans le vide. -->
            <button type="button" class="message" disabled aria-label="Messagerie a venir">
              <AppIcon nom="message-circle" :taille="18" />
            </button>
          </AppCarte>
        </section>

        <section>
          <h2>Avant la mission</h2>
          <ul class="checklist">
            <li v-for="etape in mission.checklist" :key="etape">
              <AppIcon nom="check-circle" :taille="18" />
              <span>{{ etape }}</span>
            </li>
          </ul>
        </section>
      </div>
    </template>
  </section>
</template>

<style scoped>
.aucune {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
  padding: 28px 0;
  max-width: 46ch;
}

.aucune h1 {
  margin: 0;
  font-size: 1.3rem;
}

.aucune p {
  margin: 0;
  color: var(--muted);
  line-height: 1.55;
}

.suivi {
  max-width: 720px;
  padding-block: 28px 0;
}

.statut {
  margin: 0 0 5px;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--eta);
}

h1 {
  margin: 0 0 20px;
  font-size: 25px;
  font-weight: 400;
}

.mission {
  display: grid;
  gap: 16px;
  padding: 18px;
  border-radius: var(--r-carte-large);
}

.etablissement,
.contact {
  display: flex;
  gap: 12px;
  align-items: center;
}

.copie {
  flex: 1;
  min-width: 0;
}

.nom {
  margin: 0 0 3px;
  font-size: 16px;
  font-weight: 700;
}

.nom-contact {
  margin: 0 0 3px;
  font-size: 14px;
  font-weight: 700;
}

.lieu {
  margin: 0;
  font-size: 11px;
  color: var(--muted);
}

.creneau {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px;
}

.bloc {
  padding: 12px;
  background: var(--ground);
  border-radius: 10px;
}

.compte-a-rebours {
  background: var(--eta-soft);
}

.libelle {
  margin: 0 0 4px;
  font-size: 10px;
  color: var(--muted);
}

.valeur {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
}

.valeur.urgent {
  color: var(--eta);
}

.itineraire {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: center;
  height: 54px;
  font-size: 15px;
  color: var(--dom);
  text-decoration: none;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-carte);
}

.itineraire:focus-visible {
  outline: 2px solid var(--dom);
  outline-offset: 2px;
}

.colonnes {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 20px;
  margin-top: 20px;
}

h2 {
  margin: 0 0 12px;
  font-size: 16px;
  font-weight: 700;
}

.contact {
  padding: 14px;
}

.message {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  color: var(--dom-fonce);
  background: var(--dom-soft);
  border: 0;
  border-radius: 999px;
  opacity: 0.5;
  cursor: not-allowed;
}

.checklist {
  display: grid;
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.checklist li {
  display: flex;
  gap: 10px;
  align-items: center;
  font-size: 13px;
  color: var(--dom);
}

.checklist span {
  color: var(--ink);
}
</style>
