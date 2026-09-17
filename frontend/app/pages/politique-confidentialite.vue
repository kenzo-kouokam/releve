<script setup lang="ts">
import {
  DELAI_REPONSE_JOURS,
  DUREE_CONSERVATION_MOIS,
  REINITIALISATION_EXPIRE_HEURES,
  VERIFICATION_EXPIRE_HEURES,
} from '@releve/shared';
import { ADRESSE_CONTACT, AUTORITE_CONTROLE, DERNIERE_REVISION, DONNEES } from '~/data/legal';

useHead({
  title: 'Politique de confidentialité — Relève',
  meta: [{ name: 'robots', content: 'noindex' }],
});
</script>

<template>
  <main class="vitrine legal">
    <p class="vitrine-accroche">Confidentialité</p>
    <h1 class="vitrine-titre">Vos données, et ce que nous en faisons</h1>
    <p class="vitrine-chapeau">
      Ce texte décrit les traitements que la plateforme effectue réellement, relevés dans le code.
      Les rubriques qui dépendent de l'organisation de l'agence — responsable de traitement, durées
      de conservation, sous-traitants — reposent sur un jeu de démonstration.
    </p>

    <AppBandeauDemonstration />

    <section>
      <h2>1. Ce que nous collectons</h2>

      <h3>Pour votre dossier candidat</h3>
      <ul>
        <li>Identité : nom, prénom.</li>
        <li>Coordonnées : adresse mail, numéro de téléphone.</li>
        <li>
          Adresse postale, ainsi que le rayon de déplacement que vous déclarez, le permis B et la
          disposition d'un véhicule.
        </li>
        <li>Disponibilités hebdomadaires et indisponibilités déclarées.</li>
        <li>
          Diplômes déclarés et expérience professionnelle, avec la date à laquelle l'agence les a
          vérifiés.
        </li>
      </ul>

      <h3>Pour votre compte</h3>
      <ul>
        <li>
          Votre adresse mail, qui sert d'identifiant, et votre mot de passe — jamais conservé en
          clair : seule une empreinte Argon2id est stockée.
        </li>
        <li>
          Les dates de dernière connexion et le compteur d'échecs consécutifs, qui sert à ralentir
          les tentatives automatisées.
        </li>
      </ul>

      <h3>Ce que nous ne collectons pas</h3>
      <p>
        <strong>Aucune donnée de santé.</strong> L'agence enregistre si vous êtes déployable, jamais
        pourquoi. La visite médicale et la vaccination sont constatées sur pièce par l'agence et ne
        sont jamais déclarées par vous dans la plateforme.
      </p>
      <p>
        Le site ne pose <strong>aucun cookie de mesure d'audience ni de publicité</strong>, et
        n'embarque aucun traceur tiers.
      </p>
    </section>

    <section>
      <h2>2. À quoi servent ces données</h2>
      <ul>
        <li>
          <strong>Vous proposer des missions adaptées.</strong> Votre adresse, votre rayon, vos
          disponibilités et vos diplômes vérifiés alimentent le calcul de correspondance. Une
          mission située au-delà de votre rayon est écartée, pas seulement moins bien classée.
        </li>
        <li>
          <strong>Transmettre votre candidature</strong> à l'établissement qui a publié le besoin.
        </li>
        <li>
          <strong>Établir les actes de la mission</strong> : contrat, déclaration préalable à
          l'embauche, paie.
        </li>
        <li>
          <strong>Assurer la sécurité du compte</strong> : confirmation d'adresse, réinitialisation
          de mot de passe, alerte en cas de changement.
        </li>
      </ul>
    </section>

    <section>
      <h2>3. Qui les reçoit</h2>
      <p>
        Vos données sont accessibles à l'agence, et à l'établissement destinataire d'une candidature
        que vous avez envoyée — jamais aux autres.
      </p>
      <p>
        Deux services extérieurs interviennent dans le fonctionnement du site :
      </p>
      <ul>
        <li>
          <strong>La Base Adresse Nationale</strong> (<code>api-adresse.data.gouv.fr</code>, service
          public français) : votre adresse lui est transmise pour obtenir ses coordonnées
          géographiques, afin de mesurer les distances. Aucune autre donnée ne lui est envoyée.
        </li>
        <li>
          <strong>Un service d'envoi de courriels</strong>, pour les messages liés à votre compte.
        </li>
      </ul>
      <p>
        Les offres publiques affichées dans la rubrique « Offres du marché » et dans le baromètre de
        tension viennent de France Travail : c'est un flux entrant, aucune de vos données ne part
        vers ce service. Consulter ces offres sur Relève ne nous signale pas à France Travail.
      </p>
      <p>
        En revanche, si vous cliquez sur « Postuler sur France Travail », vous quittez ce site et
        poursuivez sur francetravail.fr, où s'appliquent leurs propres conditions et leur propre
        politique de confidentialité. Votre candidature ne passe pas par Relève et nous ne la
        recevons pas.
      </p>
    </section>

    <section>
      <h2>4. Combien de temps</h2>
      <p>Les durées techniques sont fixées par le code :</p>
      <ul>
        <li>Jeton d'accès à votre session : 15 minutes.</li>
        <li>Session prolongeable : 12 heures, révocable à tout moment par la déconnexion.</li>
        <li>
          Lien de confirmation d'adresse : {{ VERIFICATION_EXPIRE_HEURES }} heures, utilisable une
          seule fois.
        </li>
        <li>
          Lien de réinitialisation du mot de passe :
          {{ REINITIALISATION_EXPIRE_HEURES === 1 ? 'une heure' : `${REINITIALISATION_EXPIRE_HEURES} heures` }},
          utilisable une seule fois. Plus court que le précédent&nbsp;: il ouvre la porte d'un compte
          existant, l'autre confirme seulement une adresse.
        </li>
        <li>
          Préférences d'affichage (contraste renforcé, réduction des animations) : conservées dans
          votre navigateur, sur cet appareil, jamais transmises.
        </li>
      </ul>

      <h3>Vos pièces justificatives</h3>
      <p>
        Chaque pièce que vous déposez — numéro de sécurité sociale, diplôme, CV, pièce d'identité,
        RIB — est conservée <strong>{{ DUREE_CONSERVATION_MOIS }} mois</strong> à compter de son
        dépôt. Déposer une nouvelle version fait repartir ce délai.
      </p>
      <p>
        À cette échéance, nous vous écrivons à l'adresse de votre compte pour vous demander si vous
        souhaitez que nous les gardions. Un clic suffit à les conserver
        {{ DUREE_CONSERVATION_MOIS }} mois de plus, ou à les effacer immédiatement.
        <strong>
          Sans réponse de votre part dans les {{ DELAI_REPONSE_JOURS }} jours, elles sont effacées
        </strong>
        : votre silence ne vaut pas accord. Votre compte et votre dossier, eux, restent ouverts, et
        vous pouvez redéposer vos pièces à tout moment.
      </p>
      <p>
        La durée de conservation du dossier candidat lui-même — vos coordonnées, votre parcours, vos
        disponibilités — relève de l'agence et figure ci-dessous.
      </p>
    </section>

    <section>
      <h2>5. Vos droits</h2>
      <p>
        Vous disposez d'un droit d'accès, de rectification, d'effacement, de limitation et
        d'opposition, ainsi que d'un droit à la portabilité de vos données. Une partie s'exerce
        directement depuis votre espace : la page « Mon profil » vous permet de corriger vos
        coordonnées, votre secteur, vos disponibilités, de retirer un diplôme ou un poste tant qu'il
        n'a pas été vérifié, et de <strong>supprimer vous-même chacune de vos pièces</strong>.
      </p>
      <p>
        <strong>La suppression du compte, elle, n'est pas automatisée.</strong> Elle se demande par
        courriel et se traite à la main. Nous le disons plutôt que de laisser croire à un bouton qui
        n'existe pas.
      </p>
      <p>
        Pour tout le reste, écrivez à
        <a :href="`mailto:${ADRESSE_CONTACT}`">{{ ADRESSE_CONTACT }}</a
        >. Si la réponse ne vous satisfait pas, vous pouvez saisir l'autorité de contrôle :
        {{ AUTORITE_CONTROLE }}.
      </p>
    </section>

    <section>
      <h2>6. Responsable et destinataires</h2>
      <AppMentions :mentions="DONNEES" />
      <p class="reste">
        <strong>Une base légale doit être attachée à chaque finalité</strong> listée au point 2 —
        exécution du contrat, obligation légale, intérêt légitime ou consentement selon le cas. Elle
        manque encore, et le responsable de traitement ci-dessus relève du jeu de démonstration : ce
        texte décrit fidèlement le fonctionnement technique, il ne constitue pas une information
        complète au sens du RGPD.
      </p>
    </section>

    <p class="revision">Dernière révision : {{ DERNIERE_REVISION }}</p>
  </main>
</template>
