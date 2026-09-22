<script setup lang="ts">
import { ADRESSE_CONTACT, ROLE_LIBELLES, ROLES_AGENCE, type RoleUtilisateur } from '@releve/shared';

const { utilisateur, deconnexion } = useSession();

/**
 * Identite de l'editeur et du site, pour les moteurs.
 *
 * Posee ici et non dans chaque page : c'est la seule chose vraie de toutes les
 * pages vitrine a la fois, et les pages s'y rattachent par `@id` sans avoir a
 * la redecrire.
 *
 * Rien n'est emis dans l'espace connecte — un tableau de bord derriere un mot
 * de passe n'est indexe par personne, et le balisage y serait du bruit.
 */
const site = useUrlSite();

useDonneesStructurees(() =>
  utilisateur.value ? [] : [identiteOrganisation(site, ADRESSE_CONTACT), siteWeb(site)],
);

/**
 * Le menu suit le profil : le back-office et les deux espaces externes n'ont
 * aucune page en commun, sauf « Mon compte ».
 */
const interne = computed(
  () =>
    !!utilisateur.value &&
    (ROLES_AGENCE as readonly RoleUtilisateur[]).includes(utilisateur.value.role),
);

/**
 * Le canvas pose la navigation de l'espace connecte dans une barre laterale,
 * une entree par ligne. Les destinations restent celles du middleware : un lien
 * vers une section interdite se ferait renvoyer sur l'accueil du profil.
 */
const liens = computed<{ to: string; label: string }[]>(() => {
  const compte = { to: '/mon-compte', label: 'Mon compte' };

  if (!utilisateur.value) {
    return [];
  }

  if (interne.value) {
    return [
      { to: '/', label: 'Vivier' },
      { to: '/clients', label: 'Clients' },
      { to: '/tension', label: 'Tension' },
      ...(utilisateur.value.role === 'ADMIN_AGENCE' ? [{ to: '/comptes', label: 'Comptes' }] : []),
      compte,
    ];
  }

  if (utilisateur.value.role === 'CANDIDAT') {
    // Les quatre entrees du canvas, et pas une de plus. « Suivi » s'atteint
    // depuis le compteur de missions confirmees du tableau de bord et depuis
    // une mission a laquelle on a deja postule ; « Mon espace » ne disait rien
    // que « Mon profil » ne dise mieux, en modifiable.
    return [
      { to: '/tableau-de-bord', label: 'Tableau de bord' },
      { to: '/missions', label: 'Missions' },
      { to: '/annonces', label: 'Annonces partenaire' },
      { to: '/mon-profil', label: 'Mon profil' },
      { to: '/mon-compte', label: 'Paramètres' },
    ];
  }

  return [
    { to: '/etablissement', label: 'Accueil' },
    { to: '/etablissement/publier', label: 'Publier' },
    { to: '/mon-espace', label: 'Mon espace' },
    compte,
  ];
});

/**
 * Navigation publique du canvas.
 *
 * L'entree « Missions » du canvas devient ici « Nos offres d'emploi ». Le
 * possessif n'est pas de la coquetterie : il distingue nos missions, sur
 * lesquelles on postule ici, des offres du marche collectees sur France
 * Travail, qui ne s'affichent qu'a un candidat connecte et sur lesquelles on
 * postule ailleurs.
 */
const liensVitrine = [
  { to: '/accueil', label: 'Accueil' },
  { to: '/offres', label: "Nos offres d'emploi" },
  { to: '/fonctionnement', label: 'Comment ça marche?' }, 
  { to: '/a-propos', label: 'À propos' },
  { to: '/faq', label: 'FAQ' },
  { to: '/contact', label: 'Contact' },
];

/** Les trois colonnes du pied de page du canvas. */
const colonnesPied = [
  {
    titre: 'Candidats',
    liens: [
      { to: '/fonctionnement', label: 'Comment ça marche' },
      { to: '/offres', label: "Nos offres d'emploi" },
      { to: '/inscription', label: 'Créer un compte' },
      { to: '/connexion', label: 'Se connecter' },
    ],
  },
  {
    titre: 'Agence',
    liens: [
      { to: '/a-propos', label: 'À propos' },
      { to: '/contact', label: 'Contact' },
      { to: '/faq', label: 'FAQ' },
    ],
  },
  {
    titre: 'Légal',
    liens: [
      { to: '/mentions-legales', label: 'Mentions légales' },
      { to: '/conditions-utilisation', label: "Conditions d'utilisation" },
      { to: '/politique-confidentialite', label: 'Politique de confidentialité' },
    ],
  },
];

const annee = new Date().getFullYear();

/**
 * Ouverture du menu compact.
 *
 * Une seule variable pour les deux coques : elles ne s'affichent jamais en
 * meme temps, et deux etats separes se seraient desynchronises a la premiere
 * connexion.
 *
 * Ce menu n'existe que sous 900 px. Au-dela, le CSS montre la navigation en
 * permanence et cache le bouton — l'etat reste alors sans effet, ce qui evite
 * d'avoir a le remettre a zero en changeant de taille de fenetre.
 */
const menuOuvert = ref(false);
const route = useRoute();

/**
 * Lien canonique des pages publiques.
 *
 * Complement direct des donnees structurees : celles-ci declarent des adresses
 * absolues, et sans canonique la meme page atteinte par deux chemins — avec ou
 * sans barre finale, en `www` ou non, suivie d'un parametre de campagne —
 * serait indexee plusieurs fois, chacune diluant le poids de l'autre.
 *
 * `route.path` et non `fullPath` : les filtres des offres sont des parametres
 * d'affichage, pas des pages distinctes, et les faire indexer separement
 * multiplierait les doublons au lieu de les eviter.
 */
useHead(() =>
  utilisateur.value
    ? {}
    : { link: [{ rel: 'canonical', href: urlAbsolue(site, route.path) }] },
);

/**
 * Le menu se referme en changeant de page.
 *
 * Sans cela, suivre un lien laisserait le panneau ouvert par-dessus la page
 * qu'on vient de demander — et sur un telephone, il la couvrirait entierement.
 */
watch(() => route.fullPath, () => {
  menuOuvert.value = false;
});

/** Echap referme, comme n'importe quel panneau superpose. */
function auClavier(evenement: KeyboardEvent): void {
  if (evenement.key === 'Escape') {
    menuOuvert.value = false;
  }
}

onMounted(() => window.addEventListener('keydown', auClavier));
onBeforeUnmount(() => window.removeEventListener('keydown', auClavier));

/** Avancement du dossier, affiche en pied de barre laterale pour un candidat. */
const { data: completude } = await useCompletude();

async function sortir(): Promise<void> {
  // La deconnexion revoque la session cote API : on attend qu'elle aboutisse
  // avant de quitter la page, sinon la session survivrait au clic.
  await deconnexion();
  await navigateTo('/connexion');
}
</script>

<template>
  <!-- Coque publique du canvas : en-tete collant, contenu, pied de page. -->
  <div v-if="!utilisateur" class="site">
    <header class="entete" :class="{ ouvert: menuOuvert }">
      <div class="dedans">
        <NuxtLink to="/accueil" class="marque">
          <AppLogo :taille="30" />
          <span>Relève</span>
        </NuxtLink>

        <!--
          Le bouton n'existe que sous 900 px, par le CSS et non par `v-if` :
          rendu conditionnellement, il apparaitrait apres l'hydratation et
          ferait sauter l'en-tete au chargement. `aria-expanded` porte l'etat,
          et le panneau ferme est en `display: none`, donc ses liens sortent
          aussi de l'ordre de tabulation — pas besoin d'`inert`.
        -->
        <button
          type="button"
          class="bascule"
          :aria-expanded="menuOuvert"
          aria-controls="menu-principal"
          :aria-label="menuOuvert ? 'Fermer le menu' : 'Ouvrir le menu'"
          @click="menuOuvert = !menuOuvert"
        >
          <span class="barres" aria-hidden="true"><span /><span /><span /></span>
          <span class="mot">Menu</span>
        </button>

        <div id="menu-principal" class="repliable">
          <nav class="menu">
            <NuxtLink v-for="lien in liensVitrine" :key="lien.to" :to="lien.to">
              {{ lien.label }}
            </NuxtLink>
          </nav>

          <div class="acces">
            <NuxtLink to="/connexion" class="lien-bouton secondaire">Se connecter</NuxtLink>
            <NuxtLink to="/inscription" class="lien-bouton primaire">S'inscrire</NuxtLink>
          </div>
        </div>
      </div>
    </header>

    <main class="contenu">
      <slot />
    </main>

    <footer class="pied">
      <div class="dedans colonnes">
        <div>
          <NuxtLink to="/accueil" class="marque marque-pied">
            <AppLogo :taille="26" />
            <span>Relève</span>
          </NuxtLink>
          <p class="accroche">Le soin, sans attendre</p>
          <p class="baseline">Agence d'intérim spécialisée en EHPAD, hôpital et clinique.</p>
        </div>

        <div v-for="colonne in colonnesPied" :key="colonne.titre">
          <p class="titre-colonne">{{ colonne.titre }}</p>
          <ul>
            <li v-for="lien in colonne.liens" :key="lien.to">
              <NuxtLink :to="lien.to">{{ lien.label }}</NuxtLink>
            </li>
          </ul>
        </div>
      </div>

      <div class="mentions">
        <div class="dedans">© {{ annee }} Relève</div>
      </div>
    </footer>
  </div>

  <!-- Coque de l'espace connecte : barre laterale et colonne de contenu. -->
  <div v-else class="espace" :class="{ ouvert: menuOuvert }">
    <aside class="laterale">
      <div class="tete-laterale">
        <NuxtLink :to="liens[0]?.to ?? '/'" class="marque">
          <AppLogo :taille="28" />
          <span>Relève</span>
        </NuxtLink>

        <!-- Meme bouton que la coque publique, et meme raison de le poser en
             CSS plutot qu'en `v-if`. -->
        <button
          type="button"
          class="bascule"
          :aria-expanded="menuOuvert"
          aria-controls="menu-espace"
          :aria-label="menuOuvert ? 'Fermer le menu' : 'Ouvrir le menu'"
          @click="menuOuvert = !menuOuvert"
        >
          <span class="barres" aria-hidden="true"><span /><span /><span /></span>
          <span class="mot">Menu</span>
        </button>
      </div>

      <div id="menu-espace" class="repliable">
      <nav>
        <NuxtLink v-for="lien in liens" :key="lien.to" :to="lien.to">{{ lien.label }}</NuxtLink>
      </nav>

      <!-- Carte d'avancement du canvas : elle ne s'affiche que pour un candidat,
           les seuls a avoir un dossier a completer. -->
      <NuxtLink v-if="completude" to="/mon-profil" class="avancement">
        <p class="part">Profil complété à {{ completude.pourcentage }} %</p>
        <span class="jauge"><span :style="{ width: `${completude.pourcentage}%` }" /></span>
        <span class="suite">Compléter mon profil →</span>
      </NuxtLink>

      <div class="session">
        <p class="compte">{{ utilisateur.email }}</p>
        <p class="role">{{ ROLE_LIBELLES[utilisateur.role] }}</p>
        <button type="button" class="sortir" @click="sortir()">Se déconnecter</button>
      </div>
      </div>
    </aside>

    <main class="contenu-app">
      <slot />
    </main>
  </div>
</template>

<style scoped>
/* ---------- Coque publique ---------- */

.site {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.dedans {
  max-width: 1200px;
  margin: 0 auto;
  padding-inline: var(--gouttiere);
}

.entete {
  position: sticky;
  top: 0;
  z-index: 20;
  /* Le canvas laisse transparaitre le fond sous l'en-tete ; color-mix garde le
   * procede quand --ground change avec le theme. */
  background: color-mix(in srgb, var(--ground) 92%, transparent);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--line);
}

.entete .dedans {
  display: flex;
  flex-wrap: wrap;
  gap: 16px 24px;
  align-items: center;
  justify-content: space-between;
  padding-block: 16px;
}

.marque {
  display: flex;
  flex: none;
  gap: 10px;
  align-items: center;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--ink);
  text-decoration: none;
}

/* Le conteneur du menu compact.
 *
 * `display: contents` au-dessus du point de bascule : l'element disparait de la
 * mise en page et ses enfants redeviennent enfants directs de la barre. C'est
 * ce qui permet de grouper la navigation dans une boite repliable **sans rien
 * changer a l'affichage large** — sans lui, ce nouveau conteneur serait devenu
 * un item de flex de plus, et la navigation aurait cesse de s'etaler entre la
 * marque et les boutons. */
.repliable {
  display: contents;
}

/* Le bouton du menu compact.
 *
 * Toujours dans le DOM, masque par le CSS au-dessus de 900 px. Le rendre
 * conditionnellement en Vue le ferait apparaitre apres l'hydratation, et
 * l'en-tete sauterait au chargement de chaque page. */
.bascule {
  display: none;
  flex: none;
  gap: 10px;
  align-items: center;
  padding: 9px 14px 9px 12px;
  font: inherit;
  font-size: 14.5px;
  font-weight: 600;
  color: var(--ink);
  cursor: pointer;
  background: var(--surface);
  border: 1px solid var(--line-forte);
  border-radius: 11px;
}

.bascule:focus-visible {
  outline: 2px solid var(--dom);
  outline-offset: 2px;
}

.barres {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 18px;
}

.barres span {
  height: 2px;
  background: currentcolor;
  border-radius: 2px;
}

/* Navigation publique : le canvas l'etale entre la marque et les deux boutons,
 * et la laisse passer a la ligne plutot que de la comprimer. */
.menu {
  display: flex;
  flex: 1;
  flex-wrap: wrap;
  gap: 6px 2px;
  align-items: center;
}

.menu a {
  padding: 8px 12px;
  font-size: 14.5px;
  font-weight: 500;
  color: var(--muted);
  white-space: nowrap;
  text-decoration: none;
  border-radius: 9px;
}

.menu a:hover {
  color: var(--dom-fonce);
  background: var(--surface-2);
}

.menu a.router-link-active {
  font-weight: 700;
  color: var(--dom-fonce);
  background: var(--surface-2);
}

.menu a:focus-visible {
  outline: 2px solid var(--dom);
  outline-offset: 2px;
}

.acces {
  display: flex;
  gap: 10px;
}

.lien-bouton {
  padding: 10px 16px;
  font-size: 14.5px;
  font-weight: 600;
  white-space: nowrap;
  text-decoration: none;
  border: 1px solid transparent;
  border-radius: 11px;
}

.lien-bouton.secondaire {
  color: var(--dom-fonce);
  background: var(--surface);
  border-color: var(--line-forte);
}

.lien-bouton.secondaire:hover {
  border-color: var(--dom);
}

.lien-bouton.primaire {
  padding-inline: 18px;
  color: var(--surface);
  background: var(--dom);
}

.lien-bouton.primaire:hover {
  background: var(--dom-fonce);
}

.lien-bouton:focus-visible {
  outline: 2px solid var(--dom);
  outline-offset: 2px;
}

/* Ni largeur ni gouttiere ici : l'accueil vitrine a besoin de bandes pleine
 * largeur, et chaque page publique pose sa propre colonne. */
.contenu {
  flex: 1;
  width: 100%;
}

.pied {
  background: var(--surface);
  border-top: 1px solid var(--line);
}

/* Le pied de page, et pourquoi ses colonnes se chevauchaient.
 *
 * L'ancienne valeur melangeait une piste flexible — `minmax(0, 1.4fr)` — et un
 * `repeat(auto-fit, ...)`. Les trois pistes repetees reclamaient 160 px chacune,
 * plus les ecarts : sur une fenetre moyenne, il ne restait presque rien pour la
 * premiere, que son `minmax(0, ...)` autorisait a tomber a zero. Le bloc de
 * marque se retrouvait large de quelques dizaines de pixels, et son texte
 * debordait par-dessus la colonne suivante. Ce n'etait pas un defaut de marge :
 * la piste elle-meme avait disparu.
 *
 * Deux regles explicites remplacent l'automatisme. En dessous, des colonnes
 * egales qui se replient d'elles-memes ; au-dessus, la repartition voulue par
 * le canvas, avec un bloc de marque plus large. */
.colonnes {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 32px;
  padding-block: 48px;
}

@media (min-width: 900px) {
  .colonnes {
    grid-template-columns: 1.4fr repeat(3, 1fr);
  }
}

.marque-pied {
  margin-bottom: 14px;
  font-size: 18px;
}

.accroche {
  margin: 0 0 10px;
  font-size: 12.5px;
  font-weight: 800;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--eta);
}

.baseline {
  max-width: 36ch;
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--muted);
}

.titre-colonne {
  margin: 0 0 14px;
  font-size: 12.5px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.colonnes ul {
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding: 0;
  margin: 0;
  list-style: none;
}

.colonnes a {
  font-size: 14px;
  color: var(--muted);
  text-decoration: none;
}

.colonnes a:hover {
  color: var(--dom);
}

.mentions {
  border-top: 1px solid var(--line);
  font-size: 12.5px;
  color: var(--muted);
}

.mentions .dedans {
  padding-block: 18px;
}

/* ---------- Coque de l'espace connecte ---------- */

.espace {
  display: grid;
  grid-template-columns: 248px minmax(0, 1fr);
  min-height: 100vh;
}

/* La barre reste à l'écran pendant qu'on parcourt la page.
 *
 * Sans cela elle suivait la hauteur du contenu — comportement par défaut d'une
 * colonne de grille, qui s'étire sur toute la rangée. Sur « Mon profil », qui
 * fait plusieurs écrans, il fallait descendre jusqu'en bas pour retrouver la
 * carte d'avancement et le bouton de déconnexion. Or ce sont précisément les
 * deux éléments qu'on cherche à mi-parcours : l'un pour savoir ce qu'il reste à
 * remplir, l'autre pour partir.
 *
 * `align-self: start` est indispensable : une colonne de grille étirée occupe
 * déjà toute la rangée, donc `position: sticky` n'aurait rien à faire coller.
 * La hauteur repasse ensuite à celle de la fenêtre, et `overflow-y` prend le
 * relais dans le cas où la barre serait plus haute qu'elle — écran court, ou
 * menu qui s'allongerait.
 *
 * `100dvh` plutôt que `100vh` : sur mobile, `vh` ignore la barre d'adresse du
 * navigateur, et le bas de la colonne se retrouve dessous. */
.laterale {
  position: sticky;
  top: 0;
  display: flex;
  flex-direction: column;
  gap: 28px;
  align-self: start;
  height: 100dvh;
  padding: 22px 18px;
  overflow-y: auto;
  background: var(--surface);
  border-right: 1px solid var(--line);
}

/* En colonne large, cette ligne ne contient que la marque : le bouton y est
 * masque. Elle existe pour la barre compacte, ou marque et bouton se font face. */
.tete-laterale {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
}

.laterale .marque {
  padding-inline: 6px;
  font-size: 19px;
}

/* `1 0 auto` et non `1` : le menu prend l'espace libre pour pousser la carte
 * d'avancement et la session vers le bas, mais ne se comprime jamais sous son
 * propre contenu. Avec `flex: 1`, sa base vaut zéro — sur un écran court, les
 * liens auraient débordé de leur boîte au lieu de faire défiler la barre. */
.laterale nav {
  display: flex;
  flex: 1 0 auto;
  flex-direction: column;
  gap: 4px;
  align-content: start;
}

.laterale nav a {
  padding: 12px 14px;
  font-size: 14.5px;
  font-weight: 500;
  color: var(--muted);
  text-decoration: none;
  border-radius: 11px;
}

.laterale nav a:hover {
  color: var(--dom-fonce);
  background: var(--surface-2);
}

.laterale nav a.router-link-exact-active {
  font-weight: 700;
  color: var(--dom-fonce);
  background: var(--surface-2);
}

.avancement {
  display: block;
  padding: 16px;
  color: inherit;
  text-decoration: none;
  background: var(--ground);
  border: 1px solid var(--line);
  border-radius: 14px;
}

.avancement:hover {
  border-color: var(--dom);
}

.avancement:focus-visible {
  outline: 2px solid var(--dom);
  outline-offset: 2px;
}

.part {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 600;
}

.jauge {
  display: block;
  height: 7px;
  margin-bottom: 12px;
  overflow: hidden;
  background: var(--line);
  border-radius: 6px;
}

.jauge span {
  display: block;
  height: 100%;
  background: var(--dom);
}

.suite {
  font-size: 13px;
  font-weight: 600;
  color: var(--dom);
}

.session {
  padding-inline: 6px;
}

.compte {
  margin: 0;
  overflow: hidden;
  font-size: 13px;
  text-overflow: ellipsis;
}

.role {
  margin: 2px 0 12px;
  font-size: 12.5px;
  color: var(--muted);
}

.sortir {
  padding: 0;
  font-family: var(--sans);
  font-size: 13.5px;
  color: var(--muted);
  background: none;
  border: 0;
  cursor: pointer;
}

.sortir:hover {
  color: var(--dom);
}

.sortir:focus-visible,
.laterale a:focus-visible {
  outline: 2px solid var(--dom);
  outline-offset: 2px;
}

.contenu-app {
  max-width: 1180px;
  padding: 34px 40px 70px;
}

/* Sous 900 px, les deux coques passent au menu repliable.
 *
 * Ce qui a motive ce changement se mesure. La barre laterale devenait un
 * bandeau horizontal qui occupait **387 px sur les 849 px** d'un ecran de
 * telephone : pres de la moitie de l'affichage avant le premier mot de la
 * page. L'en-tete public faisait 310 px, et il colle — il suivait donc tout le
 * defilement. Aucune des deux ne debordait en largeur ; elles etaient
 * simplement inutilisables.
 *
 * Replies, ils tombent respectivement a 61 px et 64 px. La navigation n'a pas
 * disparu : elle attend derriere un bouton, ce qui est le bon arbitrage quand
 * l'ecran se compte en centaines de pixels. */
@media (max-width: 900px) {
  .bascule {
    display: inline-flex;
  }

  /* Le conteneur redevient une vraie boite, et se replie. `display: none`
   * plutot qu'une hauteur nulle : les liens sortent ainsi de l'ordre de
   * tabulation, sans avoir a poser `inert` ni `aria-hidden` a la main. */
  .repliable {
    display: none;
    flex-direction: column;
    gap: 16px;
    width: 100%;
  }

  .entete.ouvert .repliable,
  .espace.ouvert .repliable {
    display: flex;
  }

  /* ---- coque publique ---- */

  .entete .dedans {
    flex-wrap: nowrap;
    gap: 12px;
    padding-block: 12px;
  }

  .entete.ouvert .dedans {
    flex-wrap: wrap;
    padding-bottom: 18px;
  }

  /* L'en-tete colle : ouvert, il peut depasser la hauteur de l'ecran sur un
   * petit telephone. Il defile alors dans sa propre boite plutot que de rendre
   * le bas du menu inatteignable. */
  .entete.ouvert .repliable {
    max-height: calc(100dvh - 90px);
    overflow-y: auto;
  }

  .menu {
    flex-direction: column;
    gap: 2px;
    align-items: stretch;
  }

  .menu a {
    padding: 11px 12px;
  }

  .acces {
    flex-direction: column;
    gap: 8px;
  }

  .lien-bouton {
    text-align: center;
  }

  /* ---- coque de l'espace connecte ---- */

  .espace {
    grid-template-columns: minmax(0, 1fr);
  }

  /* La barre reprend sa hauteur naturelle et cesse de coller : figee en haut,
   * elle mangerait un ecran de telephone alors que le contenu en a besoin. */
  .laterale {
    position: static;
    gap: 16px;
    height: auto;
    padding: 12px 16px;
    overflow: visible;
    border-right: 0;
    border-bottom: 1px solid var(--line);
  }

  .laterale nav {
    flex: none;
  }

  .avancement {
    margin-top: 0;
  }

  /* L'adresse peut etre longue, et la boite etroite : sans cette regle elle
   * poussait le bouton de deconnexion hors de l'ecran — deux pixels de
   * debordement horizontal sur toute l'application. */
  .compte {
    overflow-wrap: anywhere;
  }

  .session {
    margin-top: 0;
  }

  .contenu-app {
    padding: 24px 20px 56px;
  }
}

@media (max-width: 560px) {
  .contenu-app {
    padding-inline: 16px;
  }
}
</style>
