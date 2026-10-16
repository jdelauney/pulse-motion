'use strict';
/* Pulse Motion – rapporteur de node --test pour scripts/lancer-tests.js : une ligne JSON par test en échec
 * ({ fichier, nom, delai }), delai vrai quand l'échec est un délai dépassé (délai du test, page sans résultat, navigateur
 * qui ne répond pas). Le lanceur relance seuls, une fois, les fichiers qui ont dépassé un délai sous charge.
 *
 *   node --test --test-reporter=spec --test-reporter-destination=stdout \
 *     --test-reporter=./scripts/lib/rapport-tests.js --test-reporter-destination=<fichier> …
 */

const DELAI = /Pas de résultat de la page après|délai dépassé|dépassé son délai|timed out|time ?out/i;

/** Texte d'une erreur et de ses causes (le rapporteur reçoit l'erreur du test enveloppée dans error.cause). */
function texteErreur(e, profondeur = 0) {
  if (!e || profondeur > 4) return '';
  if (typeof e !== 'object') return String(e);
  return [e.code, e.failureType, e.message, texteErreur(e.cause, profondeur + 1)].filter(Boolean).join(' ');
}

/** Échec dû à un délai dépassé ? */
function estDelai(e) {
  return !!e && (e.failureType === 'testTimeoutFailure' || (e.cause && e.cause.failureType === 'testTimeoutFailure') || DELAI.test(texteErreur(e)));
}

async function* rapport(source) {
  for await (const ev of source) {
    if (ev.type !== 'test:fail') continue;
    const d = ev.data || {};
    const e = d.details && d.details.error;
    yield JSON.stringify({ fichier: d.file || null, nom: d.name, delai: estDelai(e) }) + '\n';
  }
}

module.exports = rapport;
module.exports.estDelai = estDelai;
