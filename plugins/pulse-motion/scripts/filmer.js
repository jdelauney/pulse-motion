#!/usr/bin/env node
'use strict';
/* Pulse Motion – filmer une application web pour un tutoriel (spec S6, 5.2 à 5.7). Commandes de Claude, jamais montrées à la
 * personne ; résultats en JSON sur la sortie standard.
 *
 *   node scripts/filmer.js verifier <dossier> <nom>          parcours films/<nom>/parcours.json : { ok, erreurs, etapes }
 *   node scripts/filmer.js tourner <dossier> <nom> [--accord] nouvelle prise ; progression en lignes JSON sur stderr
 *                                                             ({ etape, sur, quoi }) ; { ok, prise, etapes, duree, poids, alertes, planche }
 *   node scripts/filmer.js prises <dossier> <nom>             prises (date, étapes, durée, poids, alertes, planche), la recommandée
 *   node scripts/filmer.js choisir <dossier> <nom> <prise>    prise gardée (parcours.prise) ; seule la personne choisit
 *   node scripts/filmer.js supprimer <dossier> <nom> <prise>  refuse la prise choisie
 *   node scripts/filmer.js essai <dossier> [<nom>]            parcours d'exemple sur l'appli d'essai (films/<nom>/, défaut appli-essai)
 */
const fs = require('node:fs');
const path = require('node:path');
const Pa = require('./lib/parcours.js');
const F = require('./lib/film.js');
const { ecrireJSON } = require('./lib/fichiers.js');

const ESSAI = {
  depart: 'appli-essai/factures.html',
  appareil: 'ordinateur',
  etapes: [
    { faire: 'cliquer', cible: 'Nouvelle facture', dit: 'Cliquez sur Nouvelle facture.' },
    { faire: 'taper', cible: 'Client', texte: 'Dupont SARL', dit: 'Dans Client, tapez le nom du client.' },
    { faire: 'choisir', cible: 'Mode de paiement', option: 'Virement', dit: 'Choisissez Virement comme mode de paiement.' },
    { faire: 'cliquer', cible: 'Enregistrer', dit: 'Enregistrez.' },
    { faire: 'cliquer', cible: { texte: 'Enregistrer', dans: 'fenêtre' }, dit: 'Confirmez dans la fenêtre.' },
    { faire: 'attendre', texte: 'Facture enregistrée', dit: 'La facture est enregistrée.' },
  ],
};

function sortir(objet, code = objet && objet.ok === false ? 1 : 0) {
  process.stdout.write(`${JSON.stringify(objet, null, 2)}\n`);
  return code;
}

async function principal(args) {
  const [commande, dossier = '.', nom, quatrieme] = args.filter((a) => !a.startsWith('--'));
  const projet = path.resolve(dossier);
  if (commande === 'verifier') {
    const r = Pa.lireParcours(projet, nom);
    return sortir({ ok: !!r.parcours && !r.erreurs.length, erreurs: r.erreurs, etapes: r.etapes || [] });
  }
  if (commande === 'tourner') {
    const { trouverNavigateur } = require('./lib/navigateur.js');
    const { tourner } = require('./lib/tournage.js');
    const r = await tourner({ projet, nom, accord: args.includes('--accord'), navigateur: trouverNavigateur(),
      surEtape: (x) => process.stderr.write(`${JSON.stringify(x)}\n`) });
    return sortir(r);
  }
  if (commande === 'prises') {
    const liste = F.prises(projet, nom);
    const reussies = liste.filter((p) => p.ok);
    return sortir({ ok: true, nom, prises: liste, recommandee: reussies.length ? reussies[reussies.length - 1].prise : null, choisie: (liste.find((p) => p.choisie) || {}).prise || null });
  }
  if (commande === 'choisir') {
    try { return sortir({ ok: true, ...F.choisirPrise(projet, nom, quatrieme) }); } catch (e) { return sortir({ ok: false, message: e.message }); }
  }
  if (commande === 'supprimer') {
    try { return sortir({ ok: true, ...F.supprimerPrise(projet, nom, quatrieme) }); } catch (e) { return sortir({ ok: false, message: e.message }); }
  }
  if (commande === 'essai') {
    const n = nom || 'appli-essai';
    if (!Pa.NOM.test(n)) return sortir({ ok: false, message: `« ${n} » : a-z, 0-9 et des tirets.` });
    const fichier = path.join(projet, 'films', n, 'parcours.json');
    if (fs.existsSync(fichier)) return sortir({ ok: true, nom: n, deja: true, etapes: Pa.lireParcours(projet, n).etapes });
    ecrireJSON(fichier, { nom: n, ...ESSAI });
    return sortir({ ok: true, nom: n, etapes: Pa.lireParcours(projet, n).etapes });
  }
  process.stderr.write([
    'Usage : pulse-motion filmer <commande> <dossier> <nom> …',
    '  verifier <dossier> <nom>              tourner <dossier> <nom> [--accord]',
    '  prises <dossier> <nom>                choisir <dossier> <nom> <prise>      supprimer <dossier> <nom> <prise>',
    '  essai <dossier> [<nom>]               parcours d\'exemple sur l\'appli d\'essai',
  ].join('\n') + '\n');
  return 2;
}

if (require.main === module) {
  principal(process.argv.slice(2)).then((code) => process.exit(code), (e) => { process.stderr.write(`${e.message}\n`); process.exit(1); });
}

module.exports = { principal, ESSAI };
