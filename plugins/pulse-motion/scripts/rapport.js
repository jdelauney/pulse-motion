#!/usr/bin/env node
'use strict';
/* Pulse Motion – rapport de problème (spec Retouches et ergonomie, 5.20).
 *
 *   node scripts/rapport.js [<dossier>]   -> { ok, titre, corps, url, fichier }
 *
 * corps (Markdown) : version de Pulse Motion, système et version, Node.js, navigateur, état des outils, étape de la vidéo du
 * dossier, 3 dernières erreurs du journal (~/.pulse-motion/erreurs.jsonl). Chemins anonymisés (dossier personnel -> ~, dossier
 * du projet -> <dossier>). **Rien de la vidéo** : ni titre, ni texte, ni fichier, ni voix.
 * fichier : sortie/rapport-probleme.md du projet (sans vidéo dans le dossier : ~/.pulse-motion/rapport-probleme.md).
 * url : page « nouvelle demande » du dépôt, titre et corps préremplis, 7 000 caractères au plus (les erreurs sont raccourcies,
 * puis retirées, avant le reste). **Rien n'est envoyé** : la personne relit, puis ouvre la page et envoie elle-même (un compte
 * GitHub est nécessaire ; sinon, le fichier s'envoie par courriel).
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { anonymiser, lireErreurs } = require('./lib/erreurs.js');
const { dossierPersonnel, dossierPersonnelEcrivable } = require('./lib/personnel.js');

// Adresse du dépôt du plugin (spec 5.20 : celle de git remote chez le mainteneur ; le plugin installé n'a pas de dépôt git).
const DEPOT = 'https://github.com/jdelauney/pulse-motion';
const MAX_ADRESSE = 7000;

const SYSTEMES = { win32: 'Windows', darwin: 'macOS', linux: 'Linux' };
const oui = (x) => (x && x.ok ? 'prêt' : 'absent');

function etatOutilsRapide() {
  // La carte graphique n'est pas sondée ici (20 s au plus) : le rapport doit venir tout de suite.
  try { return require('./outils.js').etatOutils({ sonderCarteGraphique: () => ({ ok: null, message: 'non vérifiée' }) }); } catch { return null; }
}

function etapeDe(projet) {
  if (!fs.existsSync(path.join(projet, 'deroule.json'))) return 'aucune vidéo dans ce dossier';
  try { return require('./etat.js').etatProjet(projet).etape; } catch { return 'illisible'; }
}

function ligneErreur(e, max) {
  const message = e.message.length > max ? `${e.message.slice(0, max)}…` : e.message;
  return `- ${String(e.date || '').slice(0, 16).replace('T', ' ')} · ${e.commande} (code ${e.code}) · ${message} [${e.empreinte}]`;
}

/** Corps du rapport, erreurs limitées à n et à max caractères chacune. */
function corpsRapport({ version, outils, etape, erreurs, n = 3, max = 400 }) {
  const o = outils || {};
  const nav = o.navigateur || {};
  const lignes = [
    '## Ce qui s\'est passé',
    '',
    '_(À compléter par vous : ce que vous avez demandé, ce qui s\'est passé, ce que vous attendiez. N\'y mettez rien de votre vidéo que vous ne voulez pas rendre public.)_',
    '',
    '## L\'ordinateur',
    '',
    `- Pulse Motion : ${version || 'inconnue'}`,
    `- Système : ${SYSTEMES[process.platform] || process.platform} ${os.release()} (${os.arch()})`,
    `- Node.js : ${process.versions.node}`,
    `- Navigateur : ${nav.ok ? (nav.nom || nav.message || 'trouvé') : 'introuvable'}`,
    `- ffmpeg : ${oui(o.ffmpeg)}${o.ffmpeg && o.ffmpeg.version ? ` (${o.ffmpeg.version})` : ''} · Python : ${oui(o.python)} · transcription : ${oui(o.transcription)} · voix de l'ordinateur : ${oui(o.voixSysteme)} · voix de synthèse : ${oui(o.voixSynthese)}`,
    `- Étape de la vidéo : ${etape}`,
    '',
    '## Dernières erreurs',
    '',
  ];
  const dernieres = n > 0 ? erreurs.slice(-n).reverse() : [];
  lignes.push(...(dernieres.length ? dernieres.map((e) => ligneErreur(e, max)) : ['- aucune erreur notée']));
  return `${lignes.join('\n')}\n`;
}

function adresse(titre, corps) {
  return `${DEPOT}/issues/new?title=${encodeURIComponent(titre)}&body=${encodeURIComponent(corps)}`;
}

/** -> { ok, titre, corps, url, fichier } ; options injectables pour les tests. */
function rapport({ dossier = '.', outils = etatOutilsRapide(), erreurs = lireErreurs({ dossier: dossierPersonnel() }), personnel = dossierPersonnelEcrivable(), maison = os.homedir() } = {}) {
  const projet = path.resolve(dossier);
  let version = null;
  try { version = require('../.claude-plugin/plugin.json').version; } catch { /* plugin abîmé */ }
  const etape = etapeDe(projet);
  const derniere = erreurs[erreurs.length - 1];
  const titre = `Problème avec Pulse Motion ${version || ''}${derniere ? ` : commande ${derniere.commande}` : ''}`.replace(/\s+:/, ' :').trim();
  const anonyme = (t) => anonymiser(t, { projet, maison });
  let corps = anonyme(corpsRapport({ version, outils, etape, erreurs }));
  // Adresse trop longue : erreurs raccourcies, puis moins d'erreurs, puis le corps coupé.
  for (const [n, max] of [[3, 200], [3, 100], [2, 100], [1, 100], [0, 0]]) {
    if (adresse(titre, corps).length <= MAX_ADRESSE) break;
    corps = anonyme(corpsRapport({ version, outils, etape, erreurs, n, max }));
  }
  let url = adresse(titre, corps);
  while (url.length > MAX_ADRESSE) { corps = corps.slice(0, Math.floor(corps.length * 0.9)); url = adresse(titre, corps); }
  // Fichier gardé : toujours le corps complet (3 erreurs entières).
  const complet = anonyme(corpsRapport({ version, outils, etape, erreurs }));
  const contenu = `# ${titre}\n\n${complet}`;
  let fichier = null;
  const avecVideo = fs.existsSync(path.join(projet, 'deroule.json'));
  const cible = avecVideo ? path.join(projet, 'sortie', 'rapport-probleme.md') : (personnel ? path.join(personnel, 'rapport-probleme.md') : null);
  if (cible) {
    try {
      fs.mkdirSync(path.dirname(cible), { recursive: true });
      fs.writeFileSync(cible, contenu, 'utf8');
      fichier = avecVideo ? 'sortie/rapport-probleme.md' : cible;
    } catch { fichier = null; }
  }
  return { ok: true, titre, corps, url, fichier };
}

/**
 * Ouvre la page de signalement dans le navigateur de la personne (après son accord) ; rien n'est envoyé. Sous Windows, sans
 * passer par l'invite de commandes (« & » de l'adresse y couperait la commande). PM_SANS_OUVRIR=1 : rien (tests).
 */
function ouvrirAdresse(url) {
  if (process.env.PM_SANS_OUVRIR === '1' || !/^https:\/\/github\.com\//.test(url)) return false;
  const { spawn } = require('node:child_process');
  const [cmd, args] = process.platform === 'win32' ? ['rundll32', ['url.dll,FileProtocolHandler', url]]
    : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  try { spawn(cmd, args, { stdio: 'ignore', detached: true, windowsHide: true }).unref(); return true; } catch { return false; }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const dossier = args.find((a) => !a.startsWith('--')) || '.';
  const r = rapport({ dossier });
  if (args.includes('--ouvrir')) r.ouverte = ouvrirAdresse(r.url);
  console.log(JSON.stringify(r, null, 2));
}

module.exports = { rapport, corpsRapport, ouvrirAdresse, MAX_ADRESSE, DEPOT };
