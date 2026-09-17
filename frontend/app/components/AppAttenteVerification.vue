<script setup lang="ts">
/**
 * Ecran d'attente affiche juste apres une inscription.
 *
 * Il remplace le formulaire au lieu de s'y ajouter : le parcours est termine
 * cote navigateur, et laisser les champs visibles inviterait a re-soumettre,
 * ce qui ne rendrait qu'un 409.
 *
 * Partage par les deux parcours — un interimaire et une entreprise attendent
 * exactement la meme chose, et dupliquer l'ecran ferait diverger les deux
 * messages a la premiere retouche.
 */
const props = defineProps<{ email: string }>();

const { renvoyerVerification } = useSession();

const envoi = ref(false);
const renvoye = ref(false);

async function renvoyer(): Promise<void> {
  envoi.value = true;

  // L'API repond 204 meme pour une adresse inconnue : il n'y a rien a
  // distinguer, donc rien a rattraper.
  await renvoyerVerification(props.email).catch(() => undefined);

  envoi.value = false;
  renvoye.value = true;
}
</script>

<template>
  <AppCarte class="attente">
    <p class="pastille" aria-hidden="true">✉</p>

    <h2>Verifiez votre boite mail</h2>

    <p class="corps">
      Un lien de confirmation vient d'etre envoye a <strong>{{ email }}</strong
      >. Ouvrez-le pour activer votre compte : il vous conduira directement a votre espace.
    </p>

    <p class="note">
      Le lien est valable 48 heures et ne fonctionne qu'une fois. Pensez a regarder dans les
      indesirables.
    </p>

    <p v-if="renvoye" class="confirme" role="status">
      Si un compte existe pour cette adresse et attend confirmation, un nouveau lien vient de
      partir.
    </p>

    <AppBouton v-else variante="secondaire" :desactive="envoi" @click="renvoyer">
      {{ envoi ? 'Envoi...' : 'Renvoyer le lien' }}
    </AppBouton>
  </AppCarte>
</template>

<style scoped>
/* Meme carte que les trois du formulaire : le canvas les cerne d'un filet et
 * les arrondit a 22 px, l'ecran d'attente prend leur place. */
.attente {
  padding: 32px;
  text-align: center;
  border: 1px solid var(--line);
  border-radius: 22px;
}

.pastille {
  margin: 0 auto 16px;
  width: 48px;
  height: 48px;
  display: grid;
  place-items: center;
  font-size: 22px;
  background: var(--surface-2);
  border-radius: 50%;
}

h2 {
  margin: 0 0 12px;
  font-size: 20px;
  font-weight: 600;
}

.corps {
  margin: 0 0 12px;
  font-size: 14.5px;
  line-height: 1.6;
}

.note {
  margin: 0 0 20px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--muted);
}

.confirme {
  margin: 0;
  padding: 10px 12px;
  font-size: 13px;
  line-height: 1.5;
  background: var(--dom-soft);
  border-radius: var(--r-champ);
}
</style>
