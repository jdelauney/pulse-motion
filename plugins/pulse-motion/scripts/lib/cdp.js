'use strict';
/* Pulse Motion – client minimal du protocole DevTools, sur tuyau (--remote-debugging-pipe) : pas de WebSocket.
 * Les messages JSON, terminés par \0, passent par les descripteurs 3 (vers le navigateur) et 4 (depuis lui).
 * ouvrirPage() lance Chrome ou Edge sans fenêtre (ou avec, pour un tournage), crée un onglet à la taille exacte et renvoie
 * de quoi le piloter.
 * Tout ce qui attend (commande, évènement) est rejeté si le navigateur s'arrête, ou au bout du délai. */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { optionsChrome } = require('./navigateur.js');

const arrete = () => new Error('le navigateur s\'est arrêté');

/**
 * Lecteur des messages du tuyau : octets accumulés, séparateur cherché dans les seuls nouveaux morceaux,
 * décodage une fois par message (un caractère coupé entre deux morceaux reste entier). Un message illisible
 * est ignoré ; un écouteur qui lève une erreur n'empêche pas les messages suivants.
 */
function creerLecteur(surMessage) {
  let morceaux = [];
  return function lire(morceau) {
    let debut = 0;
    let i;
    while ((i = morceau.indexOf(0, debut)) >= 0) {
      morceaux.push(morceau.subarray(debut, i));
      const texte = Buffer.concat(morceaux).toString('utf8');
      morceaux = [];
      debut = i + 1;
      let m;
      try { m = JSON.parse(texte); } catch { continue; }
      try { surMessage(m); } catch { /* écouteur en erreur : la suite passe */ }
    }
    if (debut < morceau.length) morceaux.push(Buffer.from(morceau.subarray(debut)));
  };
}

/** -> Promise<{ aller, evaluer, capturer, version, envoyer, envoyerNavigateur, sur, surEvenement, attendre, fermer, processus, profil, cible }>
 *  erreurs : Runtime.enable, pour recevoir les exceptions de la page (Runtime.exceptionThrown) par surEvenement.
 *  Tournage (spec S6, 5.1) ; sans ces options, le comportement est celui d'avant :
 *  - fenetre : fenêtre visible (ni --headless=new ni --hide-scrollbars) ;
 *  - profil : chemin d'un profil qui dure, jamais supprimé à l'arrêt (sans lui : profil temporaire, supprimé) ;
 *  - echelle : deviceScaleFactor et --force-device-scale-factor (sans le drapeau, le screencast reste à l'échelle 1) ;
 *  - mobile : écran mobile et toucher émulé ;
 *  - base : drapeaux de départ (optionsChrome par défaut ; optionsTournage pour un tournage). options : drapeaux ajoutés. */
/** Arguments de lancement de Chrome ou Edge (ouvrirPage) : drapeaux de départ, moins ceux d'une page sans fenêtre si fenetre,
 *  plus l'échelle forcée, le profil, le tuyau et la taille de la fenêtre. */
function argumentsLancement({ largeur, hauteur, gpu = false, options = [], fenetre = false, echelle = 1, base = null, profil }) {
  let depart = base ? base.slice() : optionsChrome({ gpu });
  if (fenetre) depart = depart.filter((o) => o !== '--headless=new' && o !== '--hide-scrollbars');
  const facteur = Number(echelle) > 0 ? Number(echelle) : 1;
  return [...depart, ...options, ...(facteur !== 1 ? [`--force-device-scale-factor=${facteur}`] : []), `--user-data-dir=${profil}`, '--remote-debugging-pipe', `--window-size=${largeur},${hauteur}`, 'about:blank'];
}

function ouvrirPage({ navigateur, largeur, hauteur, gpu = false, delai = 30000, options = [], erreurs = false, fenetre = false, profil: profilDonne = null, echelle = 1, mobile = false, base = null }) {
  const durable = !!profilDonne;
  if (durable) fs.mkdirSync(profilDonne, { recursive: true });
  const profil = durable ? profilDonne : fs.mkdtempSync(path.join(os.tmpdir(), 'pm-cdp-'));
  const facteur = Number(echelle) > 0 ? Number(echelle) : 1;
  const processus = spawn(navigateur, argumentsLancement({ largeur, hauteur, gpu, options, fenetre, echelle: facteur, base, profil }),
    { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
  const versNavigateur = processus.stdio[3];
  const depuisNavigateur = processus.stdio[4];
  const enAttente = new Map();
  const attentesEvenements = new Set();
  const ecouteurs = new Map();
  let numero = 0;
  let fini = false;
  let sessionId = null;

  function toutRejeter(e) {
    for (const { rejeter, minuteur } of enAttente.values()) { clearTimeout(minuteur); rejeter(e); }
    enAttente.clear();
    for (const a of attentesEvenements) a.rejeter(e);
    attentesEvenements.clear();
  }
  function nettoyer(essais = 15) {
    // Profil donné (tournage d'un site, spec S6 5.5) : il dure, jamais supprimé.
    if (durable) return;
    try {
      fs.rmSync(profil, { recursive: true, force: true });
    } catch {
      // Windows : processus enfants du navigateur encore accrochés au profil quelques instants.
      if (essais > 0) setTimeout(() => nettoyer(essais - 1), 200).unref();
    }
  }
  depuisNavigateur.on('data', creerLecteur((m) => {
    if (m.id !== undefined && enAttente.has(m.id)) {
      const { resoudre, rejeter, minuteur } = enAttente.get(m.id);
      enAttente.delete(m.id);
      clearTimeout(minuteur);
      if (m.error) rejeter(new Error(m.error.message)); else resoudre(m.result);
    } else if (m.method) {
      for (const fn of ecouteurs.get(m.method) || []) fn(m.params);
    }
  }));
  depuisNavigateur.on('error', () => { /* le navigateur s'arrête : traité par « exit » */ });
  versNavigateur.on('error', () => { /* idem */ });

  function envoyerBrut(method, params = {}, session) {
    if (fini) return Promise.reject(arrete());
    return new Promise((resoudre, rejeter) => {
      const id = ++numero;
      const minuteur = setTimeout(() => { enAttente.delete(id); rejeter(new Error('délai dépassé')); }, delai);
      enAttente.set(id, { resoudre, rejeter, minuteur });
      versNavigateur.write(`${JSON.stringify({ id, method, params, ...(session ? { sessionId: session } : {}) })}\0`);
    });
  }
  /** -> { promesse, annuler } : premier évènement « nom », rejet si le navigateur s'arrête ou au délai. */
  function attendreEvenement(nom, duree = delai) {
    let attente;
    const promesse = new Promise((resoudre, rejeter) => {
      const retirer = () => {
        clearTimeout(attente.minuteur);
        attentesEvenements.delete(attente);
        ecouteurs.set(nom, (ecouteurs.get(nom) || []).filter((x) => x !== fn));
      };
      const fn = (p) => { retirer(); resoudre(p); };
      attente = {
        rejeter: (e) => { retirer(); rejeter(e); },
        minuteur: setTimeout(() => { retirer(); rejeter(new Error('délai dépassé')); }, duree),
      };
      attentesEvenements.add(attente);
      ecouteurs.set(nom, [...(ecouteurs.get(nom) || []), fn]);
    });
    promesse.catch(() => {});
    return { promesse, annuler: (e) => attente.rejeter(e) };
  }

  return new Promise((resoudrePage, rejeterPage) => {
    let pret = false;
    processus.on('error', (e) => {
      fini = true;
      toutRejeter(arrete());
      nettoyer();
      if (!pret) rejeterPage(Object.assign(new Error(`navigateur impossible à lancer (${e.code || e.message})`), { code: e.code }));
    });
    processus.on('exit', () => {
      fini = true;
      toutRejeter(arrete());
      nettoyer();
    });
    (async () => {
      const { targetId } = await envoyerBrut('Target.createTarget', { url: 'about:blank' });
      ({ sessionId } = await envoyerBrut('Target.attachToTarget', { targetId, flatten: true }));
      await envoyerBrut('Page.enable', {}, sessionId);
      if (erreurs) await envoyerBrut('Runtime.enable', {}, sessionId);
      await envoyerBrut('Emulation.setDeviceMetricsOverride', { width: largeur, height: hauteur, deviceScaleFactor: facteur, mobile: !!mobile }, sessionId);
      if (mobile) await envoyerBrut('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }, sessionId);
      pret = true;
      const page = {
        processus,
        profil,
        cible: targetId,
        echelle: facteur,
        envoyer: (method, params) => envoyerBrut(method, params, sessionId),
        /** Commande sans session, pour le navigateur entier (Browser.setDownloadBehavior, Target.closeTarget…). */
        envoyerNavigateur: (method, params) => envoyerBrut(method, params),
        /** Écoute un évènement du protocole (Page.screencastFrame…) ; -> retirer(). */
        sur(nom, fn) {
          ecouteurs.set(nom, [...(ecouteurs.get(nom) || []), fn]);
          return () => ecouteurs.set(nom, (ecouteurs.get(nom) || []).filter((x) => x !== fn));
        },
        /** -> Promise du premier évènement « nom » ; rejet au délai (celui de la page par défaut) ou si le navigateur s'arrête. */
        attendre(nom, { delai: duree } = {}) {
          return attendreEvenement(nom, duree === undefined ? delai : duree).promesse;
        },
        /** Écoute un évènement du protocole (ex. Runtime.exceptionThrown) ; -> fonction qui retire l'écoute. */
        surEvenement(nom, fn) {
          ecouteurs.set(nom, [...(ecouteurs.get(nom) || []), fn]);
          return () => ecouteurs.set(nom, (ecouteurs.get(nom) || []).filter((x) => x !== fn));
        },
        async aller(url) {
          const charge = attendreEvenement('Page.loadEventFired');
          let r;
          try {
            r = await envoyerBrut('Page.navigate', { url }, sessionId);
          } catch (e) {
            charge.annuler(e);
            throw e;
          }
          if (r && r.errorText) {
            const e = new Error(`page impossible à ouvrir (${r.errorText})`);
            charge.annuler(e);
            throw e;
          }
          await charge.promesse;
        },
        // geste : l'évaluation compte comme un geste de la personne (clic sur ▶ qui lance le son) ; seulement sur demande.
        async evaluer(expression, { geste = false } = {}) {
          const r = await envoyerBrut('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, ...(geste ? { userGesture: true } : {}) }, sessionId);
          if (r.exceptionDetails) {
            const d = r.exceptionDetails;
            const x = d.exception || {};
            throw new Error(x.description || (x.value !== undefined ? String(x.value) : '') || d.text || 'erreur dans la page');
          }
          return r.result.value;
        },
        /** Capture de la zone d'affichage (largeur × hauteur de la page). rapide : optimizeForSpeed (PNG toujours sans perte,
         *  seulement moins compressé) ; echelle : image réduite (clip.scale). profil(phase, ms) : temps de capture et de décodage.
         *  format : 'png' (défaut), 'jpeg' (couverture, planches du PDF : spec Rendu et export, 5.10 et 5.16) ou 'webp' (états
         *  calmes d'un tournage, spec S6 5.4), qualite 0–100 ; zone { x, y, largeur, hauteur } (px CSS) : cette partie seule.
         *  Signature commune avec S1 (P12). */
        async capturer({ echelle, rapide = true, profil, format = 'png', qualite = 90, zone } = {}) {
          const params = format === 'jpeg' || format === 'webp' ? { format, quality: Math.round(qualite) } : { format: 'png', ...(rapide ? { optimizeForSpeed: true } : {}) };
          if (zone) params.clip = { x: zone.x, y: zone.y, width: zone.largeur, height: zone.hauteur, scale: echelle !== undefined ? echelle : 1 };
          else if (echelle !== undefined && echelle !== 1) params.clip = { x: 0, y: 0, width: largeur, height: hauteur, scale: echelle };
          const t0 = profil ? performance.now() : 0;
          const r = await envoyerBrut('Page.captureScreenshot', params, sessionId);
          const t1 = profil ? performance.now() : 0;
          const png = Buffer.from(r.data, 'base64');
          if (profil) { profil('capture', t1 - t0); profil('base64', performance.now() - t1); }
          return png;
        },
        /** Produit et version du navigateur (« HeadlessChrome/… »), pour les empreintes d'export. */
        async version() {
          const r = await envoyerBrut('Browser.getVersion');
          return `${r.product || ''} ${r.revision || ''}`.trim();
        },
        fermer() {
          if (fini) { nettoyer(); return Promise.resolve(); }
          return new Promise((resoudre) => {
            const fin = setTimeout(resoudre, 8000);
            processus.once('exit', () => { clearTimeout(fin); resoudre(); });
            envoyerBrut('Browser.close').catch(() => {});
            setTimeout(() => { if (!fini) { try { processus.kill(); } catch { /* déjà arrêté */ } } }, 3000).unref();
          });
        },
      };
      resoudrePage(page);
    })().catch((e) => {
      if (!pret) { try { processus.kill(); } catch { /* déjà arrêté */ } rejeterPage(e); }
    });
  });
}

module.exports = { ouvrirPage, creerLecteur, argumentsLancement };
