'use strict';
/* Pulse Motion – livrables de diffusion joints à l'export (spec Rendu et export, 5.10 à 5.12, 5.20) : chapitres (texte
 * YouTube, WebVTT, ffmetadata), crédits, sources des fichiers importés, noms des fichiers, plages d'images d'un extrait.
 * Écrits par Node dans les deux voies (export fidèle ; réception de la vidéo par l'aperçu). Chapitres : idées
 * d'explainroo (src/chapters.js : premier chapitre à 0:00, alertes YouTube, échappement ; MIT, © 2026 Vincent Schmalbach)
 * et d'argo (src/chapters.ts : ffmetadata ; MIT, © 2026 Shreyas Karnik), réécrites. Crédits : idée de lemo (CREDITS
 * obligatoire, MIT).
 *
 * chapitresDe(deroule, minutage) -> [{ debut, fin, titre, scene }] ([] sans chapitre déclaré)
 * texteYouTube(chapitres) · vttChapitres(chapitres) · ffmetadata(chapitres, titre) · alertesChapitres(chapitres)
 * credits({ projet, deroule, assemblage, version? }) -> { texte, aPreciser: [fichiers] }
 * lireSources(projet) · noterSource({ projet, fichier, source, licence, auteur? }) -> { ok, message }
 * nomSortie(slug, { usage, scene?, plage?, cadre?, transparent?, extension? }) · lirePlage(texte) · imagesDeScene · imagesDePlage
 * preparerSortie({ deroule, minutage, ips, scene?, plage?, gif?, cadre?, cadreFormat?, avecFfmpeg?, transparent?, flou?, usage?, tailleMax? })
 *   -> plage d'images | { erreur } ; combinaisonRefusee(options) -> message | null (fond transparent, flou forcé : 5.8, 5.14)
 * tailleGif(l, h, { usage, largeur? }) -> [largeur, hauteur]
 * ecrireLivrables({ projet, deroule, assemblage, usage, extrait? }) -> { fichiers, chapitres, creditsAPreciser, alertes }
 */
const fs = require('node:fs');
const path = require('node:path');
const { partieVisible } = require('../../moteur/minutage.js');
const { ecrireAtomique } = require('./fichiers.js');

const SOURCES = path.join('assets', 'sources.json');
const RAPPEL = 'Vous êtes responsable des contenus que vous ajoutez (images, musiques, polices, logos) : vérifiez que vous avez le droit de les publier.';
const A_PRECISER = 'source et licence à préciser';

const virgule = (x) => String(Math.round(x * 1000) / 1000).replace('.', ',');
const relatif = (projet, f) => path.relative(projet, f).split(path.sep).join('/');

/** Chapitres déclarés (scenes[].chapitre) aux instants de la page (débuts des scènes, voix comprises). Sans chapitre sur la
 *  première scène, le premier chapitre prend le titre de la vidéo à 0:00. */
function chapitresDe(deroule, minutage) {
  const scenes = (deroule && deroule.scenes) || [];
  if (!scenes.some((s) => s.chapitre)) return [];
  const liste = [];
  scenes.forEach((s, i) => { if (s.chapitre && minutage.scenes[i]) liste.push({ debut: minutage.scenes[i].debut, titre: s.chapitre, scene: s.id }); });
  if (!scenes[0].chapitre) liste.unshift({ debut: 0, titre: deroule.titre, scene: scenes[0].id });
  liste[0].debut = 0;
  liste.forEach((c, i) => { c.fin = i + 1 < liste.length ? liste[i + 1].debut : minutage.duree; });
  return liste;
}

/** 0:00, 1:05, 1:02:03 (au-delà d'une heure) : secondes entières, arrondies vers le bas. */
function horodatage(t) {
  const s = Math.max(0, Math.floor(t + 1e-6));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** Texte à coller dans la description YouTube : une ligne « 0:00 Titre » par chapitre. */
function texteYouTube(chapitres) {
  return `${chapitres.map((c) => `${horodatage(c.debut)} ${c.titre}`).join('\n')}\n`;
}

function horodatageVTT(t) {
  const ms = Math.max(0, Math.round(t * 1000));
  const h = String(Math.floor(ms / 3600000)).padStart(2, '0');
  const m = String(Math.floor((ms % 3600000) / 60000)).padStart(2, '0');
  const s = String(Math.floor((ms % 60000) / 1000)).padStart(2, '0');
  return `${h}:${m}:${s}.${String(ms % 1000).padStart(3, '0')}`;
}

/** WebVTT de chapitres (plateforme de formation, lecteur HTML). */
function vttChapitres(chapitres) {
  const blocs = chapitres.map((c, i) => `${i + 1}\n${horodatageVTT(c.debut)} --> ${horodatageVTT(c.fin)}\n${c.titre.replace(/-->/g, '→')}`);
  return `WEBVTT\n\n${blocs.join('\n\n')}\n`;
}

/** Échappement ffmetadata : « = ; # \ » et le saut de ligne précédés d'une barre oblique inverse. */
const echapperMeta = (t) => String(t).replace(/[=;#\\\n]/g, (c) => `\\${c}`);

/** Fichier ;FFMETADATA1 (TIMEBASE=1/1000) : titre de la vidéo et chapitres, pour -map_chapters. */
function ffmetadata(chapitres, titre) {
  const lignes = [';FFMETADATA1'];
  if (titre) lignes.push(`title=${echapperMeta(titre)}`);
  for (const c of chapitres) {
    lignes.push('', '[CHAPTER]', 'TIMEBASE=1/1000', `START=${Math.round(c.debut * 1000)}`, `END=${Math.round(c.fin * 1000)}`, `title=${echapperMeta(c.titre)}`);
  }
  return `${lignes.join('\n')}\n`;
}

/** Alertes YouTube (3 chapitres au moins, 10 s au moins chacun), en français. */
function alertesChapitres(chapitres) {
  if (!chapitres.length) return [];
  const a = [];
  if (chapitres.length < 3) a.push(`Il y a ${chapitres.length} chapitre${chapitres.length > 1 ? 's' : ''} : YouTube ne les affiche qu'à partir de 3.`);
  for (const c of chapitres) {
    if (c.fin - c.debut < 10 - 1e-6) a.push(`Le chapitre « ${c.titre} » dure ${virgule(Math.round((c.fin - c.debut) * 10) / 10)} s : YouTube demande au moins 10 s par chapitre.`);
  }
  return a;
}

/** assets/sources.json -> { "assets/x": { source, licence, auteur? } } ({} s'il manque ou s'il est illisible). */
function lireSources(projet) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(projet, SOURCES), 'utf8').replace(/^﻿/, ''));
    return j && typeof j === 'object' && !Array.isArray(j) ? j : {};
  } catch { return {}; }
}

/** Chemin d'un fichier de assets/ (relatif au projet, barres obliques) ; null s'il sort de assets/. */
function cheminAsset(projet, fichier) {
  const racine = path.resolve(projet, 'assets');
  const absolu = path.resolve(projet, String(fichier || ''));
  if (!absolu.startsWith(racine + path.sep)) return null;
  return relatif(projet, absolu);
}

/** Note d'où vient un fichier importé (pulse-motion credits <dossier> noter …). Seulement un fichier de assets/. */
function noterSource({ projet, fichier, source, licence, auteur }) {
  const rel = cheminAsset(projet, fichier);
  if (!rel) return { ok: false, message: `« ${fichier} » n'est pas dans le dossier assets/ de la vidéo : seuls les fichiers importés dans assets/ ont une source à noter.` };
  if (rel === 'assets/sources.json') return { ok: false, message: 'Ce fichier est la liste des sources elle-même.' };
  if (!fs.existsSync(path.join(projet, rel))) return { ok: false, message: `Fichier introuvable : « ${rel} ».` };
  if (!String(source || '').trim() || !String(licence || '').trim()) return { ok: false, message: 'Il faut la source (d\'où vient le fichier) et la licence (ce qu\'on a le droit d\'en faire).' };
  const sources = lireSources(projet);
  sources[rel] = { source: String(source).trim(), licence: String(licence).trim(), ...(String(auteur || '').trim() ? { auteur: String(auteur).trim() } : {}) };
  const tri = Object.fromEntries(Object.keys(sources).sort().map((k) => [k, sources[k]]));
  ecrireAtomique(path.join(projet, SOURCES), `${JSON.stringify(tri, null, 2)}\n`);
  return { ok: true, fichier: rel, message: `Source notée pour « ${rel} ».` };
}

/** Section « ## <famille> » de polices/LICENCES.md -> { source, licence } (null si absente). */
function licencePolice(famille, fichiers) {
  for (const f of fichiers) {
    let texte;
    try { texte = fs.readFileSync(path.join(path.dirname(f), 'LICENCES.md'), 'utf8'); } catch { continue; }
    // Deux rédactions : lignes « - Source : » et « - Licence : » (polices installées par Pulse Motion), ou texte libre avec
    // la licence (« licensed under the SIL Open Font License, Version 1.1 ») et la source en tête du fichier.
    const [preambule, ...sections] = texte.split(/^## /m);
    const s = sections.find((x) => x.split('\n')[0].trim() === famille) || sections.find((x) => x.includes(path.basename(f)));
    if (!s) continue;
    const ligne = (nom) => { const m = new RegExp(`^- ${nom} : (.+)$`, 'm').exec(s); return m ? m[1].trim() : null; };
    const libre = (t) => { const m = /licensed under the ([^\n]+?)\.?\s*$/m.exec(t || '') || /distribuées sous (SIL Open Font License[^.,\n]*)/.exec(t || ''); return m ? m[1].trim() : null; };
    const licence = ligne('Licence') || libre(s) || libre(preambule);
    const parentheses = /\(([^()]*(?:fontsource|bunny|jsdelivr|google)[^()]*)\)/i.exec(preambule);
    const source = ligne('Source') || (parentheses ? parentheses[1].trim() : null);
    if (licence) return { source, licence };
  }
  return null;
}

function versionPlugin() {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '.claude-plugin', 'plugin.json'), 'utf8')).version; } catch { return ''; }
}

const ROLES = { titres: 'titres', texte: 'texte', code: 'code', formules: 'formules' };

/**
 * Crédits de la vidéo, en français : polices (rôle, licence, source), musique, voix, images et logos, sons importés, version
 * de Pulse Motion, rappel de responsabilité. aPreciser : fichiers importés sans source ni licence.
 */
function credits({ projet, deroule, assemblage, version = versionPlugin() }) {
  const sources = lireSources(projet);
  const aPreciser = [];
  const ligneFichier = (rel) => {
    const s = sources[rel];
    if (!s) { aPreciser.push(rel); return `- ${rel} : ${A_PRECISER}`; }
    return `- ${rel} : ${s.source}, ${s.licence}${s.auteur ? `, ${s.auteur}` : ''}`;
  };
  const lignes = [`Crédits de la vidéo « ${deroule.titre} »`, ''];
  lignes.push('Polices');
  const polices = (assemblage && assemblage.detailPolices) || [];
  if (!polices.length) lignes.push('- polices du système, aucune police embarquée');
  for (const p of polices) {
    const l = licencePolice(p.famille, p.fichiers);
    const roles = p.roles.map((r) => ROLES[r] || r).join(', ');
    if (l && l.licence) lignes.push(`- ${p.famille}${roles ? ` (${roles})` : ''} : ${l.licence}${l.source ? ` ; source : ${l.source}` : ''}`);
    else {
      const rel = p.fichiers.map((f) => relatif(projet, f)).find((r) => !r.startsWith('..')) || p.famille;
      aPreciser.push(rel);
      lignes.push(`- ${p.famille}${roles ? ` (${roles})` : ''} : licence à préciser`);
    }
  }
  lignes.push('', 'Musique');
  const m = deroule.musique;
  if (!m) lignes.push('- aucune musique');
  else if (m.fichier) lignes.push(ligneFichier(m.fichier.replace(/\\/g, '/').replace(/^\.\//, '')).replace(/^- /, '- fichier importé '));
  else lignes.push('- composée par Pulse Motion, libre de droits, sans mention obligatoire');
  lignes.push('', 'Voix');
  const parlees = ((assemblage && assemblage.donnees && assemblage.donnees.scenes) || []).filter((s) => s.voix);
  // Voix de synthèse locale (spec S7, 5.12 ; S5, Q18) : mention de licence du modèle et du corpus de la voix.
  const synthese = parlees.some((s) => s.voix.synthese);
  const voix = parlees.filter((s) => !s.voix.synthese);
  if (synthese) lignes.push(`- ${require('./voix-locale.js').MENTION}`);
  if (!voix.length) { if (!synthese) lignes.push('- aucune voix'); } else if (voix.every((s) => s.voix.provisoire)) lignes.push('- voix de synthèse du système (provisoire)');
  else lignes.push(`- enregistrée par vous${voix.some((s) => s.voix.provisoire) ? ' (certaines scènes : voix de synthèse du système, provisoire)' : ''}`);
  const ressources = ((assemblage && assemblage.ressources) || []).map((r) => ({ ...r, rel: relatif(projet, r.fichier) })).filter((r) => !r.rel.startsWith('..'));
  const images = ressources.filter((r) => r.sorte === 'image').map((r) => r.rel).sort();
  const sons = ressources.filter((r) => r.sorte === 'son').map((r) => r.rel).sort();
  lignes.push('', 'Images et logos');
  if (!images.length) lignes.push('- aucune image importée');
  for (const rel of images) lignes.push(ligneFichier(rel));
  lignes.push('', 'Sons importés');
  if (!sons.length) lignes.push('- aucun son importé (bruitages composés par Pulse Motion)');
  for (const rel of sons) lignes.push(ligneFichier(rel));
  lignes.push('', `Fabriqué avec Pulse Motion ${version} (licence MIT).`, '', RAPPEL, '');
  return { texte: lignes.join('\n'), aPreciser: [...new Set(aPreciser)] };
}

/** « 12,5-18 » ou « 12.5-18 » (secondes) -> { debut, fin } | { erreur } */
function lirePlage(texte) {
  const m = /^\s*(\d+(?:[.,]\d+)?)\s*-\s*(\d+(?:[.,]\d+)?)\s*$/.exec(String(texte || ''));
  if (!m) return { erreur: `Passage « ${texte} » illisible : donner le début et la fin en secondes, par exemple « 12,5-18 ».` };
  const debut = Number(m[1].replace(',', '.'));
  const fin = Number(m[2].replace(',', '.'));
  if (!(fin > debut)) return { erreur: `Passage « ${texte} » : la fin doit venir après le début.` };
  return { debut, fin };
}

/** Images [f0, f1) d'un passage (convention de take-one : f0 = round(début × ips), f1 = round(fin × ips)), bornées à la vidéo. */
function imagesDePlage({ debut, fin }, ips, duree) {
  const total = Math.round(duree * ips);
  const f0 = Math.min(total, Math.max(0, Math.round(debut * ips)));
  const f1 = Math.min(total, Math.max(0, Math.round(fin * ips)));
  return f1 > f0 ? { f0, f1 } : { erreur: `Le passage demandé commence après la fin de la vidéo (${virgule(duree)} s).` };
}

/** Images [f0, f1) de la partie visible d'une scène : images n avec debut ≤ n / ips < fin (aucune image de transition). */
function imagesDeScene(minutage, i, ips) {
  const v = partieVisible(minutage, i);
  const f0 = Math.ceil(v.debut * ips - 1e-6);
  const f1 = Math.max(f0 + 1, Math.ceil(v.fin * ips - 1e-6));
  return { f0, f1 };
}

/** GIF : 20 s au plus (5.13). */
const GIF_MAX = 20;
/** Fonds transparents (5.14) : mov (montage, par défaut) ou webm (pour le web). */
const TRANSPARENTS = ['mov', 'webm'];
const lireTransparent = (v) => (v === true || v === '' || v === 'oui' ? 'mov' : String(v).toLowerCase());

/** Combinaison d'options refusée (5.8, 5.13, 5.14, 5.15) : message français, ou null. flou : forcé (true, false) ou null. */
function combinaisonRefusee({ gif = false, cadre = null, avecFfmpeg = true, transparent = null, flou = null, usage = null, tailleMax = null }) {
  if (transparent) {
    const t = lireTransparent(transparent);
    if (!TRANSPARENTS.includes(t)) return `Fond transparent « ${transparent} » inconnu : pour le montage (mov) ou pour le web (webm).`;
    if (usage === 'courriel' || tailleMax) return 'Une vidéo à fond transparent est faite pour un montage : elle ne tient pas dans une taille visée (courriel). Je la fais pour le montage, ou une vidéo légère sans transparence.';
    if (usage === 'brouillon') return 'La version de travail n\'a pas de fond transparent : je fais la vidéo à fond transparent pour le montage, ou une version de travail normale.';
    if (gif) return 'Le GIF ne garde pas la transparence : je fais la vidéo à fond transparent pour le montage, ou un GIF sur le fond de la vidéo.';
    if (cadre) return 'Le cadre de téléphone a son propre fond : choisir la vidéo à fond transparent, ou la vidéo dans le cadre.';
    if (flou === true) return 'Une vidéo à fond transparent n\'a pas de flou de mouvement (il salirait ses bords à l\'incrustation) : je la fais sans flou.';
    if (t === 'mov' && !avecFfmpeg) return 'La vidéo à fond transparent a besoin de ffmpeg sur cet ordinateur : je peux l\'installer une fois.';
  }
  if (flou === true && gif) return 'Le GIF n\'a pas de flou de mouvement : je le fais net.';
  if (flou === true && usage === 'brouillon') return 'La version de travail n\'a pas de flou de mouvement (elle doit sortir vite) : je la fais sans flou, ou je fais le master.';
  return null;
}
const FORMATS_CADRE = ['16:9', '1:1'];

/**
 * Sortie demandée, vérifiée avant toute capture (spec Rendu et export, 5.12, 5.13, 5.15) : extrait d'une scène ou passage
 * seul, GIF, cadre de téléphone. minutage : celui de la vidéo (voix comprises) ; avecFfmpeg : ffmpeg utilisable.
 * -> { extrait, f0, f1, scene, plage, duree, gif, cadre, cadreFormat } | { erreur }
 */
function preparerSortie({ deroule, minutage, ips, scene = null, plage = null, gif = false, cadre = null, cadreFormat = null, avecFfmpeg = true,
  transparent = null, flou = null, usage = null, tailleMax = null }) {
  // Rendu avancé (spec Rendu et export, 5.8, 5.14) : combinaisons qui n'ont pas de sens, refusées avant toute capture.
  const refus = combinaisonRefusee({ gif, cadre, avecFfmpeg, transparent, flou, usage, tailleMax });
  if (refus) return { erreur: refus };
  if (scene && plage) return { erreur: 'Choisir une scène ou un passage, pas les deux.' };
  if (cadre && cadre !== 'telephone') return { erreur: `Cadre « ${cadre} » inconnu : seul le cadre de téléphone existe.` };
  if (cadre && deroule.format.ratio !== '9:16') return { erreur: 'Le cadre de téléphone est fait pour une vidéo verticale.' };
  if (cadreFormat && !FORMATS_CADRE.includes(cadreFormat)) return { erreur: `Format du cadre « ${cadreFormat} » inconnu : 16:9 ou 1:1.` };
  if (gif && cadre) return { erreur: 'Le GIF ne se fait pas dans un cadre de téléphone : faire le GIF seul, ou la vidéo dans le cadre.' };
  if (gif && !avecFfmpeg) return { erreur: 'Le GIF a besoin de ffmpeg, qui n\'est pas installé : je peux l\'installer une fois, ou faire un MP4 léger de la scène.' };
  const total = Math.round(minutage.duree * ips);
  let r = { f0: 0, f1: total };
  let lue = null;
  let id = null;
  if (scene) {
    const i = minutage.scenes.findIndex((s) => s.id === scene);
    if (i < 0) {
      // Scènes proches (spec Retouches et ergonomie, 5.16) ; la liste entière si aucune ne ressemble.
      const P = require('../../moteur/proches.js');
      const ids = minutage.scenes.map((s) => s.id);
      const l = P.proches(scene, ids);
      return { erreur: l.length ? `Scène « ${scene} » inconnue ; ${P.phrase(l)}` : `Scène « ${scene} » inconnue : ${ids.join(', ')}.` };
    }
    r = imagesDeScene(minutage, i, ips);
    r.f1 = Math.min(r.f1, total);
    id = scene;
  } else if (plage) {
    lue = typeof plage === 'string' ? lirePlage(plage) : plage;
    if (lue.erreur) return { erreur: lue.erreur };
    r = imagesDePlage(lue, ips, minutage.duree);
    if (r.erreur) return { erreur: r.erreur };
  }
  const duree = (r.f1 - r.f0) / ips;
  if (gif && duree > GIF_MAX + 1e-6) {
    const quoi = scene ? `de la scène « ${scene} » (${virgule(Math.round(duree))} s)` : `de ${virgule(Math.round(duree))} s`;
    return { erreur: `Un GIF ${quoi} serait très lourd : je vous propose celui d'une scène plus courte (laquelle ?) ou d'un passage de ${GIF_MAX} s au plus.` };
  }
  return { extrait: Boolean(scene || plage), f0: r.f0, f1: r.f1, scene: id, plage: lue, duree, gif: Boolean(gif), cadre: cadre || null, cadreFormat: cadre ? cadreFormat || '16:9' : null,
    transparent: transparent ? lireTransparent(transparent) : null };
}

/** Grand côté d'un GIF : 960 px, 640 pour le courriel, 1 280 au plus sur demande. -> [largeur, hauteur] paires */
function tailleGif(largeurVideo, hauteurVideo, { usage = 'web', largeur = null } = {}) {
  const cote = Math.min(1280, Math.max(64, Number(largeur) || (usage === 'courriel' ? 640 : 960)));
  const r = cote / Math.max(largeurVideo, hauteurVideo);
  const pair = (x) => Math.max(2, Math.round(x / 2) * 2);
  return [pair(largeurVideo * r), pair(hauteurVideo * r)];
}

/** Nom d'un fichier de sortie (spec Rendu et export, 5.6) : <slug>[-<usage>][-telephone][-transparent][-<scène> | -de-12,5s-a-18s].<ext>
 *  (le web n'a pas de suffixe d'usage). */
function nomSortie(slug, { usage = 'web', scene = null, plage = null, cadre = null, transparent = false, extension = 'mp4' } = {}) {
  const parts = [slug];
  if (usage && usage !== 'web') parts.push(usage);
  if (cadre) parts.push(cadre);
  if (transparent) parts.push('transparent');
  if (scene) parts.push(scene);
  let nom = parts.join('-');
  if (plage) nom += `-de-${virgule(plage.debut)}s-a-${virgule(plage.fin)}s`;
  return `${nom}.${extension}`;
}

/**
 * Livrables écrits par Node après un export réussi : crédits (toujours), chapitres en texte et en WebVTT (usage qui les joint,
 * chapitres déclarés, vidéo entière). -> { fichiers: { credits, chapitres? }, chapitres, creditsAPreciser, alertes }
 */
function ecrireLivrables({ projet, deroule, assemblage, usage, extrait = false, minutage = assemblage && assemblage.minutage }) {
  const { slug } = require('../assembler.js');
  const base = slug(deroule.titre);
  const sortie = path.join(projet, 'sortie');
  fs.mkdirSync(sortie, { recursive: true });
  const c = credits({ projet, deroule, assemblage });
  const fichierCredits = path.join(sortie, `${base}-credits.txt`);
  ecrireAtomique(fichierCredits, c.texte);
  const fichiers = { credits: relatif(projet, fichierCredits) };
  const joints = (usage && usage.fichiers) || [];
  const chapitres = !extrait && joints.includes('chapitres') && minutage ? chapitresDe(deroule, minutage) : [];
  const alertes = alertesChapitres(chapitres);
  const txt = path.join(sortie, `${base}-chapitres.txt`);
  const vtt = path.join(sortie, `${base}-chapitres.vtt`);
  if (chapitres.length) {
    ecrireAtomique(txt, texteYouTube(chapitres));
    ecrireAtomique(vtt, vttChapitres(chapitres));
    fichiers.chapitres = [relatif(projet, txt), relatif(projet, vtt)];
  } else if (!extrait && !(deroule.scenes || []).some((s) => s.chapitre)) {
    // Chapitres retirés du déroulé : les anciens fichiers ne restent pas.
    fs.rmSync(txt, { force: true });
    fs.rmSync(vtt, { force: true });
  }
  return { fichiers, chapitres, creditsAPreciser: c.aPreciser, alertes };
}

module.exports = {
  combinaisonRefusee, lireTransparent, TRANSPARENTS,
  chapitresDe, texteYouTube, vttChapitres, ffmetadata, alertesChapitres, horodatage, credits, lireSources, noterSource,
  lirePlage, imagesDePlage, imagesDeScene, nomSortie, ecrireLivrables, preparerSortie, tailleGif, RAPPEL, A_PRECISER, GIF_MAX,
};
