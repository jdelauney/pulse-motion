#!/usr/bin/env node
'use strict';
/* Pulse Motion – styles personnels (~/.pulse-motion/styles/<nom>/, ou $PULSE_MOTION_DOSSIER/styles/<nom>/).
 *
 *   node scripts/style-perso.js nouveau <nom> [--depuis <style>]     squelette repris d'un style existant
 *   node scripts/style-perso.js verifier <nom>                       contrat, contrôles et rendu (16:9, 1:1, 4:5, 9:16, tons)
 *   node scripts/style-perso.js planche <nom> [--scenes titre,liste] [--ratio 16:9] [--ton clair|sombre] [--textes exemple|maximum] [--ouvrir]
 *
 * Résumé JSON ; code 1 avec { ok: false, message } en cas d'échec.
 */
const fs = require('node:fs');
const path = require('node:path');
const { trouverStyle, messageStyleInconnu, verifierStyle, marquerVerifie, lireJSON, LIVRES, RACINE, dossierPersonnel } = require('./styles.js');
const { NOM_STYLE, TYPES } = require('./lib/contrat.js');
const { projetEssai } = require('./lib/projet-essai.js');
const { verifierRendu } = require('./lib/rendu-style.js');
const { controler } = require('./controler.js');
const { exporterVideo } = require('./exporter.js');
const { ouvrirNavigateur } = require('./apercu.js');

const dossierStylesPerso = () => path.join(dossierPersonnel(), 'styles');

function nouveauStyle({ nom, depuis = 'clair-pedagogique' }) {
  if (!NOM_STYLE.test(nom || '')) return { ok: false, message: 'Nom de style : seulement des lettres minuscules, des chiffres et des tirets (ex. papercraft).' };
  if (fs.existsSync(path.join(LIVRES, nom))) return { ok: false, message: `« ${nom} » est le nom d'un style livré : choisissez un autre nom.` };
  const cible = path.join(dossierStylesPerso(), nom);
  if (fs.existsSync(cible)) return { ok: false, message: `Le style personnel « ${nom} » existe déjà (${cible}) : choisissez un autre nom, ou modifiez-le directement.` };
  const base = trouverStyle(depuis);
  if (!base) return { ok: false, message: messageStyleInconnu(depuis) };
  try {
    fs.mkdirSync(dossierStylesPerso(), { recursive: true });
    fs.cpSync(base.dossier, cible, { recursive: true });
    for (const f of ['catalogue.json', 'identite.json']) {
      const j = lireJSON(path.join(cible, f)) || {};
      j.style = nom;
      fs.writeFileSync(path.join(cible, f), JSON.stringify(j, null, 2));
    }
    const sourceGuide = base.personnel ? path.join(base.dossier, 'guide.md') : path.join(RACINE, 'references', 'styles', `${depuis}.md`);
    const guide = fs.existsSync(sourceGuide) ? fs.readFileSync(sourceGuide, 'utf8') : '# Style\n\n## L\'essentiel\n';
    // Une seule mention du modèle : celle d'un style personnel repris est remplacée, pas empilée.
    fs.writeFileSync(path.join(cible, 'guide.md'), guide
      .replace(/^- Repris du style « [^»]* » : .*\n\n?/gm, '')
      .replace(/^# .*$/m, `# Style « ${nom} »`)
      .replace(/^## L'essentiel\n/m, `## L'essentiel\n\n- Repris du style « ${depuis} » : à réécrire pour ce style (personnalité, polices, signature, scènes).\n`));
  } catch (e) {
    try { fs.rmSync(cible, { recursive: true, force: true }); } catch { /* rien à nettoyer */ }
    return { ok: false, message: `Le style « ${nom} » n'a pas pu être créé (${e.code || e.message}) : vérifiez les droits de ${dossierStylesPerso()}, ou indiquez un autre dossier avec la variable PULSE_MOTION_DOSSIER.` };
  }
  return { ok: true, nom, dossier: cible, depuis };
}

async function verifierStylePerso({ nom, navigateur }) {
  const st = trouverStyle(nom);
  if (!st) return { ok: false, erreurs: [], avertissements: [], controle: [], rendu: [], renduVerifie: false, message: messageStyleInconnu(nom) };
  const contrat = verifierStyle(st.dossier);
  if (!contrat.ok) return { ok: false, erreurs: contrat.erreurs, avertissements: contrat.avertissements, controle: [], rendu: [], renduVerifie: false, message: 'Contrat non respecté : corriger d\'abord les erreurs (le rendu sera vérifié ensuite).' };
  const projet = projetEssai({ dossierStyle: st.dossier });
  let controle;
  try { controle = controler({ dossier: projet, ecrire: false }).problemes.map((p) => p.message); } finally { fs.rmSync(projet, { recursive: true, force: true }); }
  const rendu = await verifierRendu({ dossierStyle: st.dossier, navigateur });
  const ok = controle.length === 0 && rendu.ok !== false;
  if (ok && st.personnel) marquerVerifie(st.dossier);
  return {
    ok,
    erreurs: [], avertissements: contrat.avertissements, controle, rendu: rendu.problemes, renduVerifie: rendu.ok !== null,
    ...(rendu.message ? { message: rendu.message } : {}),
  };
}

const RATIOS = ['16:9', '1:1', '4:5', '9:16'];
const TONS = ['clair', 'sombre'];
const TEXTES = ['exemple', 'maximum'];

/** textes : 'exemple' (vraies phrases, par défaut) ou 'maximum' (chaque texte à sa longueur maximale). */
async function plancheStyle({ nom, scenes = ['titre', 'liste'], ratio = '16:9', ton, textes = 'exemple', ouvrir = false, navigateur, exporter = exporterVideo, ouvrirFichier = ouvrirNavigateur }) {
  const st = trouverStyle(nom);
  if (!st) return { ok: false, message: messageStyleInconnu(nom) };
  if (!RATIOS.includes(ratio)) return { ok: false, message: `Format « ${ratio} » inconnu : 16:9, 1:1, 4:5 ou 9:16.` };
  if (ton !== undefined && !TONS.includes(ton)) return { ok: false, message: `Ton « ${ton} » inconnu : clair ou sombre.` };
  if (!TEXTES.includes(textes)) return { ok: false, message: `Textes « ${textes} » inconnus : exemple ou maximum.` };
  const inconnus = scenes.filter((t) => !TYPES[t]);
  if (inconnus.length) return { ok: false, message: `Type de scène inconnu : ${inconnus.join(', ')}. Types : ${Object.keys(TYPES).join(', ')}.` };
  const contrat = verifierStyle(st.dossier);
  if (!contrat.ok) return { ok: false, message: `Le style « ${nom} » n'est pas encore conforme : ${contrat.erreurs.join(' ')}` };
  const projet = projetEssai({ dossierStyle: st.dossier, ratio, ton, types: scenes, textes });
  try {
    const r = await exporter({ dossier: projet, planche: scenes, navigateur });
    if (!r.ok) return { ok: false, message: r.message };
    const sortie = path.join(dossierPersonnel(), 'essais', nom);
    try {
      fs.rmSync(sortie, { recursive: true, force: true });
      fs.mkdirSync(path.dirname(sortie), { recursive: true });
      fs.cpSync(path.join(projet, 'sortie', 'planche'), sortie, { recursive: true });
    } catch (e) {
      return { ok: false, message: `La planche n'a pas pu être rangée dans ${path.dirname(sortie)} (${e.code || e.message}) : vérifiez les droits de ce dossier, ou indiquez un autre dossier avec la variable PULSE_MOTION_DOSSIER.` };
    }
    const fichier = path.join(sortie, 'planche.html');
    if (ouvrir) ouvrirFichier(fichier);
    return { ok: true, fichier, images: fs.readdirSync(sortie).filter((f) => f.endsWith('.png')).sort().map((f) => path.join(sortie, f)) };
  } finally {
    fs.rmSync(projet, { recursive: true, force: true });
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const valeur = (o) => { const i = args.indexOf(o); return i >= 0 ? args[i + 1] : undefined; };
  const [action, nom] = args.filter((a, i) => !a.startsWith('--') && !['--depuis', '--scenes', '--ratio', '--ton', '--textes'].includes(args[i - 1]));
  const fini = (r) => { console.log(JSON.stringify(r, null, 2)); process.exit(r.ok ? 0 : 1); };
  const echec = (e) => fini({ ok: false, message: e.message });
  if (action === 'nouveau') fini(nouveauStyle({ nom, depuis: valeur('--depuis') }));
  else if (action === 'verifier') verifierStylePerso({ nom }).then(fini, echec);
  else if (action === 'planche') {
    plancheStyle({ nom, scenes: valeur('--scenes') ? valeur('--scenes').split(',').filter(Boolean) : undefined, ratio: valeur('--ratio'), ton: valeur('--ton'), textes: valeur('--textes'), ouvrir: args.includes('--ouvrir') }).then(fini, echec);
  } else {
    console.error('Usage : pulse-motion style nouveau <nom> [--depuis <style>] | verifier <nom> | planche <nom> [--scenes titre,liste] [--ratio 16:9|1:1|4:5|9:16] [--ton clair|sombre] [--textes exemple|maximum] [--ouvrir]');
    process.exit(2);
  }
}

module.exports = { nouveauStyle, verifierStylePerso, plancheStyle };
