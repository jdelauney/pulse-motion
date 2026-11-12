#!/usr/bin/env node
'use strict';
/* Pulse Motion – décliner une vidéo : autre format, autre langue, sans la refaire (spec S9, 5.2).
 *
 *   node scripts/decliner.js <dossier> [--format 9:16|1:1|4:5|16:9] [--langue <étiquette>] [--plateforme tiktok|shorts|reels|toutes] [--pour <usage>]
 *
 * Crée <dossier>/declinaisons/<nom>/ (« 9x16 », « en », « en-9x16 ») : une vidéo complète, avec son propre historique ;
 * l'original n'est jamais modifié. Au moins une option ; les deux se combinent. Refusé si le nom est pris, si rien ne change,
 * ou si la vidéo est elle-même une déclinaison (décliner l'originale).
 * Copie : deroule.json, scenes/, charte/, assets/ (sans les voix quand la langue change), personnages/, effets/, et le film
 * choisi de chaque scène filmée (parcours et prise retenue) ; jamais sortie/, l'historique ni les autres déclinaisons.
 * Déroulé : champ « declinaison » { origine: "../..", format?, langue? (ceux d'origine, seulement s'ils changent), le, usage? }.
 * Format : format.ratio remplacé ; en 9:16, format.plateforme (zones sûres de S5 : celle demandée, sinon celle d'origine, sinon
 *   « toutes ») ; hors 9:16, retirée ; ajustements de taille retirés. Scènes toutes faites (« type ») recopiées depuis le style
 *   (lib/adapter.js, comme changer-style) ; à réécrire (une autre mise en page, pas un recadrage) : les scènes composées, et les
 *   scènes toutes faites qui ont des personnages, une caméra, des mouvements nommés ou des retouches faites à la main.
 * Langue : « langue » remplacée ; textes listés dans aTraduire (la commande ne traduit pas : Claude traduit dans la
 *   conversation, rien en ligne) ; prises, voix provisoires et voix de synthèse retirées (voixRetirees), voix.provisoire à
 *   false ; une scène qui écrit du texte dans son fichier est à réécrire ; le glossaire copié garde sa langue d'origine.
 * Usage d'export (scripts/usages.json, S5) : celui de --pour, sinon « reseaux » pour une version verticale, carrée ou 4:5.
 * Accords : ceux du déroulé et du style sont repris (la personne a demandé la déclinaison) ; la vidéo finale reste à voir.
 * Affiche { ok, dossier, nom, recopiees, aReecrire, motifs, aTraduire, voixRetirees, usage } ; code 1 avec { ok: false, message }.
 */
const fs = require('node:fs');
const path = require('node:path');
const { lireDeroule, RATIOS, PLATEFORMES } = require('./lib/deroule.js');
const { cheminDansProjet } = require('./lib/embarquer.js');
const { adapterScene, lireNombre } = require('./lib/adapter.js');
const { trouverStyle } = require('./styles.js');
const { textesEnDur } = require('./lib/extraire.js');
const { ecrireJSON } = require('./lib/fichiers.js');
const { lireUsages } = require('./lib/usages.js');
const Langues = require('../moteur/langues.js');

const DOSSIER = 'declinaisons';
const A_COPIER = ['deroule.json', 'scenes', 'charte', 'assets', 'personnages', 'effets'];
const VOIX = path.join('assets', 'voix');
const aujourdhui = () => new Date().toISOString().slice(0, 10);
const nomDuFormat = (r) => r.replace(':', 'x');
const virgules = (l) => (l.length < 2 ? l.join('') : `${l.slice(0, -1).join(', ')} et ${l[l.length - 1]}`);
const sansBlancs = (h) => String(h).replace(/\s+/g, ' ').trim();

/** Étiquette telle que la personne l'a donnée, à la casse BCP 47 (« en », « en-US »). */
function etiquetteDemandee(langue) {
  const [p, r] = String(langue).trim().replace('_', '-').split('-');
  return r ? `${p.toLowerCase()}-${r.toUpperCase()}` : p.toLowerCase();
}

function copier(source, cible, filtre = () => true) {
  if (!fs.existsSync(source)) return;
  fs.cpSync(source, cible, { recursive: true, filter: (s) => filtre(s) });
}

function decliner({ dossier, format, langue, plateforme, pour, le = aujourdhui(), dossierStyles } = {}) {
  const projet = path.resolve(dossier || '.');
  if (!format && !langue) return { ok: false, message: 'Une déclinaison change le format, la langue, ou les deux : dire lequel (par exemple une version verticale, ou la même vidéo en anglais).' };
  const { deroule, erreurs } = lireDeroule(projet);
  if (!deroule) return { ok: false, message: erreurs.join(' ') };
  if (erreurs.length) return { ok: false, message: `Le déroulé contient des erreurs : ${erreurs.join(' ')}` };
  if (deroule.declinaison) return { ok: false, message: `Cette vidéo est déjà une déclinaison : décliner plutôt la vidéo d'origine (dossier « ${deroule.declinaison.origine} »).` };
  if (format !== undefined && !RATIOS.includes(format)) return { ok: false, message: `Format « ${format} » inconnu : ${RATIOS.join(', ')}.` };
  let lue = null;
  if (langue !== undefined) {
    lue = Langues.lire(langue);
    if (!lue.ok) return { ok: false, message: lue.message };
  }
  const ratio = format || deroule.format.ratio;
  if (plateforme !== undefined && !PLATEFORMES.includes(plateforme)) return { ok: false, message: `Plateforme « ${plateforme} » inconnue : ${PLATEFORMES.join(', ')}.` };
  if (plateforme !== undefined && ratio !== '9:16') return { ok: false, message: 'Une plateforme (TikTok, Shorts, Reels) ne sert qu\'à une version verticale (9:16).' };
  const usages = Object.keys(lireUsages().usages);
  if (pour !== undefined && !usages.includes(pour)) return { ok: false, message: `Usage « ${pour} » inconnu : ${usages.join(', ')}.` };
  const langueAvant = Langues.etiquetteDe(deroule);
  const formatChange = format !== undefined && format !== deroule.format.ratio;
  const langueChange = lue !== null && lue.etiquette !== langueAvant;
  if (!formatChange && !langueChange) {
    const deja = [format !== undefined ? `en ${format}` : null, lue ? `en ${Langues.nom(lue.etiquette)}` : null].filter(Boolean);
    return { ok: false, message: `La vidéo est déjà ${virgules(deja)} : rien à décliner.` };
  }
  const nom = [langueChange ? etiquetteDemandee(langue).toLowerCase() : null, formatChange ? nomDuFormat(format) : null].filter(Boolean).join('-');
  const cible = path.join(projet, DOSSIER, nom);
  if (fs.existsSync(cible)) return { ok: false, message: `Une déclinaison « ${nom} » existe déjà : la retoucher, ou la supprimer d'abord.` };
  const st = formatChange ? trouverStyle(deroule.style, dossierStyles) : null;
  if (formatChange && !st) return { ok: false, message: `Le style « ${deroule.style} » est introuvable : la déclinaison ne peut pas recopier ses scènes toutes faites.` };

  // Tout lire avant d'écrire : scènes, modèles du style, films.
  const lire = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return null; } };
  const scenes = deroule.scenes.map((s, i) => {
    const fichier = cheminDansProjet(projet, s.fichier);
    return { s, fichier, html: fichier ? lire(fichier) : null, derniere: i === deroule.scenes.length - 1 };
  });
  for (const x of scenes) if (!x.fichier) return { ok: false, message: `La scène « ${x.s.id} » : le fichier « ${x.s.fichier} » sort du dossier du projet.` };
  const films = [...new Set(deroule.scenes.filter((s) => s.film && s.film.nom).map((s) => s.film.nom))];

  // Copie dans un dossier provisoire, renommé à la fin : jamais de déclinaison à moitié écrite.
  const travail = path.join(projet, DOSSIER, `.${nom}-en-cours`);
  fs.rmSync(travail, { recursive: true, force: true });
  fs.mkdirSync(travail, { recursive: true });
  try {
    const sansVoix = (s) => !langueChange || !(path.relative(projet, s) === VOIX || path.relative(projet, s).startsWith(VOIX + path.sep));
    for (const e of A_COPIER) copier(path.join(projet, e), path.join(travail, e), sansVoix);
    const F = require('./lib/film.js');
    for (const f of films) {
      const parcours = F.lireParcoursBrut(projet, f);
      const source = F.dossierFilm(projet, f);
      const dest = path.join(travail, path.relative(projet, source));
      fs.mkdirSync(dest, { recursive: true });
      copier(path.join(source, 'parcours.json'), path.join(dest, 'parcours.json'));
      if (parcours && parcours.prise) copier(path.join(source, parcours.prise), path.join(dest, parcours.prise));
    }

    const brut = JSON.parse(fs.readFileSync(path.join(projet, 'deroule.json'), 'utf8').replace(/^\uFEFF/, ''));
    const recopiees = [];
    const motifs = {};
    const motif = (id, texte) => { motifs[id] = motifs[id] ? `${motifs[id]} ; ${texte}` : texte; };
    const aTraduire = [];
    const voixRetirees = [];
    const logo = Boolean(deroule.charte && deroule.charte.logo);

    if (formatChange) {
      brut.format.ratio = format;
      if (format === '9:16') brut.format.plateforme = plateforme || deroule.format.plateforme || 'toutes';
      else delete brut.format.plateforme;
      for (const sc of brut.scenes || []) delete sc.ajustements;
      for (const x of scenes) {
        const s = x.s;
        const html = x.html || '';
        if (!s.type) { motif(s.id, `scène composée : mise en page à revoir en ${format}`); continue; }
        let modele;
        try { modele = fs.readFileSync(path.join(st.dossier, 'scenes', `${s.type}.html`), 'utf8'); } catch {
          motif(s.id, `le style n'a pas de scène toute faite « ${s.type} » : mise en page à revoir en ${format}`);
          continue;
        }
        const options = { type: s.type, id: s.id, duree: s.duree, textes: s.textes, derniere: x.derniere, logo, nombre: lireNombre(html) };
        const neuve = adapterScene(modele, options);
        // Une scène toute faite retouchée à la main (éléments, mouvements, caméra) : ses retouches sont à reporter.
        if (x.html !== null && sansBlancs(x.html) !== sansBlancs(neuve)) motif(s.id, 'retouchée à la main : reporter ses retouches dans la nouvelle mise en page');
        if (/\sdata-(personnage|action)\s*=/.test(html)) motif(s.id, 'personnages à replacer');
        if (/\sdata-camera\s*=/.test(html)) motif(s.id, 'caméra à revoir');
        if (Array.isArray(s.mouvements) && s.mouvements.length) motif(s.id, 'mouvements nommés à reposer');
        const dest = path.join(travail, path.relative(projet, x.fichier));
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, neuve, 'utf8');
        recopiees.push(s.id);
      }
    }

    if (langueChange) {
      brut.langue = etiquetteDemandee(langue);
      aTraduire.push({ champ: 'titre', texte: deroule.titre });
      for (const [i, s] of deroule.scenes.entries()) {
        for (const [cle, texte] of Object.entries(s.textes || {})) if (typeof texte === 'string' && texte.trim()) aTraduire.push({ scene: s.id, champ: `textes.${cle}`, texte });
        if (s.voix && s.voix.texte) aTraduire.push({ scene: s.id, champ: 'voix.texte', texte: s.voix.texte });
        if (s.chapitre) aTraduire.push({ scene: s.id, champ: 'chapitre', texte: s.chapitre });
        for (const cle of Object.keys(s.graphiques || {})) aTraduire.push({ scene: s.id, champ: `graphiques.${cle}`, note: 'étiquettes, unité et source du graphique' });
        const b = brut.scenes[i];
        if (b.voix && (b.voix.fichier || (deroule.voix && (deroule.voix.provisoire || deroule.voix.synthese)))) voixRetirees.push(s.id);
        if (b.voix) delete b.voix.fichier;
        if (textesEnDur(scenes[i].html || '').length) motif(s.id, 'textes écrits dans la scène : à traduire dans son fichier');
      }
      if (brut.voix) {
        if (brut.voix.provisoire !== undefined) brut.voix.provisoire = false;
        // Voix de synthèse : française seulement (spec S7, 5.12) ; elle ne parle pas la nouvelle langue.
        if (!Langues.de(brut.langue).kokoro.length) delete brut.voix.synthese;
      }
    }

    const usage = pour || (ratio !== '16:9' && formatChange ? 'reseaux' : undefined);
    brut.declinaison = { origine: '../..', ...(formatChange ? { format: deroule.format.ratio } : {}), ...(langueChange ? { langue: deroule.langue !== undefined ? deroule.langue : 'fr' } : {}), le, ...(usage ? { usage } : {}) };
    fs.writeFileSync(path.join(travail, 'deroule.json'), `${JSON.stringify(brut, null, 2)}\n`, 'utf8');
    // Accords repris (la personne a demandé la déclinaison) ; la vidéo finale reste à regarder.
    let parcours = deroule.parcours;
    try { parcours = JSON.parse(fs.readFileSync(path.join(projet, '.pulse-motion', 'etat.json'), 'utf8')).parcours || parcours; } catch { /* sans état */ }
    ecrireJSON(path.join(travail, '.pulse-motion', 'etat.json'), { parcours, accords: { deroule: true, style: true } });

    fs.renameSync(travail, cible);
    const aReecrire = deroule.scenes.map((s) => s.id).filter((id) => motifs[id]);
    return { ok: true, dossier: `${DOSSIER}/${nom}`, nom, recopiees, aReecrire, motifs, aTraduire, voixRetirees, ...(usage ? { usage } : {}) };
  } catch (e) {
    fs.rmSync(travail, { recursive: true, force: true });
    return { ok: false, message: `La déclinaison n'a pas pu être écrite (${e.code || e.message}) : l'original n'a pas changé.` };
  }
}

/** Déclinaisons d'un projet (declinaisons/<nom>/deroule.json) : [{ nom, dossier, format, langue, mp4 }] (langue : son nom
 *  français, « anglais » ; mp4 : le dernier export, ou null). */
function listerDeclinaisons(projet) {
  const racine = path.join(path.resolve(projet), DOSSIER);
  let noms = [];
  try { noms = fs.readdirSync(racine, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => e.name).sort(); } catch { return []; }
  const r = [];
  for (const nom of noms) {
    let d;
    try { d = JSON.parse(fs.readFileSync(path.join(racine, nom, 'deroule.json'), 'utf8').replace(/^\uFEFF/, '')); } catch { continue; }
    const langue = Langues.etiquetteDe(d);
    r.push({ nom, dossier: `${DOSSIER}/${nom}`, titre: d.titre || null, format: (d.format && d.format.ratio) || null, langue: Langues.nom(langue), etiquette: langue,
      mp4: require('./lib/videos.js').dernierMp4(path.join(racine, nom), d.titre) });
  }
  return r;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const OPTIONS = ['--format', '--langue', '--plateforme', '--pour'];
  const valeur = (o) => { const i = args.indexOf(o); return i >= 0 ? args[i + 1] : undefined; };
  const dossier = args.find((a, i) => !a.startsWith('--') && !OPTIONS.includes(args[i - 1]));
  if (!dossier) {
    console.error('Usage : pulse-motion decliner <dossier> [--format 9:16|1:1|4:5|16:9] [--langue <étiquette>] [--plateforme tiktok|shorts|reels|toutes] [--pour <usage>]');
    process.exit(2);
  }
  const r = decliner({ dossier, format: valeur('--format'), langue: valeur('--langue'), plateforme: valeur('--plateforme'), pour: valeur('--pour') });
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.ok ? 0 : 1);
}

module.exports = { decliner, listerDeclinaisons, DOSSIER };
