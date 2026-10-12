'use strict';
/* Pulse Motion – client minimal du protocole DevTools, sur tuyau (--remote-debugging-pipe) : pas de WebSocket.
 * Les messages JSON, terminés par \0, passent par les descripteurs 3 (vers le navigateur) et 4 (depuis lui).
 * ouvrirPage() lance Chrome ou Edge sans fenêtre, crée un onglet à la taille exacte et renvoie de quoi le piloter. */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { optionsChrome } = require('./navigateur.js');

const arrete = () => new Error('le navigateur s\'est arrêté');

/** -> Promise<{ aller, evaluer, capturer, envoyer, fermer, processus, profil }> */
function ouvrirPage({ navigateur, largeur, hauteur, gpu = false, delai = 30000 }) {
  const profil = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-cdp-'));
  const processus = spawn(navigateur, [...optionsChrome({ gpu }), `--user-data-dir=${profil}`, '--remote-debugging-pipe', `--window-size=${largeur},${hauteur}`, 'about:blank'],
    { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
  const versNavigateur = processus.stdio[3];
  const depuisNavigateur = processus.stdio[4];
  const enAttente = new Map();
  const ecouteurs = new Map();
  let numero = 0;
  let tampon = '';
  let fini = false;
  let sessionId = null;

  function toutRejeter(e) {
    for (const { rejeter, minuteur } of enAttente.values()) { clearTimeout(minuteur); rejeter(e); }
    enAttente.clear();
  }
  function nettoyer() {
    try { fs.rmSync(profil, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* verrouillé : laissé au système */ }
  }
  depuisNavigateur.on('data', (morceau) => {
    tampon += morceau.toString('utf8');
    let fin;
    while ((fin = tampon.indexOf('\0')) >= 0) {
      let m;
      try { m = JSON.parse(tampon.slice(0, fin)); } catch { m = null; }
      tampon = tampon.slice(fin + 1);
      if (!m) continue;
      if (m.id !== undefined && enAttente.has(m.id)) {
        const { resoudre, rejeter, minuteur } = enAttente.get(m.id);
        enAttente.delete(m.id);
        clearTimeout(minuteur);
        if (m.error) rejeter(new Error(m.error.message)); else resoudre(m.result);
      } else if (m.method) {
        for (const fn of ecouteurs.get(m.method) || []) fn(m.params);
      }
    }
  });
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
  function attendreEvenement(nom) {
    return new Promise((resoudre) => {
      const liste = ecouteurs.get(nom) || [];
      const fn = (p) => { ecouteurs.set(nom, (ecouteurs.get(nom) || []).filter((x) => x !== fn)); resoudre(p); };
      liste.push(fn);
      ecouteurs.set(nom, liste);
    });
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
          await envoyerBrut('Page.navigate', { url }, sessionId);
          await charge;
        },
        async evaluer(expression) {
          const r = await envoyerBrut('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
          if (r.exceptionDetails) {
            const d = r.exceptionDetails;
            throw new Error((d.exception && d.exception.description) || d.text || 'erreur dans la page');
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
            processus.once('exit', () => resoudre());
            envoyerBrut('Browser.close').catch(() => {});
            setTimeout(() => { if (!fini) processus.kill(); }, 3000);
          });
        },
      };
      resoudrePage(page);
    })().catch((e) => {
      if (!pret) { try { processus.kill(); } catch { /* déjà arrêté */ } rejeterPage(e); }
    });
  });
}

module.exports = { ouvrirPage };
