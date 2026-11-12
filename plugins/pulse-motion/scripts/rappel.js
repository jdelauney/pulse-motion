#!/usr/bin/env node
'use strict';
/* Pulse Motion – rappel au démarrage d'une session (hook SessionStart).
 *
 * Lit l'entrée JSON du hook ({ cwd, … }). Si le dossier contient une vidéo en cours, ou si
 * Node.js est trop ancien, ajoute un contexte pour Claude ; sinon n'écrit rien.
 * Nouveautés (spec Retouches et ergonomie, 5.19) : si la version du plugin est plus récente que ~/.pulse-motion/version-vue,
 * une ligne pour Claude (« le dire en une phrase, une seule fois »), puis version-vue est réécrit. Rien à la toute première
 * installation (version-vue absent : il est seulement écrit).
 */
const fs = require('node:fs');
const path = require('node:path');
const { etatProjet } = require('./etat.js');
const { dossierPersonnelEcrivable } = require('./lib/personnel.js');

const RACINE = path.resolve(__dirname, '..');

function messageRappel(dossier) {
  const e = etatProjet(dossier);
  const lignes = [];
  if (!e.node.ok) lignes.push(`Pulse Motion – ${e.node.message} Dites-le à la personne dès votre première réponse.`);
  if (e.projet) {
    lignes.push(`Pulse Motion – Une vidéo est en cours dans ce dossier : « ${e.titre || 'sans titre'} » (étape : ${e.etape}). ` +
      `${e.prochaine} Proposer à la personne de reprendre avec /pulse-motion:reprendre.`);
    // Remarques laissées sur l'image dans l'aperçu (spec Retouches et ergonomie, 5.8) : elles attendent Claude.
    const n = e.remarques ? e.remarques.ouvertes : 0;
    if (n > 0) {
      lignes.push(`Pulse Motion – ${n === 1 ? 'Une remarque laissée' : `${n} remarques laissées`} sur l'image dans l'aperçu ${n === 1 ? 'attend' : 'attendent'} d'être traitée${n === 1 ? '' : 's'} : les proposer en premier (/pulse-motion:retoucher, « Remarques de l'aperçu »).`);
    }
  }
  return lignes.join('\n');
}

const versionPlus = (a, b) => {
  const x = String(a).split('.').map(Number);
  const y = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
};

/**
 * Nouveautés à annoncer une seule fois. dossier : dossier personnel (null : rien, ni lu ni écrit). -> texte ('' si rien)
 * version-vue absent (première installation) : écrit sans rien dire ; version plus récente : la ligne, puis version-vue.
 */
function annoncerNouveautes({ dossier = dossierPersonnelEcrivable(), version = lireVersion(), entrees = lireEntrees() } = {}) {
  if (!dossier || !version) return '';
  const fichier = path.join(dossier, 'version-vue');
  let vue = null;
  try { vue = fs.readFileSync(fichier, 'utf8').trim(); } catch { /* première installation */ }
  if (vue === version) return '';
  let message = '';
  if (vue && versionPlus(version, vue)) {
    const e = entrees.find((x) => x.version === version);
    message = `Pulse Motion – Pulse Motion vient d'être mis à jour (${version})${e ? ` : ${e.resume}` : '.'} Le dire en une phrase au début de votre première réponse, une seule fois.`;
  }
  try {
    fs.mkdirSync(dossier, { recursive: true });
    fs.writeFileSync(fichier, `${version}\n`, 'utf8');
  } catch { return ''; /* dossier impossible à écrire : ne rien annoncer, pour ne pas le redire à chaque session */ }
  return message;
}

function lireVersion() {
  try { return JSON.parse(fs.readFileSync(path.join(RACINE, '.claude-plugin', 'plugin.json'), 'utf8')).version; } catch { return null; }
}
function lireEntrees() {
  try { return JSON.parse(fs.readFileSync(path.join(RACINE, 'nouveautes.json'), 'utf8')); } catch { return []; }
}

function lireEntree() {
  try { return JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch { return {}; }
}

if (require.main === module) {
  const entree = lireEntree();
  const message = [messageRappel(entree.cwd || process.cwd()), annoncerNouveautes()].filter(Boolean).join('\n');
  if (message) {
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: message } }));
  }
}

module.exports = { messageRappel, annoncerNouveautes };
