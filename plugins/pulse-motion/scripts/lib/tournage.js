'use strict';
/* Pulse Motion – tournage d'une prise (spec S6, 5.3, 5.4 et 5.7), par étapes (mode D) :
 * - actions réelles dans la page, pilotée par le CDP maison (jamais Playwright) ;
 * - screencast JPEG gardé seulement pendant la réaction à chaque action (images datées par leur instant de peinture,
 *   accusées aussitôt reçues : principe de argo, src/cdp-screencast.ts, MIT, réécrit) ;
 * - capture WebP q90 de chaque état calme (avant, vue, survol, après) ; le pointeur n'est pas filmé : le moteur le dessine ;
 * - page calme : DOM immobile depuis 500 ms, aucune animation finie en cours, aucune requête en cours depuis 500 ms (hors
 *   WebSocket et EventSource), polices et images chargées ; au plus 10 s, puis une alerte ;
 * - tournage local seulement : file://, localhost, 127.0.0.1 et l'appli d'essai ; toute requête vers un autre hôte est
 *   bloquée (Fetch) et comptée ; un site en ligne n'est pas filmé ici (plan 3 de la spec : accord, connexion, flou) ;
 * - liens et formulaires target=_blank, window.open : même onglet ; boîtes de dialogue acceptées, leur texte relevé ;
 * - échec d'une étape : sortie/tournage-echec.webp, textes actionnables proches, prise incomplète supprimée ;
 * - figement : réactions ramenées à la cadence (dernière image peinte avant chaque instant), doublons supprimés (SHA-256),
 *   réactions réencodées en WebP q80 si le gain dépasse 20 %, couleurs des bords (2-moyennes sur 16 × 16, idée de argo,
 *   src/media.ts probeEdgeColors) ; planche sortie/planche-film/<nom>-prise-NN/etape-KK.png (1 280 px).
 *
 * tourner({ projet, nom, accord, navigateur, surEtape, taille, calme }) -> { ok, prise, etapes, duree, poids, alertes, planche }
 *   | { ok: false, besoin: 'accord', site } | { ok: false, erreur, message, etape?, proches? }
 *   taille { largeur, hauteur, echelle, mobile } : remplace la taille de l'appareil (tests) ; calme { attente, max } (ms).
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { ouvrirPage } = require('./cdp.js');
const { optionsTournage } = require('./navigateur.js');
const Pa = require('./parcours.js');
const F = require('./film.js');
const { SCRIPT } = require('./tournage-page.js');
const { servirAppliEssai } = require('./appli-essai.js');
const Pt = require('../../moteur/pointeur.js');
const { paquetsSaisie } = require('../../moteur/lettres.js');

const MONDE = 'pulse-motion';
const CALME = { attente: 500, max: 10000, pas: 100 };
const COUPE = { apres: 1500, garde: 600 };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const LOCAL = /^(file:|data:|blob:|about:)/;

function estLocal(url) {
  if (LOCAL.test(url)) return true;
  try {
    const u = new URL(url);
    return (u.protocol === 'http:' || u.protocol === 'https:') && (['localhost', '127.0.0.1', '[::1]'].includes(u.hostname) || u.hostname.endsWith('.localhost'));
  } catch { return false; }
}

/** Adresse gardée dans film.json : origine et chemin, jamais les paramètres ni le fragment. */
function adresseGardee(url, { projet, essai }) {
  try {
    const u = new URL(url);
    if (essai && url.startsWith(essai)) return `${Pa.ESSAI}${u.pathname}`;
    if (u.protocol === 'file:') {
      const rel = path.relative(path.resolve(projet), require('node:url').fileURLToPath(u)).split(path.sep).join('/');
      return rel.startsWith('..') ? 'fichier' : rel;
    }
    return `${u.origin}${u.pathname}`;
  } catch { return ''; }
}

/** Couleur #rrggbb -> texte. */
const hex = (c) => `#${c.map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('')}`;

// Travail d'images dans Chrome (aucun décodeur JPEG ni WebP dans Node) : réencodage, bords, planche.
const OUTILS_IMAGES = `(function () {
  async function bitmap(b64, mime) { var r = await fetch('data:' + mime + ';base64,' + b64); return createImageBitmap(await r.blob()); }
  function en64(blob) { return new Promise(function (ok) { var f = new FileReader(); f.onload = function () { ok(String(f.result).split(',')[1]); }; f.readAsDataURL(blob); }); }
  window.__pmImages = {
    webp: async function (b64, mime, q) {
      var b = await bitmap(b64, mime); var c = new OffscreenCanvas(b.width, b.height); c.getContext('2d').drawImage(b, 0, 0);
      return en64(await c.convertToBlob({ type: 'image/webp', quality: q }));
    },
    bords: async function (b64, mime) {
      var b = await bitmap(b64, mime); var c = new OffscreenCanvas(16, 16); var x = c.getContext('2d', { willReadFrequently: true });
      x.imageSmoothingQuality = 'high'; x.drawImage(b, 0, 0, 16, 16);
      var d = x.getImageData(0, 0, 16, 16).data, px = [];
      for (var i = 0; i < 16; i++) for (var j = 0; j < 16; j++) if (i === 0 || j === 0 || i === 15 || j === 15) { var k = (i * 16 + j) * 4; px.push([d[k], d[k + 1], d[k + 2]]); }
      var lum = function (p) { return 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]; };
      px.sort(function (a, b) { return lum(a) - lum(b); });
      var c1 = px[0].slice(), c2 = px[px.length - 1].slice(), n1 = 0, n2 = 0;
      for (var it = 0; it < 10; it++) {
        var s1 = [0, 0, 0], s2 = [0, 0, 0]; n1 = 0; n2 = 0;
        px.forEach(function (p) {
          var d1 = Math.pow(p[0] - c1[0], 2) + Math.pow(p[1] - c1[1], 2) + Math.pow(p[2] - c1[2], 2);
          var d2 = Math.pow(p[0] - c2[0], 2) + Math.pow(p[1] - c2[1], 2) + Math.pow(p[2] - c2[2], 2);
          if (d1 <= d2) { s1[0] += p[0]; s1[1] += p[1]; s1[2] += p[2]; n1++; } else { s2[0] += p[0]; s2[1] += p[1]; s2[2] += p[2]; n2++; }
        });
        if (n1) c1 = s1.map(function (v) { return v / n1; });
        if (n2) c2 = s2.map(function (v) { return v / n2; });
      }
      return n1 >= n2 ? [c1, n2 ? c2 : c1] : [c2, c1];
    },
    planche: async function (b64, mime, o) {
      var b = await bitmap(b64, mime); var L = 1280, k = L / b.width, H = Math.round(b.height * k) + 56;
      var c = new OffscreenCanvas(L, H); var x = c.getContext('2d');
      x.fillStyle = '#111'; x.fillRect(0, 0, L, H); x.drawImage(b, 0, 0, L, H - 56);
      var e = L / o.largeur;
      if (o.boite) { x.strokeStyle = '#ff2d55'; x.lineWidth = 3; x.strokeRect(o.boite[0] * e, o.boite[1] * e, o.boite[2] * e, o.boite[3] * e); }
      if (o.point) { x.fillStyle = '#ff2d55'; x.beginPath(); x.arc(o.point[0] * e, o.point[1] * e, 7, 0, 2 * Math.PI); x.fill(); x.strokeStyle = '#fff'; x.lineWidth = 2; x.stroke(); }
      x.fillStyle = '#fff'; x.font = '600 22px system-ui, sans-serif'; x.textBaseline = 'middle'; x.fillText(o.texte, 18, H - 28);
      return en64(await c.convertToBlob({ type: 'image/png' }));
    },
  };
  return true;
})()`;

async function tourner({ projet, nom, accord = false, navigateur, surEtape = () => {}, taille = null, calme = {} }) {
  const debutTournage = Date.now();
  projet = path.resolve(projet);
  const lu = Pa.lireParcours(projet, nom);
  if (!lu.parcours || lu.erreurs.length) return { ok: false, erreur: 'parcours-invalide', message: lu.erreurs.join(' '), erreurs: lu.erreurs };
  const p = lu.parcours;
  // Réseau : jamais un site en ligne dans ce tournage (plan 3 de la spec : accord, connexion, flou).
  const adresses = [p.depart, ...[...(p.preparation || []), ...p.etapes].filter((e) => e.faire === 'aller').map((e) => e.url)];
  for (const a of adresses) {
    const l = Pa.lireAdresse(a, { projet });
    if (l.sorte !== 'en-ligne') continue;
    if (!accord && !(p.accord && p.accord.site === l.site)) return { ok: false, besoin: 'accord', site: l.site };
    return { ok: false, erreur: 'site-en-ligne', site: l.site, message: `Filmer un site en ligne (${l.site}) arrive avec le flou des données personnelles ; pour l'instant, Pulse Motion filme les pages de l'ordinateur (un fichier, localhost) et l'appli d'essai.` };
  }
  if (p.connexion) return { ok: false, erreur: 'connexion', message: 'La connexion à une application arrive avec les sites en ligne ; pour l\'instant, filmer une page qui ne demande pas d\'identifiant.' };
  if (!navigateur) return { ok: false, erreur: 'navigateur', message: 'Chrome ou Edge est introuvable : il en faut un pour filmer.' };

  const appareil = p.appareil || 'ordinateur';
  const T = { ...Pa.TAILLES[appareil], ...(taille || {}) };
  const C = { ...CALME, ...calme };
  const cadence = 30;
  const prise = F.prochainePrise(projet, nom);
  const dossierFilm = F.dossierFilm(projet, nom);
  const temporaire = path.join(dossierFilm, `.${prise}-en-cours`);
  fs.rmSync(temporaire, { recursive: true, force: true });
  fs.mkdirSync(path.join(temporaire, 'images'), { recursive: true });

  let essai = null;
  let page = null;
  const alertes = [];
  const resoudre = (adresse) => {
    const l = Pa.lireAdresse(adresse, { projet });
    if (l.sorte === 'essai') return `${essai.url}${l.chemin}`;
    if (l.sorte === 'fichier') return pathToFileURL(l.chemin).href;
    return l.url;
  };
  try {
    if (adresses.some((a) => Pa.lireAdresse(a, { projet }).sorte === 'essai')) essai = await servirAppliEssai();
    page = await ouvrirPage({ navigateur, largeur: T.largeur, hauteur: T.hauteur, echelle: T.echelle, mobile: T.mobile, base: optionsTournage({}), delai: 30000 });
    const envoyer = page.envoyer;

    // Monde isolé, posé à chaque document ; son contexte suivi par les évènements du protocole.
    const { frameTree } = await envoyer('Page.getFrameTree');
    const cadre = frameTree.frame.id;
    let monde = null;
    page.sur('Runtime.executionContextCreated', (x) => {
      const c = x.context;
      if (c && c.name === MONDE && c.auxData && c.auxData.frameId === cadre) monde = c.id;
    });
    page.sur('Runtime.executionContextsCleared', () => { monde = null; });
    page.sur('Runtime.executionContextDestroyed', (x) => { if (x.executionContextId === monde) monde = null; });
    await envoyer('Runtime.enable');
    await envoyer('Page.addScriptToEvaluateOnNewDocument', { source: SCRIPT, worldName: MONDE });
    await page.envoyerNavigateur('Browser.setDownloadBehavior', { behavior: 'deny' }).catch(() => {});
    await envoyer('Emulation.setLocaleOverride', { locale: 'fr-FR' }).catch(() => {});
    await envoyer('Emulation.setTimezoneOverride', { timezoneId: Intl.DateTimeFormat().resolvedOptions().timeZone }).catch(() => {});
    if (p.apparence === 'claire' || p.apparence === 'sombre') {
      await envoyer('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: p.apparence === 'sombre' ? 'dark' : 'light' }] });
    }
    // Requêtes en cours (page calme) ; réseau hors de l'ordinateur bloqué.
    const enCours = new Set();
    let dernierReseau = Date.now();
    page.sur('Network.requestWillBeSent', (x) => { if (x.type !== 'EventSource' && !/^(data|blob):/.test(x.request.url)) { enCours.add(x.requestId); dernierReseau = Date.now(); } });
    const fini = (x) => { if (enCours.delete(x.requestId)) dernierReseau = Date.now(); };
    page.sur('Network.loadingFinished', fini);
    page.sur('Network.loadingFailed', fini);
    // Document en cours de chargement (navigation) : la page n'est pas calme.
    let chargement = false;
    page.sur('Page.frameStartedLoading', (x) => { if (x.frameId === cadre) { chargement = true; dernierReseau = Date.now(); } });
    page.sur('Page.frameStoppedLoading', (x) => { if (x.frameId === cadre) { chargement = false; dernierReseau = Date.now(); } });
    await envoyer('Network.enable');
    let bloquees = 0;
    page.sur('Fetch.requestPaused', (x) => {
      if (estLocal(x.request.url)) envoyer('Fetch.continueRequest', { requestId: x.requestId }).catch(() => {});
      else { bloquees++; envoyer('Fetch.failRequest', { requestId: x.requestId, errorReason: 'BlockedByClient' }).catch(() => {}); }
    });
    await envoyer('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
    // Boîtes de dialogue : acceptées, leur texte relevé pour l'étape en cours.
    let dialogues = [];
    page.sur('Page.javascriptDialogOpening', (x) => {
      dialogues.push({ type: x.type, message: x.message });
      envoyer('Page.handleJavaScriptDialog', { accept: true, ...(x.type === 'prompt' ? { promptText: x.defaultPrompt || '' } : {}) }).catch(() => {});
    });
    // window.open : l'onglet ouvert est fermé et son adresse ouverte ici.
    const ouverts = new Set();
    const surOnglet = (x) => {
      const i = x.targetInfo;
      if (!i || i.type !== 'page' || i.openerId !== page.cible || !i.url || i.url === 'about:blank' || ouverts.has(i.targetId)) return;
      ouverts.add(i.targetId);
      page.envoyerNavigateur('Target.closeTarget', { targetId: i.targetId }).catch(() => {});
      envoyer('Page.navigate', { url: i.url }).catch(() => {});
    };
    page.sur('Target.targetCreated', surOnglet);
    page.sur('Target.targetInfoChanged', surOnglet);
    await page.envoyerNavigateur('Target.setDiscoverTargets', { discover: true }).catch(() => {});

    async function evaluer(expression) {
      for (let essais = 0; essais < 60; essais++) {
        if (monde === null) {
          try {
            const r = await envoyer('Page.createIsolatedWorld', { frameId: cadre, worldName: MONDE });
            monde = r.executionContextId;
            await envoyer('Runtime.evaluate', { expression: SCRIPT, contextId: monde });
          } catch { await pause(100); continue; }
        }
        try {
          const r = await envoyer('Runtime.evaluate', { expression, contextId: monde, awaitPromise: true, returnByValue: true });
          if (r.exceptionDetails) {
            const d = r.exceptionDetails;
            if (/Cannot find context|__pm is not defined|Execution context was destroyed/.test((d.exception && d.exception.description) || d.text || '')) { monde = null; await pause(100); continue; }
            throw new Error((d.exception && d.exception.description) || d.text || 'erreur dans la page');
          }
          return r.result.value;
        } catch (e) {
          if (/Cannot find context|context|Execution/.test(e.message)) { monde = null; await pause(100); continue; }
          throw e;
        }
      }
      throw new Error('la page filmée ne répond plus');
    }
    const appel = (fn, ...args) => evaluer(`globalThis.__pm.${fn}(${args.map((a) => JSON.stringify(a)).join(',')})`);

    async function attendreCalme(max = C.max) {
      const debut = Date.now();
      while (Date.now() - debut < max) {
        let e = null;
        try { e = await appel('etat'); } catch { e = null; }
        const reseau = !chargement && enCours.size === 0 && Date.now() - dernierReseau >= C.attente;
        if (e && e.mutation >= C.attente && e.animations === 0 && e.polices === 'loaded' && e.images && e.document !== 'loading' && reseau) return true;
        await pause(C.pas);
      }
      return false;
    }

    // Screencast : continu, images gardées seulement pendant un enregistrement ; instant de peinture ramené à l'horloge de
    // Node par l'écart médian entre réception et peinture.
    let enregistrement = null;
    const ecartsHorloge = [];
    page.sur('Page.screencastFrame', (x) => {
      envoyer('Page.screencastFrameAck', { sessionId: x.sessionId }).catch(() => {});
      const recu = Date.now();
      const peint = x.metadata && x.metadata.timestamp ? x.metadata.timestamp * 1000 : recu;
      ecartsHorloge.push(recu - peint);
      if (ecartsHorloge.length > 200) ecartsHorloge.shift();
      if (enregistrement) enregistrement.push({ peint, data: x.data });
    });
    const ecran = { format: 'jpeg', quality: T.echelle > 1 ? 80 : 95, everyNthFrame: 1 };
    await envoyer('Page.startScreencast', ecran);
    // Un nouveau document (lien, formulaire, aller) : le screencast est relancé, sinon il attend la page suivante.
    let tourne = true;
    page.sur('Page.frameNavigated', (x) => { if (tourne && x.frame && x.frame.id === cadre && !x.frame.parentId) envoyer('Page.startScreencast', ecran).catch(() => {}); });
    const enregistrer = () => { enregistrement = []; return Date.now(); };
    const arreter = (t0) => {
      const images = enregistrement || [];
      enregistrement = null;
      const ecart = ecartsHorloge.length ? ecartsHorloge.slice().sort((a, b) => a - b)[Math.floor(ecartsHorloge.length / 2)] : 0;
      return images.map((im) => ({ ms: Math.max(0, im.peint + ecart - t0), data: Buffer.from(im.data, 'base64') })).sort((a, b) => a.ms - b.ms);
    };

    const captures = [];   // { data, sorte: 'calme' | 'reaction', etape }
    const garder = (data, sorte, etape) => { captures.push({ data, sorte, etape }); return captures.length - 1; };
    const capturerCalme = async (etape) => garder(await page.capturer({ format: 'webp', qualite: 90 }), 'calme', etape);

    // Souris (ou doigt sur téléphone et tablette) : la vraie souris passe aussi sur la cible (état de survol filmé).
    let souris = [T.largeur * 0.72, T.hauteur * 0.78];
    async function bouger(vers) {
      if (T.mobile) { souris = vers; return; }
      const de = souris;
      for (let i = 1; i <= 6; i++) {
        const q = i / 6;
        await envoyer('Input.dispatchMouseEvent', { type: 'mouseMoved', x: de[0] + (vers[0] - de[0]) * q, y: de[1] + (vers[1] - de[1]) * q });
        await pause(16);
      }
      souris = vers;
    }
    async function cliquer(point, fois = 1) {
      for (let k = 1; k <= fois; k++) {
        if (T.mobile) {
          await envoyer('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: point[0], y: point[1] }] });
          await pause(90);
          await envoyer('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        } else {
          await envoyer('Input.dispatchMouseEvent', { type: 'mousePressed', x: point[0], y: point[1], button: 'left', buttons: 1, clickCount: k });
          await pause(90);
          await envoyer('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point[0], y: point[1], button: 'left', buttons: 0, clickCount: k });
        }
        if (k < fois) await pause(60);
      }
    }
    const BITS = { Alt: 1, Control: 2, Meta: 4, Shift: 8 };
    async function touche(texte) {
      const t = Pa.lireTouches(texte);
      if (!t) throw new Error(`touche « ${texte} » illisible`);
      const mods = t.modificateurs.reduce((m, x) => m | BITS[x], 0);
      for (const m of t.modificateurs) await envoyer('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: m, code: `${m}Left`, modifiers: mods });
      const texteTouche = t.cle.text && !(mods & (BITS.Control | BITS.Alt | BITS.Meta)) ? t.cle.text : undefined;
      await envoyer('Input.dispatchKeyEvent', { type: texteTouche ? 'keyDown' : 'rawKeyDown', key: t.cle.key, code: t.cle.code, windowsVirtualKeyCode: t.cle.keyCode, modifiers: mods, ...(texteTouche ? { text: texteTouche } : {}) });
      await envoyer('Input.dispatchKeyEvent', { type: 'keyUp', key: t.cle.key, code: t.cle.code, windowsVirtualKeyCode: t.cle.keyCode, modifiers: mods });
      for (const m of t.modificateurs.reverse()) await envoyer('Input.dispatchKeyEvent', { type: 'keyUp', key: m, code: `${m}Left`, modifiers: 0 });
    }
    // Saisie : la même suite de délais que data-lettres="saisie" (paquets à graine), lettre par lettre.
    async function taper(texte, graine) {
      const lettres = Array.from(texte);
      const { delais } = paquetsSaisie(lettres, graine);
      const t0 = Date.now();
      for (let i = 0; i < lettres.length; i++) {
        const attente = delais[i] * 1000 - (Date.now() - t0);
        if (attente > 0) await pause(attente);
        const ch = lettres[i];
        await envoyer('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, text: ch, unmodifiedText: ch });
        await envoyer('Input.dispatchKeyEvent', { type: 'keyUp', key: ch });
      }
    }

    function echec(n, message, proches = []) { const e = new Error(message); e.echec = { etape: n, proches }; return e; }
    async function trouverCible(cible, n) {
      let r = null;
      for (let essai = 0; essai < 4; essai++) {
        r = await appel('trouver', cible);
        if (r.ok || r.raison === 'ambigu') break;
        await pause(300);
      }
      if (r.ok) return r;
      const quoi = Pa.texteCible(cible) || 'la cible';
      if (r.raison === 'ambigu') {
        throw echec(n, `À l'étape ${n}, plusieurs éléments correspondent à « ${quoi} » : ${r.candidats.map((c) => `« ${c.libelle} » (${c.position})`).join(', ')}. Préciser le rang (« le 2ᵉ ») ou le conteneur (« dans la fenêtre »).`, r.candidats.map((c) => c.libelle));
      }
      const vus = r.proches && r.proches.length ? ` Je vois : ${r.proches.map((t) => `« ${t} »`).join(', ')}.` : '';
      throw echec(n, `Je ne trouve pas « ${quoi} » à l'étape ${n}.${vus}`, r.proches || []);
    }

    // Préparation, non filmée.
    await page.aller(resoudre(p.depart));
    if (!(await attendreCalme())) alertes.push('La page de départ ne s\'est pas calmée.');
    let precedente = null;   // indice de la capture de l'état calme courant
    const etapes = [];

    const jouer = async (e, n, filmee) => {
      const fiche = { n, faire: e.faire, dit: e.dit || '', url: '', cible: null, point: null, alertes: [], flous: { auto: 0, cible: 0, apres: 0 } };
      dialogues = [];
      if (filmee && precedente === null) precedente = await capturerCalme(n);
      if (filmee) fiche.avantI = precedente;
      let cible = null;
      const avecCible = e.cible !== undefined || (e.faire === 'defiler' && e.vers !== undefined);
      if (avecCible) {
        cible = await trouverCible(e.cible !== undefined ? e.cible : e.vers, n);
        if (e.faire === 'taper' && cible.motDePasse) throw echec(n, Pa.MESSAGE_MOT_DE_PASSE);
        if (e.faire !== 'defiler' && !cible.entier && !cible.point) {
          // Approche : la cible est amenée au centre, filmée comme une réaction.
          const t0 = enregistrer();
          await appel('amener', cible.id);
          const ok = await attendreCalme();
          if (filmee) {
            fiche.approcheI = arreter(t0);
            fiche.vueI = await capturerCalme(n);
            if (!ok) fiche.alertes.push(`la page ne s'est pas calmée à l'étape ${n}`);
          } else arreter(t0);
          cible.boite = (await appel('boite', cible.id)) || cible.boite;
        }
      }
      const vise = cible ? (cible.point ? [cible.boite[0] + 2, cible.boite[1] + 2] : Pt.pointVise(cible.boite)) : null;
      if (filmee && cible) { fiche.cible = { libelle: cible.libelle, boite: cible.boite }; }
      // Survol : la vraie souris va au point visé ; l'état de survol est filmé.
      const geste = ['cliquer', 'double-cliquer', 'taper', 'vider', 'choisir', 'cocher', 'decocher'].includes(e.faire);
      if (geste && vise) {
        await bouger(vise);
        await attendreCalme(3000);
        if (filmee && !T.mobile) fiche.survolI = await capturerCalme(n);
        fiche.point = vise;
      }
      // Action et réaction.
      const t0 = enregistrer();
      let finAction = t0;
      if (e.faire === 'aller') {
        await page.aller(resoudre(e.url));
      } else if (e.faire === 'cliquer' || e.faire === 'double-cliquer') {
        await cliquer(vise, e.faire === 'double-cliquer' ? 2 : 1);
      } else if (e.faire === 'survoler') {
        await bouger(vise || Pt.pointVise(cible.boite));
        fiche.point = vise || Pt.pointVise(cible.boite);
      } else if (e.faire === 'taper' || e.faire === 'vider') {
        await cliquer(vise);
        await pause(60);
        if (e.faire === 'vider' || e.texte !== undefined) {
          if (e.faire === 'vider') { await touche('Ctrl+A'); await touche('Effacer'); }
        }
        if (e.faire === 'taper') await taper(e.texte, `${p.graine || p.nom}:${n}`);
        if (e.puis) { await pause(120); await touche(e.puis); }
      } else if (e.faire === 'choisir') {
        if (cible.natif) {
          const r = await appel('choisir', cible.id, e.option);
          if (!r.ok) throw echec(n, `À l'étape ${n}, la liste « ${Pa.texteCible(e.cible)} » n'a pas d'option « ${e.option} »${r.libelles ? ` (options : ${r.libelles.map((x) => `« ${x} »`).join(', ')})` : ''}.`, r.libelles || []);
          fiche.options = { libelles: r.libelles, choisie: r.choisie, ...(r.etiquette ? { etiquette: r.etiquette } : {}) };
        } else {
          await cliquer(vise);
          await attendreCalme(3000);
          const o = await trouverCible(e.option, n);
          await cliquer(Pt.pointVise(o.boite));
        }
      } else if (e.faire === 'cocher' || e.faire === 'decocher') {
        const coche = await appel('coche', cible.id);
        if (coche !== (e.faire === 'cocher')) await cliquer(vise);
      } else if (e.faire === 'defiler') {
        const centre = [T.largeur / 2, T.hauteur / 2];
        await bouger(centre);
        let distance = T.hauteur * (e.ecrans || 0);
        if (cible) distance = cible.boite[1] + cible.boite[3] / 2 - T.hauteur / 2;
        if (Math.abs(distance) > 1) await envoyer('Input.synthesizeScrollGesture', { x: centre[0], y: centre[1], yDistance: -Math.round(distance), speed: 800, gestureSourceType: T.mobile ? 'touch' : 'mouse' });
        fiche.point = centre;
      } else if (e.faire === 'touche') {
        await touche(e.touches);
      } else if (e.faire === 'attendre') {
        if (e.texte !== undefined) {
          const debut = Date.now();
          while (!(await appel('texteVisible', e.texte))) {
            if (Date.now() - debut > C.max) throw echec(n, `À l'étape ${n}, « ${e.texte} » ne s'est pas affiché en ${Math.round(C.max / 1000)} s.`, await appel('proches', e.texte));
            await pause(C.pas);
          }
        } else await pause(e.secondes * 1000);
      }
      finAction = Date.now();
      const ok = await attendreCalme();
      const images = arreter(t0);
      if (!filmee) return null;
      if (cible && e.faire === 'defiler') fiche.cible = { libelle: cible.libelle, boite: (await appel('boite', cible.id)) || cible.boite };
      if (!ok) { fiche.alertes.push(`la page ne s'est pas calmée à l'étape ${n}`); alertes.push(`La page ne s'est pas calmée à l'étape ${n}.`); }
      const apresI = await capturerCalme(n);
      // Images gardées : aller sans « montrer » n'en garde aucune (fondu) ; une attente de plus de 1,5 s après l'action,
      // seulement ses 0,6 premières secondes (le reste est une coupe).
      const total = images.length ? images[images.length - 1].ms : 0;
      const attenteApres = Date.now() - finAction;
      let gardees = images;
      fiche.coupes = [];
      if (e.faire === 'aller' && e.montrer !== 'chargement') { gardees = []; if (total > 0) fiche.coupes.push([0, Math.round(total)]); } else if (attenteApres > COUPE.apres || e.faire === 'aller') {
        const limite = finAction - t0 + COUPE.garde;
        gardees = images.filter((im) => im.ms <= limite);
        if (total > limite) fiche.coupes.push([Math.round(limite), Math.round(total)]);
      }
      fiche.reactionI = gardees;
      fiche.apresI = apresI;
      if (dialogues.length) fiche.dialogue = dialogues[0];
      fiche.url = adresseGardee((await evaluer('location.href')) || '', { projet, essai: essai && essai.url });
      precedente = apresI;
      return fiche;
    };

    for (const [i, e] of (p.preparation || []).entries()) {
      try { await jouer(e, i + 1, false); } catch (err) {
        if (err.echec) err.echec.preparation = true;
        throw err;
      }
    }
    for (const [i, e] of p.etapes.entries()) {
      surEtape({ etape: i + 1, sur: p.etapes.length, quoi: Pa.phraseEtape(e) });
      etapes.push(await jouer(e, i + 1, true));
    }
    tourne = false;
    await envoyer('Page.stopScreencast').catch(() => {});
    if (bloquees) alertes.push(`La page a voulu joindre internet : ${bloquees} requête${bloquees > 1 ? 's' : ''} bloquée${bloquees > 1 ? 's' : ''} (le tournage reste sur l'ordinateur).`);

    // Figement, dans le même navigateur (page vide) : cadence, doublons, WebP, bords, planche.
    await envoyer('Fetch.disable').catch(() => {});
    await page.aller('about:blank');
    await page.evaluer(OUTILS_IMAGES);
    const fichiers = new Map();   // sha -> nom
    let nCalmes = 0;
    // Une image identique à une autre (SHA-256 des octets écrits, ou de la capture d'origine) n'est écrite qu'une fois.
    const ecrites = new Map();   // sha des octets écrits -> nom
    const ecrireImage = (octets, nom) => {
      const h = sha(octets);
      if (ecrites.has(h)) return { nom: ecrites.get(h), nouveau: false };
      fs.writeFileSync(path.join(temporaire, 'images', nom()), octets);
      ecrites.set(h, nom());
      return { nom: nom(), nouveau: true };
    };
    const calmeNom = (i) => {
      const r = ecrireImage(captures[i].data, () => `${String(nCalmes + 1).padStart(4, '0')}.webp`);
      if (r.nouveau) nCalmes++;
      return r.nom;
    };
    // Réaction : WebP q80 si le gain dépasse 20 % ; la capture d'origine garde le nom de l'image écrite.
    const nomReaction = async (data, nomSansExt) => {
      const h = sha(data);
      if (fichiers.has(h)) return { nom: fichiers.get(h), nouveau: false };
      const webp = Buffer.from(await page.evaluer(`window.__pmImages.webp(${JSON.stringify(data.toString('base64'))}, 'image/jpeg', 0.8)`), 'base64');
      const enWebp = webp.length < 0.8 * data.length;
      const r = ecrireImage(enWebp ? webp : data, () => `${nomSansExt}.${enWebp ? 'webp' : 'jpg'}`);
      fichiers.set(h, r.nom);
      return r;
    };
    const versCadence = async (images, prefixe) => {
      if (!images.length) return [];
      const r = [];
      const fin = images[images.length - 1].ms;
      let j = -1;
      let rang = 0;
      // Jusqu'au premier instant qui suit la dernière image peinte (elle doit être montrée).
      for (let k = 0; k * 1000 / cadence < fin + 1000 / cadence - 1e-6; k++) {
        const t = k * 1000 / cadence;
        while (j + 1 < images.length && images[j + 1].ms <= t + 1e-6) j++;
        if (j < 0) continue;
        const { nom: nomImage, nouveau } = await nomReaction(images[j].data, `${prefixe}-${String(rang + 1).padStart(4, '0')}`);
        if (nouveau) rang++;
        if (r.length && r[r.length - 1][1] === nomImage) continue;
        r.push([Math.round(t), nomImage]);
      }
      return r;
    };
    const filmEtapes = [];
    for (const f of etapes) {
      const k = String(f.n).padStart(2, '0');
      const e = { n: f.n, faire: f.faire, dit: f.dit, url: f.url, cible: f.cible, point: f.point ? f.point.map((x) => Math.round(x * 100) / 100) : null };
      e.avant = calmeNom(f.avantI);
      if (f.approcheI) { e.approche = await versCadence(f.approcheI, `a${k}`); e.vue = calmeNom(f.vueI); }
      if (f.survolI !== undefined) e.survol = calmeNom(f.survolI);
      e.reaction = await versCadence(f.reactionI, `r${k}`);
      e.coupes = f.coupes;
      e.apres = calmeNom(f.apresI);
      if (f.options) e.options = f.options;
      if (f.dialogue) e.dialogue = f.dialogue;
      e.flous = f.flous;
      e.alertes = f.alertes;
      filmEtapes.push(e);
    }
    const premiere = captures[etapes[0].avantI].data;
    const bords = (await page.evaluer(`window.__pmImages.bords(${JSON.stringify(premiere.toString('base64'))}, 'image/webp')`)).map(hex);
    const film = {
      version: F.VERSION, source: 'tournage', date: new Date().toISOString(), navigateur: await page.version(), appareil,
      largeur: T.largeur, hauteur: T.hauteur, echelle: T.echelle, cadence, bords, etapes: filmEtapes, alertes,
      duree: Math.round((Date.now() - debutTournage) / 100) / 10,
    };
    film.poids = F.poidsPrise(temporaire);
    fs.writeFileSync(path.join(temporaire, 'film.json'), `${JSON.stringify(film, null, 2)}\n`, 'utf8');
    // Planche : l'image avant l'action, la cible et le point visé, le compte des zones floutées.
    const planche = path.join(projet, 'sortie', 'planche-film', `${nom}-${prise}`);
    fs.rmSync(planche, { recursive: true, force: true });
    fs.mkdirSync(planche, { recursive: true });
    for (const [i, e] of filmEtapes.entries()) {
      const source = e.survol || e.vue || e.avant;
      const data = fs.readFileSync(path.join(temporaire, 'images', source));
      const mime = source.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
      const flous = e.flous.auto + e.flous.cible + e.flous.apres;
      const texte = `Étape ${e.n} · ${Pa.phraseEtape(p.etapes[i])} · zones floutées : ${flous}`;
      const png = await page.evaluer(`window.__pmImages.planche(${JSON.stringify(data.toString('base64'))}, '${mime}', ${JSON.stringify({ largeur: T.largeur, boite: e.cible && e.cible.boite, point: e.point, texte })})`);
      fs.writeFileSync(path.join(planche, `etape-${String(e.n).padStart(2, '0')}.png`), Buffer.from(png, 'base64'));
    }
    await page.fermer();
    page = null;
    const dossierPrise = path.join(dossierFilm, prise);
    fs.renameSync(temporaire, dossierPrise);
    return { ok: true, prise, etapes: filmEtapes.length, duree: film.duree, poids: film.poids, alertes, planche: path.relative(projet, planche).split(path.sep).join('/') };
  } catch (e) {
    let resultat;
    if (e.echec) {
      // Échec d'une étape : état de la page gardé dans sortie/tournage-echec.webp ; la prise incomplète est supprimée.
      let image = null;
      try {
        if (page) {
          const octets = await page.capturer({ format: 'webp', qualite: 90 });
          fs.mkdirSync(path.join(projet, 'sortie'), { recursive: true });
          image = path.join(projet, 'sortie', 'tournage-echec.webp');
          fs.writeFileSync(image, octets);
        }
      } catch { /* capture impossible : le message suffit */ }
      resultat = { ok: false, erreur: 'etape', etape: e.echec.etape, ...(e.echec.preparation ? { preparation: true } : {}), message: e.message, proches: e.echec.proches,
        image: image && path.relative(projet, image).split(path.sep).join('/'),
        rappel: 'Les actions déjà faites dans l\'application ne sont pas annulées.' };
    } else resultat = { ok: false, erreur: 'tournage', message: `Le tournage s'est arrêté : ${e.message}` };
    fs.rmSync(temporaire, { recursive: true, force: true });
    return resultat;
  } finally {
    if (page) await page.fermer().catch(() => {});
    if (essai) await essai.fermer().catch(() => {});
    fs.rmSync(temporaire, { recursive: true, force: true });
  }
}

module.exports = { tourner, estLocal, adresseGardee, CALME, COUPE };
