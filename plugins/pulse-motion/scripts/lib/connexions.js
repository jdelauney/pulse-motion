'use strict';
/* Pulse Motion – profils du navigateur des sites filmés (spec S6, 5.5). Un profil par site, sous
 * ~/.pulse-motion/navigateur/<site>/ (<site> : le nom d'hôte réduit à a-z, 0-9 et tirets) : jamais dans le dossier d'une
 * vidéo, jamais copié par l'historique ni par la bibliothèque personnelle (EXCLUS_BIBLIOTHEQUE). Comme tout navigateur, il
 * garde les cookies du site sur cet ordinateur ; jamais un mot de passe : avant chaque lancement, ses préférences coupent
 * le gestionnaire de mots de passe et la saisie automatique (adresses, cartes).
 *
 * dossierConnexions() -> ~/.pulse-motion/navigateur (ou $PULSE_MOTION_DOSSIER/navigateur)
 * profilSite(hote) -> chemin du profil, préférences posées (créé au besoin)
 * preparerPreferences(profil) : Default/Preferences, gestionnaire de mots de passe et saisie automatique coupés
 * connexions() -> [{ site, date }] (date : dernière utilisation)
 * oublier(site) -> { site, oublie } : le profil est supprimé (nom d'hôte ou nom réduit)
 */
const fs = require('node:fs');
const path = require('node:path');
const { dossierPersonnel } = require('./personnel.js');
const { siteReduit } = require('./parcours.js');

/** Dossiers de ~/.pulse-motion qu'une bibliothèque personnelle (chantier H) n'exporte ni n'importe jamais. */
const EXCLUS_BIBLIOTHEQUE = ['navigateur'];

const dossierConnexions = () => path.join(dossierPersonnel(), 'navigateur');

const PREFERENCES = {
  credentials_enable_service: false,
  credentials_enable_autosignin: false,
  profile: { password_manager_enabled: false },
  autofill: { enabled: false, profile_enabled: false, credit_card_enabled: false },
};

function fusionner(cible, source) {
  for (const [k, v] of Object.entries(source)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) cible[k] = fusionner(cible[k] && typeof cible[k] === 'object' ? cible[k] : {}, v);
    else cible[k] = v;
  }
  return cible;
}

function preparerPreferences(profil) {
  const f = path.join(profil, 'Default', 'Preferences');
  let p = {};
  try { p = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { p = {}; }
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(fusionner(p, PREFERENCES)), 'utf8');
  return f;
}

function profilSite(hote) {
  const profil = path.join(dossierConnexions(), siteReduit(hote));
  fs.mkdirSync(profil, { recursive: true });
  preparerPreferences(profil);
  fs.writeFileSync(path.join(profil, '.pulse-motion-site'), `${String(hote).toLowerCase()}\n`, 'utf8');
  return profil;
}

function connexions() {
  const d = dossierConnexions();
  let noms = [];
  try { noms = fs.readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort(); } catch { return []; }
  return noms.map((nom) => {
    const p = path.join(d, nom);
    let site = nom;
    try { site = fs.readFileSync(path.join(p, '.pulse-motion-site'), 'utf8').trim() || nom; } catch { /* profil sans nom d'hôte */ }
    let date = null;
    try { date = fs.statSync(path.join(p, '.pulse-motion-site')).mtime.toISOString(); } catch { try { date = fs.statSync(p).mtime.toISOString(); } catch { date = null; } }
    return { site, date };
  });
}

function oublier(site) {
  const nom = siteReduit(site);
  const p = path.join(dossierConnexions(), nom);
  if (!fs.existsSync(p)) return { site, oublie: false, message: `Aucune connexion mémorisée pour ${site}.` };
  fs.rmSync(p, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  return { site, oublie: !fs.existsSync(p) };
}

module.exports = { dossierConnexions, profilSite, preparerPreferences, connexions, oublier, PREFERENCES, EXCLUS_BIBLIOTHEQUE };
