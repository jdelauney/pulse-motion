#!/usr/bin/env node
'use strict';
/* Pulse Motion – rappel au démarrage d'une session (hook SessionStart).
 *
 * Lit l'entrée JSON du hook ({ cwd, … }). Si le dossier contient une vidéo en cours, ou si
 * Node.js est trop ancien, ajoute un contexte pour Claude ; sinon n'écrit rien.
 */
const { etatProjet } = require('./etat.js');

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

function lireEntree() {
  try { return JSON.parse(require('node:fs').readFileSync(0, 'utf8') || '{}'); } catch { return {}; }
}

if (require.main === module) {
  const entree = lireEntree();
  const message = messageRappel(entree.cwd || process.cwd());
  if (message) {
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: message } }));
  }
}

module.exports = { messageRappel };
