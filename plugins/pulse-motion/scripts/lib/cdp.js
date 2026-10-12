'use strict';
/* Pulse Motion – client minimal du protocole DevTools, sur tuyau (--remote-debugging-pipe) : pas de WebSocket.
 * Les messages JSON, terminés par \0, passent par les descripteurs 3 (vers le navigateur) et 4 (depuis lui).
 * ouvrirPage() lance Chrome ou Edge sans fenêtre, crée un onglet à la taille exacte et renvoie de quoi le piloter.
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

/** -> Promise<{ aller, evaluer, capturer, envoyer, fermer, processus, profil }> */
function ouvrirPage({ navigateur, largeur, hauteur, gpu = false, delai = 30000 }) {
  const profil = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-cdp-'));
  const processus = spawn(navigateur, [...optionsChrome({ gpu }), `--user-data-dir=${profil}`, '--remote-debugging-pipe', `--window-size=${largeur},${hauteur}`, 'about:blank'],
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
  function attendreEvenement(nom) {
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
        minuteur: setTimeout(() => { retirer(); rejeter(new Error('délai dépassé')); }, delai),
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
      await envoyerBrut('Emulation.setDeviceMetricsOverride', { width: largeur, height: hauteur, deviceScaleFactor: 1, mobile: false }, sessionId);
      pret = true;
      const page = {
        processus,
        profil,
        envoyer: (method, params) => envoyerBrut(method, params, sessionId),
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
        async evaluer(expression) {
          const r = await envoyerBrut('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true }, sessionId);
          if (r.exceptionDetails) {
            const d = r.exceptionDetails;
            const x = d.exception || {};
            throw new Error(x.description || (x.value !== undefined ? String(x.value) : '') || d.text || 'erreur dans la page');
          }
          return r.result.value;
        },
        async capturer() {
          const r = await envoyerBrut('Page.captureScreenshot', { format: 'png' }, sessionId);
          return Buffer.from(r.data, 'base64');
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

module.exports = { ouvrirPage, creerLecteur };
