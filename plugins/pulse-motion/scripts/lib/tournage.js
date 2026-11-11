'use strict';
/* Pulse Motion – tournage d'une prise (spec S6, 5.3, 5.4 et 5.7), par étapes (mode D) :
 * - actions réelles dans la page, pilotée par le CDP maison (jamais Playwright) ;
 * - screencast JPEG gardé seulement pendant la réaction à chaque action (images datées par leur instant de peinture,
 *   accusées aussitôt reçues : principe de argo, src/cdp-screencast.ts, MIT, réécrit) ;
 * - capture WebP q90 de chaque état calme (avant, vue, survol, après) ; le pointeur n'est pas filmé : le moteur le dessine ;
 * - page calme : DOM immobile depuis 500 ms, aucune animation finie en cours, aucune requête en cours depuis 500 ms (hors
 *   WebSocket et EventSource), polices et images chargées ; au plus 10 s, puis une alerte ;
 * - réseau (plan 3 de la spec, 5.4) : file://, localhost, 127.0.0.1 et l'appli d'essai sans accord ; un site en ligne
 *   seulement après l'accord de la personne (--accord, écrit dans parcours.accord : les prises suivantes de ce site passent
 *   sans redemander), un seul site par parcours. Tournage local : toute requête vers un autre hôte est bloquée (Fetch) et
 *   comptée. Site en ligne : les ressources de la page passent ; une navigation de la page vers un autre site est bloquée ;
 * - profil du navigateur d'un site en ligne sous ~/.pulse-motion/navigateur/<site>/ (lib/connexions.js : gestionnaire de
 *   mots de passe et saisie automatique coupés), jamais dans le projet ; local : profil temporaire ;
 * - connexion (5.5) : fenêtre visible sur la page de départ, { attente: 'connexion' } sur la progression, puis la prise
 *   reprend dans la même fenêtre et le même processus quand films/<nom>/.continuer apparaît (filmer continuer), 15 min au
 *   plus ; une page qui redemande l'identifiant (cible de la première étape introuvable, mot de passe visible) rend
 *   { besoin: 'connexion' } ; rien n'est filmé ni lu pendant que la personne se connecte ;
 * - flou des données personnelles (5.6) : posé dans la page filmée par le monde isolé (lib/tournage-page.js), donc dans les
 *   pixels de toutes les images avant leur écriture ; défilement sur le fil principal (--disable-threaded-scrolling), pour
 *   que les voiles suivent au pixel près ; flou vérifié au lancement (sinon : masque opaque et une alerte) ; zones comptées
 *   par étape (flous) ; textes reconnus comme personnels masqués dans film.json et la progression ;
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
const { scriptAvec } = require('./tournage-page.js');
const FL = require('./flou.js');
const { profilSite } = require('./connexions.js');
const { decoder: decoderPng } = require('./png.js');
const { servirAppliEssai } = require('./appli-essai.js');
const Pt = require('../../moteur/pointeur.js');
const { paquetsSaisie } = require('../../moteur/lettres.js');

const MONDE = 'pulse-motion';
const CALME = { attente: 500, max: 10000, pas: 100 };
const COUPE = { apres: 1500, garde: 600 };
const CONNEXION = 15 * 60 * 1000;
const masquer = (t) => FL.masquerTexte(t);
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
function adresseGardee(url, { projet, essai, domaine = null }) {
  try {
    const u = new URL(url);
    if (!/^(https?|file):$/.test(u.protocol)) return '';
    // Une page hors du site accordé (navigation bloquée) : son adresse n'est pas gardée.
    const h = u.hostname.toLowerCase();
    if (domaine && /^https?:$/.test(u.protocol) && !estLocal(url) && h !== domaine && !h.endsWith(`.${domaine}`)) return '';
    if (essai && url.startsWith(essai)) return `${Pa.ESSAI}${u.pathname}`;
    if (u.protocol === 'file:') {
      const rel = path.relative(path.resolve(projet), require('node:url').fileURLToPath(u)).split(path.sep).join('/');
      return rel.startsWith('..') ? 'fichier' : rel;
    }
    return masquer(`${u.origin}${u.pathname}`);
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

/** Le flou par backdrop-filter est-il dessiné par ce navigateur ? Des rayures nettes sous un voile : leur contraste doit
 *  tomber. Sinon, les zones sont masquées (pastille opaque) plutôt que laissées lisibles. */
async function flouDessine(page) {
  await page.evaluer(`(function () {
    document.body.style.margin = '0';
    document.body.innerHTML = '<div style="position:absolute;left:0;top:0;width:240px;height:60px;background:repeating-linear-gradient(90deg,#000 0 3px,#fff 3px 6px)"></div>'
      + '<div style="position:absolute;left:120px;top:0;width:120px;height:60px;backdrop-filter:blur(10px);background:rgb(128 128 128 / .15)"></div>';
    return new Promise(function (ok) { requestAnimationFrame(function () { requestAnimationFrame(function () { ok(true); }); }); });
  })()`);
  const png = decoderPng(await page.capturer({ format: 'png', zone: { x: 0, y: 10, largeur: 240, hauteur: 40 }, echelle: 1 }));
  const ecart = (x0, x1) => {
    const v = [];
    for (let y = 10; y < png.hauteur - 10; y++) for (let x = x0; x < x1; x++) v.push(png.donnees[(y * png.largeur + x) * png.canaux]);
    const m = v.reduce((a, b) => a + b, 0) / v.length;
    return Math.sqrt(v.reduce((a, b) => a + (b - m) * (b - m), 0) / v.length);
  };
  const net = ecart(Math.round(png.largeur * 0.08), Math.round(png.largeur * 0.42));
  const floute = ecart(Math.round(png.largeur * 0.6), Math.round(png.largeur * 0.92));
  return net > 40 && floute < net * 0.25;
}

const MIMES = { '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png' };

/** Planche d'une prise filmée : sortie/planche-film/<nom>-<prise>/etape-KK.png (1 280 px), l'image d'avant l'action avec
 *  la boîte de la cible, le point visé et le compte des zones floutées. page : Chrome, OUTILS_IMAGES posés. -> chemin. */
async function ecrirePlanche(page, { projet, nom, prise, film, dossier, phrases = [] }) {
  const planche = path.join(projet, 'sortie', 'planche-film', `${nom}-${prise}`);
  fs.rmSync(planche, { recursive: true, force: true });
  fs.mkdirSync(planche, { recursive: true });
  for (const [i, e] of film.etapes.entries()) {
    const source = e.survol || e.vue || e.avant;
    const octets = fs.readFileSync(path.join(dossier, 'images', source));
    const mime = MIMES[path.extname(source)] || 'image/jpeg';
    const f = e.flous || { auto: 0, cible: 0, apres: 0 };
    const texte = masquer(`Étape ${e.n} · ${phrases[i] || e.faire} · zones floutées : ${f.auto + f.cible + (f.apres || 0)}`);
    const png = await page.evaluer(`window.__pmImages.planche(${JSON.stringify(octets.toString('base64'))}, '${mime}', ${JSON.stringify({ largeur: film.largeur, boite: e.cible && e.cible.boite, point: e.point, texte })})`);
    fs.writeFileSync(path.join(planche, `etape-${String(e.n).padStart(2, '0')}.png`), Buffer.from(png, 'base64'));
  }
  return planche;
}

async function tourner({ projet, nom, accord = false, navigateur, surEtape = () => {}, taille = null, calme = {}, fenetre, delaiConnexion = CONNEXION, personne = null, resolutions = null }) {
  const debutTournage = Date.now();
  projet = path.resolve(projet);
  const lu = Pa.lireParcours(projet, nom);
  if (!lu.parcours || lu.erreurs.length) return { ok: false, erreur: 'parcours-invalide', message: lu.erreurs.join(' '), erreurs: lu.erreurs };
  const p = lu.parcours;
  if (p.import !== undefined) return { ok: false, erreur: 'import', message: `Le film « ${nom} » vient d'une vidéo importée : il ne se tourne pas (l'importer de nouveau pour une autre prise).` };
  // Réseau : un site en ligne seulement après l'accord de la personne, pour ce site (5.4).
  const site = Pa.sitesEnLigne(p, { projet })[0] || null;
  const domaine = site ? Pa.domaineDe(site) : null;
  if (site) {
    const dejaAccorde = p.accord && Pa.domaineDe(p.accord.site) === domaine;
    if (!accord && !dejaAccorde) return { ok: false, besoin: 'accord', site };
    if (!dejaAccorde) F.ecrireParcours(projet, nom, (x) => { x.accord = { site, date: new Date().toISOString().slice(0, 10) }; });
  }
  if (!navigateur) return { ok: false, erreur: 'navigateur', message: 'Chrome ou Edge est introuvable : il en faut un pour filmer.' };
  const visible = fenetre !== undefined ? !!fenetre : !!p.connexion;
  const reglageFlou = FL.lireFlou(p.flou);
  const adresses = [p.depart, ...[...(p.preparation || []), ...p.etapes].filter((e) => e.faire === 'aller').map((e) => e.url)];

  const appareil = p.appareil || 'ordinateur';
  const T = { ...Pa.TAILLES[appareil], ...(taille || {}) };
  const C = { ...CALME, ...calme };
  const cadence = 30;
  const prise = F.prochainePrise(projet, nom);
  const dossierFilm = F.dossierFilm(projet, nom);
  const temporaire = path.join(dossierFilm, `.${prise}-en-cours`);
  const signal = path.join(dossierFilm, '.continuer');
  fs.rmSync(signal, { force: true });
  fs.rmSync(temporaire, { recursive: true, force: true });
  fs.mkdirSync(path.join(temporaire, 'images'), { recursive: true });

  let essai = null;
  let page = null;
  let motDePasseVisible = async () => false;
  const alertes = [];
  const resoudre = (adresse) => {
    const l = Pa.lireAdresse(adresse, { projet });
    if (l.sorte === 'essai') return `${essai.url}${l.chemin}`;
    if (l.sorte === 'fichier') return pathToFileURL(l.chemin).href;
    return l.url;
  };
  try {
    if (adresses.some((a) => Pa.lireAdresse(a, { projet }).sorte === 'essai')) essai = await servirAppliEssai();
    // Défilement sur le fil principal : les voiles du flou sont recalés avant chaque peinture, défilement compris.
    const options = ['--disable-threaded-scrolling', '--hide-crash-restore-bubble'];
    if (resolutions) options.push(`--host-resolver-rules=${Object.entries(resolutions).map(([h, ip]) => `MAP ${h} ${ip}`).join(', ')}`);
    page = await ouvrirPage({ navigateur, largeur: T.largeur, hauteur: T.hauteur, echelle: T.echelle, mobile: T.mobile, base: optionsTournage({ fenetre: visible }),
      fenetre: visible, profil: site ? profilSite(site) : null, options, delai: 30000 });
    const envoyer = page.envoyer;
    if (reglageFlou.mode === 'flou' && !(await flouDessine(page))) {
      reglageFlou.mode = 'masque';
      alertes.push('Ce navigateur ne dessine pas le flou : les données personnelles sont masquées par une pastille grise.');
    }
    const SCRIPT = scriptAvec({ flou: { ...(p.flou || {}), mode: reglageFlou.mode } });

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
    // Requête -> document qui l'a lancée : un document remplacé (redirection dès l'en-tête) ne rend pas toujours ses requêtes
    // annulées ; elles sont oubliées quand la page change de document.
    const enCours = new Map();
    let dernierReseau = Date.now();
    page.sur('Network.requestWillBeSent', (x) => { if (x.type !== 'EventSource' && !/^(data|blob):/.test(x.request.url)) { enCours.set(x.requestId, x.loaderId); dernierReseau = Date.now(); } });
    page.sur('Page.frameNavigated', (x) => {
      if (!x.frame || x.frame.parentId || x.frame.id !== cadre) return;
      for (const [id, chargeur] of enCours) if (chargeur && chargeur !== x.frame.loaderId) enCours.delete(id);
    });
    const fini = (x) => { if (enCours.delete(x.requestId)) dernierReseau = Date.now(); };
    page.sur('Network.loadingFinished', fini);
    page.sur('Network.loadingFailed', fini);
    // Document en cours de chargement (navigation) : la page n'est pas calme.
    let chargement = false;
    page.sur('Page.frameStartedLoading', (x) => { if (x.frameId === cadre) { chargement = true; dernierReseau = Date.now(); } });
    page.sur('Page.frameStoppedLoading', (x) => { if (x.frameId === cadre) { chargement = false; dernierReseau = Date.now(); } });
    await envoyer('Network.enable');
    let bloquees = 0;
    const ailleurs = new Set();
    let libre = false;   // pendant la connexion : la personne navigue elle-même (authentification sur un autre site comprise)
    const dansSite = (url) => { try { const h = new URL(url).hostname.toLowerCase(); return h === domaine || h.endsWith(`.${domaine}`); } catch { return false; } };
    page.sur('Fetch.requestPaused', (x) => {
      const url = x.request.url;
      let permis = estLocal(url);
      if (!permis && domaine) {
        // Site en ligne accordé : ses ressources passent (comme dans tout navigateur) ; la page ne quitte pas le site.
        const navigation = x.resourceType === 'Document' && x.frameId === cadre;
        permis = libre || !navigation || dansSite(url);
        if (!permis) { try { ailleurs.add(new URL(url).hostname); } catch { /* adresse illisible */ } }
      }
      if (permis) envoyer('Fetch.continueRequest', { requestId: x.requestId }).catch(() => {});
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
    motDePasseVisible = async () => { try { return !!(await appel('motDePasseVisible')); } catch { return false; } };

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
    // Zones floutées par étape : le plus grand nombre vu dans ses états calmes (le texte reconnu n'est jamais gardé).
    const flous = {};
    const capturerCalme = async (etape) => {
      let c = null;
      try { c = await appel('flouPret'); } catch { c = null; }
      if (c) { const f = flous[etape] || (flous[etape] = { auto: 0, cible: 0 }); f.auto = Math.max(f.auto, c.auto); f.cible = Math.max(f.cible, c.cible); }
      return garder(await page.capturer({ format: 'webp', qualite: 90 }), 'calme', etape);
    };

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
        throw Object.assign(echec(n, `À l'étape ${n}, plusieurs éléments correspondent à « ${quoi} » : ${r.candidats.map((c) => `« ${c.libelle} » (${c.position})`).join(', ')}. Préciser le rang (« le 2ᵉ ») ou le conteneur (« dans la fenêtre »).`, r.candidats.map((c) => c.libelle)), { ambigu: true });
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
      const fiche = { n, faire: e.faire, dit: masquer(e.dit || ''), url: '', cible: null, point: null, alertes: [], flous: { auto: 0, cible: 0, apres: 0 } };
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
      if (filmee && cible) { fiche.cible = { libelle: masquer(cible.libelle), boite: cible.boite }; }
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
          fiche.options = { libelles: r.libelles.map(masquer), choisie: r.choisie, ...(r.etiquette ? { etiquette: masquer(r.etiquette) } : {}) };
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
      if (cible && e.faire === 'defiler') fiche.cible = { libelle: masquer(cible.libelle), boite: (await appel('boite', cible.id)) || cible.boite };
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
      if (dialogues.length) fiche.dialogue = { type: dialogues[0].type, message: masquer(dialogues[0].message) };
      if (flous[n]) fiche.flous = { auto: flous[n].auto, cible: flous[n].cible, apres: 0 };
      fiche.url = adresseGardee((await evaluer('location.href')) || '', { projet, essai: essai && essai.url, domaine });
      precedente = apresI;
      return fiche;
    };

    for (const [i, e] of (p.preparation || []).entries()) {
      try { await jouer(e, i + 1, false); } catch (err) {
        if (err.echec) err.echec.preparation = true;
        throw err;
      }
    }
    // Connexion : la personne se connecte elle-même dans la fenêtre ; rien n'est filmé ni lu entre-temps.
    if (p.connexion) {
      libre = true;
      surEtape({ attente: 'connexion', site: site || Pa.lireAdresse(p.depart, { projet }).site });
      if (personne) await personne({ evaluer: (x) => page.evaluer(x), aller: (u) => page.aller(u) });
      const debut = Date.now();
      while (!fs.existsSync(signal)) {
        if (Date.now() - debut > delaiConnexion) { const e = new Error('connexion'); e.connexion = true; throw e; }
        await pause(500);
      }
      fs.rmSync(signal, { force: true });
      libre = false;
      if (!(await attendreCalme())) alertes.push('La page ne s\'est pas calmée après la connexion.');
    }
    for (const [i, e] of p.etapes.entries()) {
      surEtape({ etape: i + 1, sur: p.etapes.length, quoi: masquer(Pa.phraseEtape(e)) });
      etapes.push(await jouer(e, i + 1, true));
    }
    tourne = false;
    await envoyer('Page.stopScreencast').catch(() => {});
    if (bloquees && !domaine) alertes.push(`La page a voulu joindre internet : ${bloquees} requête${bloquees > 1 ? 's' : ''} bloquée${bloquees > 1 ? 's' : ''} (le tournage reste sur l'ordinateur).`);
    if (ailleurs.size) alertes.push(`La page a voulu aller sur un autre site (${[...ailleurs].join(', ')}) : c'est bloqué, le tournage reste sur ${site}.`);

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
      version: F.VERSION, source: 'tournage', ...(site ? { site } : {}), flou: { auto: reglageFlou.auto, mode: reglageFlou.mode }, date: new Date().toISOString(), navigateur: await page.version(), appareil,
      largeur: T.largeur, hauteur: T.hauteur, echelle: T.echelle, cadence, bords, etapes: filmEtapes, alertes,
      duree: Math.round((Date.now() - debutTournage) / 100) / 10,
    };
    film.poids = F.poidsPrise(temporaire);
    fs.writeFileSync(path.join(temporaire, 'film.json'), `${JSON.stringify(film, null, 2)}\n`, 'utf8');
    // Planche : l'image avant l'action, la cible et le point visé, le compte des zones floutées.
    const planche = await ecrirePlanche(page, { projet, nom, prise, film, dossier: temporaire, phrases: p.etapes.map(Pa.phraseEtape) });
    await page.fermer();
    page = null;
    const dossierPrise = path.join(dossierFilm, prise);
    fs.renameSync(temporaire, dossierPrise);
    return { ok: true, prise, etapes: filmEtapes.length, duree: film.duree, poids: film.poids, alertes, planche: path.relative(projet, planche).split(path.sep).join('/') };
  } catch (e) {
    let resultat;
    // Première étape introuvable et un mot de passe visible : la page redemande l'identifiant.
    if (e.echec && !e.ambigu && (e.echec.etape === 1 || e.echec.preparation) && page && await motDePasseVisible()) {
      e.connexion = true;
    }
    if (e.connexion) {
      resultat = { ok: false, besoin: 'connexion', site: site || Pa.lireAdresse(p.depart, { projet }).site,
        message: p.connexion ? 'La connexion n\'a pas été faite dans les 15 minutes.' : 'La page demande de se connecter.' };
    } else if (e.echec) {
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
      resultat = { ok: false, erreur: 'etape', etape: e.echec.etape, ...(e.echec.preparation ? { preparation: true } : {}), message: masquer(e.message), proches: (e.echec.proches || []).map(masquer),
        image: image && path.relative(projet, image).split(path.sep).join('/'),
        rappel: 'Les actions déjà faites dans l\'application ne sont pas annulées.' };
    } else resultat = { ok: false, erreur: 'tournage', message: `Le tournage s'est arrêté : ${e.message}` };
    fs.rmSync(temporaire, { recursive: true, force: true });
    return resultat;
  } finally {
    if (page) await page.fermer().catch(() => {});
    if (essai) await essai.fermer().catch(() => {});
    fs.rmSync(temporaire, { recursive: true, force: true });
    fs.rmSync(signal, { force: true });
  }
}

module.exports = { tourner, estLocal, adresseGardee, flouDessine, ecrirePlanche, OUTILS_IMAGES, CALME, COUPE, CONNEXION };
