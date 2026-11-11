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
 *   node scripts/filmer.js continuer <dossier> <nom>          la personne s'est connectée : le tournage en attente reprend
 *   node scripts/filmer.js connexions [oublier <site>]        sites mémorisés (profil du navigateur, hors du projet), ou oubli
 *   node scripts/filmer.js flouter <dossier> <nom> --etapes 3-5 --zone x,y,l,h [--prise prise-NN]
 *                                                             flou définitif d'une zone (en % de l'image) dans ces étapes
 *   node scripts/filmer.js importer <dossier> <fichier> [--nom <nom>] [--de 0:12] [--a 1:05]
 *                                                             vidéo de l'écran ou animation -> prise (films/<nom>/prise-NN/)
 *   node scripts/filmer.js repere <dossier> <nom> <instant> <x,y> [<x,y,l,h>] [--prise prise-NN]
 *                                                             repère d'une vidéo importée (cible etape:N), en % de l'image
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

const AVEC_VALEUR = ['--etapes', '--zone', '--prise', '--nom', '--de', '--a'];

/** Arguments : positionnels, drapeaux (--accord) et options à valeur (--etapes 3-5). */
function lireArgs(args) {
  const positions = [];
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (AVEC_VALEUR.includes(a)) { options[a.slice(2)] = args[++i]; continue; }
    if (a.startsWith('--')) { options[a.slice(2)] = true; continue; }
    positions.push(a);
  }
  return { positions, options };
}

const nombres = (t) => String(t || '').replace(/%/g, '').split(',').map((x) => Number(x.trim()));

async function principal(args) {
  const { positions, options } = lireArgs(args);
  const [commande, dossier = '.', nom, quatrieme] = positions;
  const projet = path.resolve(dossier);
  if (commande === 'connexions') {
    const C = require('./lib/connexions.js');
    if (positions[1] === 'oublier') {
      if (!positions[2]) return sortir({ ok: false, message: 'Quel site oublier ? (son adresse, par exemple app.exemple.fr)' });
      const r = C.oublier(positions[2]);
      return sortir({ ok: r.oublie, ...r });
    }
    return sortir({ ok: true, connexions: C.connexions() });
  }
  if (commande === 'continuer') {
    const d = F.dossierFilm(projet, String(nom || ''));
    if (!Pa.NOM.test(String(nom || '')) || !fs.existsSync(d)) return sortir({ ok: false, message: `Film « ${nom} » introuvable.` });
    fs.writeFileSync(path.join(d, '.continuer'), `${new Date().toISOString()}\n`, 'utf8');
    return sortir({ ok: true, nom });
  }
  if (commande === 'flouter') {
    const { trouverNavigateur } = require('./lib/navigateur.js');
    const { flouter } = require('./lib/flouter.js');
    return sortir(await flouter({ projet, nom, prise: options.prise, etapes: options.etapes, zone: options.zone, navigateur: trouverNavigateur() }));
  }
  if (commande === 'importer') {
    const { trouverNavigateur } = require('./lib/navigateur.js');
    const { importer } = require('./lib/import.js');
    return sortir(await importer({ projet, fichier: nom, nom: options.nom, de: options.de, a: options.a, navigateur: trouverNavigateur(),
      surAvancement: (x) => process.stderr.write(`${JSON.stringify(x)}\n`) }));
  }
  if (commande === 'repere') {
    const { ajouterRepere } = require('./lib/import.js');
    try {
      return sortir({ ok: true, ...ajouterRepere({ projet, nom, prise: options.prise, instant: quatrieme, point: nombres(positions[4]), boite: positions[5] ? nombres(positions[5]) : undefined }) });
    } catch (e) { return sortir({ ok: false, message: e.message }); }
  }
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
    '  continuer <dossier> <nom>             connexions [oublier <site>]',
    '  flouter <dossier> <nom> --etapes 3-5 --zone x,y,l,h [--prise prise-NN]',
    '  importer <dossier> <fichier> [--nom <nom>] [--de 0:12] [--a 1:05]',
    '  repere <dossier> <nom> <instant> <x,y> [<x,y,l,h>] [--prise prise-NN]',
  ].join('\n') + '\n');
  return 2;
}

if (require.main === module) {
  principal(process.argv.slice(2)).then((code) => process.exit(code), (e) => { process.stderr.write(`${e.message}\n`); process.exit(1); });
}

module.exports = { principal, ESSAI, lireArgs };
