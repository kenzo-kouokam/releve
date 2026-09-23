import { COMPTE_TWITTER, IMAGE_PARTAGE } from '~/data/vitrine';

/** Ce qui change d'une page a l'autre. Le reste est invariant sur tout le site. */
export interface PartagePage {
  titre: string;
  description: string;
}

/**
 * Balises Open Graph et Twitter Card, qui commandent l'apercu d'un lien.
 *
 * Elles ne pesent pas sur le classement : aucun moteur ne les lit pour
 * ranger une page. Elles decident de ce que voit quelqu'un a qui on envoie
 * l'adresse — sur Facebook, LinkedIn, X, WhatsApp, Slack, iMessage. Sans
 * elles, le lien s'affiche nu, et un lien nu se clique beaucoup moins.
 *
 * Meme decoupage que les donnees structurees, et pour la meme raison : le
 * gabarit pose ce qui est vrai de tout le site — le nom, la langue, l'image,
 * le compte X, l'adresse de la page —, chaque page pose son titre et sa
 * description. C'est `usePartageSocialPage` que les pages appellent.
 *
 * Open Graph s'ecrit en `property`, pas en `name` : c'est la seule difference
 * de forme entre les deux familles, et une balise Open Graph declaree en `name`
 * est ignoree par Facebook.
 */
export function usePartageSocialSite(chemin: MaybeRefOrGetter<string>): void {
  const site = useUrlSite();

  useHead(() => {
    const adresse = urlAbsolue(site, toValue(chemin));
    const image = IMAGE_PARTAGE.startsWith('http')
      ? IMAGE_PARTAGE
      : urlAbsolue(site, IMAGE_PARTAGE);

    return {
      meta: [
        { property: 'og:type', content: 'website' },
        { property: 'og:site_name', content: 'Relève' },
        { property: 'og:locale', content: 'fr_FR' },
        { property: 'og:url', content: adresse },
        { property: 'og:image', content: image },
        // Le texte alternatif n'est pas decoratif ici : c'est ce que lit a voix
        // haute le lecteur d'ecran de quelqu'un a qui on partage le lien.
        { property: 'og:image:alt', content: "Relève, agence d'intérim du soin" },

        // `summary_large_image` affiche la vignette en pleine largeur. L'autre
        // valeur possible, `summary`, la reduit a un carre de la taille d'une
        // icone — beaucoup moins visible dans un fil.
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:image', content: image },
        // Redondante — X lit `og:url` — mais elle ne coute rien et rend la
        // famille `twitter:` lisible d'un bloc sans avoir a sauter au-dessus.
        { name: 'twitter:url', content: adresse },
        // Omise si le compte n'est pas renseigne : une attribution vers un
        // compte qui n'est pas le notre vaut moins que pas d'attribution.
        ...(COMPTE_TWITTER ? [{ name: 'twitter:creator', content: COMPTE_TWITTER }] : []),
      ],
    };
  });
}

/**
 * Le titre et la description de la page courante, pour l'apercu.
 *
 * A appeler avec les memes chaines que `useHead` — d'ou les constantes en tete
 * de chaque page. Ecrites deux fois a la main, elles finiraient par diverger,
 * et l'apercu partage annoncerait autre chose que la page ouverte.
 *
 * `twitter:title` et `twitter:description` reprennent les valeurs d'Open Graph
 * et ne sont donc pas strictement necessaires — X retombe sur `og:` en leur
 * absence. Elles sont posees quand meme : c'est ce qui permet, le jour ou une
 * page voudra un titre plus court pour la vignette que pour l'onglet, de le
 * changer a un seul endroit.
 */
export function usePartageSocialPage(page: MaybeRefOrGetter<PartagePage>): void {
  useHead(() => {
    const { titre, description } = toValue(page);

    return {
      meta: [
        { property: 'og:title', content: titre },
        { property: 'og:description', content: description },
        { name: 'twitter:title', content: titre },
        { name: 'twitter:description', content: description },
      ],
    };
  });
}
