/**
 * Sonde de mise en page : mesure le debordement horizontal reel d'une page, a
 * une largeur donnee, et nomme les elements qui en sont la cause.
 *
 * Pourquoi elle existe : une capture prise avec le seul `--window-size` **ment**.
 * Sans emulation de viewport, Chrome rend la page a 980 px puis rogne l'image a
 * la largeur demandee — tout parait alors deborder, y compris ce qui va tres
 * bien. C'est exactement le diagnostic que cette sonde a corrige.
 *
 *   pnpm dev            # le serveur doit tourner
 *   node frontend/scripts/sonde-responsive.mjs sorties 390 844 /accueil /offres
 *
 * Chrome est pilote par CDP, sans dependance : Node 22 a WebSocket en global.
 * Les captures sont ecrites dans le dossier de sortie, qui n'a pas a etre
 * versionne.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as attendre } from 'node:timers/promises';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9223;
const SORTIE = process.argv[2] ?? 'captures';
const LARGEUR = Number(process.argv[3] ?? 390);
const HAUTEUR = Number(process.argv[4] ?? 844);
const PAGES = process.argv.slice(5);

mkdirSync(SORTIE, { recursive: true });

/** Chrome deja lance sur le port ? On le reprend plutot que d'en ouvrir un second. */
async function dejaLa() {
  try {
    await fetch(`http://127.0.0.1:${PORT}/json/version`);

    return true;
  } catch {
    return false;
  }
}

const chrome = (await dejaLa())
  ? null
  : spawn(
      CHROME,
      [
        '--headless=new',
        '--disable-gpu',
        '--hide-scrollbars',
        '--no-first-run',
        '--no-default-browser-check',
        `--remote-debugging-port=${PORT}`,
        `--user-data-dir=${SORTIE}/profil-sonde`,
        'about:blank',
      ],
      { stdio: 'ignore' },
    );

async function cible() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const liste = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = liste.find((t) => t.type === 'page');

      if (page) {
        return page.webSocketDebuggerUrl;
      }
    } catch {
      /* pas encore la */
    }

    await attendre(500);
  }

  throw new Error('Chrome ne repond pas sur le port de debogage');
}

const ws = new WebSocket(await cible());
await new Promise((ok) => ws.addEventListener('open', ok, { once: true }));

let numero = 0;
const attentes = new Map();

ws.addEventListener('message', (evenement) => {
  const message = JSON.parse(evenement.data);

  if (message.id && attentes.has(message.id)) {
    attentes.get(message.id)(message.result ?? {});
    attentes.delete(message.id);
  }
});

function envoyer(method, params = {}) {
  numero += 1;
  const id = numero;

  return new Promise((ok) => {
    attentes.set(id, ok);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

/**
 * Ce que la sonde cherche : tout element dont le bord droit depasse la largeur
 * du document, en ne gardant que les plus proches de la racine — un enfant
 * deborde presque toujours parce que son parent deborde, et lister les deux
 * noierait la cause sous ses consequences.
 */
const MESURE = `(() => {
  const vue = document.documentElement.clientWidth;
  const coupables = [];

  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    if (r.right <= vue + 1 && r.left >= -1) continue;
    coupables.push({ el, r });
  }

  const racines = coupables.filter(({ el }) =>
    !coupables.some(({ el: autre }) => autre !== el && autre.contains(el)),
  );

  const decrire = ({ el, r }) => ({
    balise: el.tagName.toLowerCase(),
    classe: (el.getAttribute('class') ?? '').slice(0, 60),
    texte: (el.textContent ?? '').trim().replace(/\\s+/g, ' ').slice(0, 45),
    gauche: Math.round(r.left),
    droite: Math.round(r.right),
    largeur: Math.round(r.width),
  });

  /*
   * La gouttiere que le contenu laisse reellement.
   *
   * Mesurer le seul debordement ne suffisait pas : une page dont le texte
   * touche les deux bords ne deborde pas, elle est juste illisible. Le defaut
   * est reste invisible pour cette sonde jusqu'a ce qu'on le voie a l'oeil sur
   * une capture — d'ou cette mesure.
   */
  // Le \`<main>\` de la coque enveloppe celui de la page : il est pleine largeur
  // et sans rembourrage, et le prendre rendait zero partout. On vise donc la
  // colonne de la page, puis, a defaut, le \`<main>\` le plus profond.
  const contenu =
    document.querySelector('.vitrine, .contenu-app') ??
    [...document.querySelectorAll('main')].at(-1) ??
    [...document.querySelectorAll('body section, body div')].find(
      (el) => el.getBoundingClientRect().width > vue * 0.7,
    );

  // La boite de bordure occupe souvent toute la largeur : c'est son
  // rembourrage qui fait la gouttiere. La mesurer sans lui rendrait zero
  // partout, y compris la ou tout va bien.
  const boite = contenu?.getBoundingClientRect();
  const dedans = contenu ? getComputedStyle(contenu) : null;
  const rembourrage = (valeur) => (dedans ? Number.parseFloat(valeur) || 0 : 0);

  return {
    vue,
    documentScrollWidth: document.documentElement.scrollWidth,
    corpsScrollWidth: document.body.scrollWidth,
    debordement: Math.max(0, document.documentElement.scrollWidth - vue),
    gouttiereGauche: boite ? Math.round(boite.left + rembourrage(dedans.paddingLeft)) : null,
    gouttiereDroite: boite
      ? Math.round(vue - boite.right + rembourrage(dedans.paddingRight))
      : null,
    coupables: racines.slice(0, 8).map(decrire),
  };
})()`;

await envoyer('Page.enable');

// Le profil du navigateur garde les cookies d'une execution precedente : sans
// cette remise a zero, une session ouverte hier ferait mesurer la coque
// connectee la ou on croit mesurer la vitrine publique. Le cas s'est produit.
await envoyer('Network.enable');
await envoyer('Network.clearBrowserCookies');

await envoyer('Emulation.setDeviceMetricsOverride', {
  width: LARGEUR,
  height: HAUTEUR,
  deviceScaleFactor: 1,
  mobile: true,
});

const rapport = [];

for (const chemin of PAGES) {
  const url = `http://[::1]:3000${chemin}`;

  await envoyer('Page.navigate', { url });
  await attendre(3500);

  const { result } = await envoyer('Runtime.evaluate', {
    expression: MESURE,
    returnByValue: true,
  });

  const nom = chemin.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'racine';
  const { data } = await envoyer('Page.captureScreenshot', { format: 'png' });

  if (data) {
    writeFileSync(`${SORTIE}/${nom}-${LARGEUR}.png`, Buffer.from(data, 'base64'));
  }

  rapport.push({ chemin, ...result.value });
}

for (const page of rapport) {
  const etat = page.debordement > 0 ? `DEBORDE de ${page.debordement}px` : 'ok';
  const marges = `gouttieres ${page.gouttiereGauche}/${page.gouttiereDroite}px`;

  console.log(`\n${page.chemin}  (vue ${page.vue}px)  ->  ${etat}, ${marges}`);

  for (const c of page.coupables ?? []) {
    console.log(
      `   ${c.balise}.${c.classe || '(sans classe)'}  [${c.gauche} -> ${c.droite}, l=${c.largeur}]  « ${c.texte} »`,
    );
  }
}

ws.close();
chrome?.kill();
process.exit(0);
