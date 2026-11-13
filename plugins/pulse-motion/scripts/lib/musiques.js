'use strict';
/* Pulse Motion – bibliothèque personnelle de musiques (spec S9, 5.13) : la personne garde ses propres musiques (achetées,
 * libres, ou dont elle a les droits), avec leur licence, d'une vidéo à l'autre. Le plugin n'en livre aucune (5.16).
 *
 *   ~/.pulse-motion/musiques/<id>/musique.<ext>   le fichier, copié tel quel
 *   ~/.pulse-motion/musiques/<id>/fiche.json      { titre, auteur, licence, licenceTexte?, source, attribution, ambiances,
 *                                                   tempo, duree, sonie, boucle, fichier, ajoutee }
 *
 * Licences : personnelle (« j'en ai les droits »), cc0, cc-by (attribution obligatoire), achetee (banque de musique), autre
 * (avec son texte : « autre:<texte> »). Durée, tempo et sonie sont mesurés à l'ajout, dans Chrome ou Edge sans fenêtre
 * (decodeAudioData), jamais par ffmpeg : battements de moteur/analyse-son.js, sonie de moteur/sonie.js.
 * Par copie (spec 2026-10-23, § 6 bis) : utiliser une musique la copie dans assets/musique/ de la vidéo, qui reste autonome ;
 * modifier ou retirer la musique de la bibliothèque ne change aucune vidéo.
 *
 * validerFiche(fiche) -> [fautes] ; lireLicence(texte) -> { code, texte? } | { erreur }
 * tempoDuFlux(flux, cadence) -> bpm (60 à 180) | null ; mesurerMusique({ fichier, navigateur }) -> { duree, tempo, sonie }
 * ajouterMusique({ fichier, ambiances, licence, titre?, auteur?, source?, attribution?, personnel?, mesurer? })
 * listerMusiques({ ambiance?, personnel? }) ; utiliserMusique({ id, projet, remplacer?, personnel? }) ; retirerMusique({ id })
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { dossierPersonnel } = require('./personnel.js');
const { ecrireAtomique } = require('./fichiers.js');
const { AMBIANCES } = require('../../moteur/synthe/catalogue.js');

const RACINE = path.resolve(__dirname, '..', '..');
const NOM = /^[a-z0-9-]+$/;
/** Formats que la page sait embarquer et lire (scripts/lib/embarquer.js). */
const FORMATS = { '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.opus': 'audio/ogg' };
const LICENCES = {
  personnelle: 'licence personnelle (droits détenus par la personne)',
  cc0: 'CC0 (domaine public)',
  'cc-by': 'CC BY (attribution obligatoire)',
  achetee: 'achetée (banque de musique)',
  autre: 'autre licence',
};
const MESSAGE_LICENCE = 'Il faut la licence de cette musique : personnelle (« j\'en ai les droits »), cc0, cc-by (avec l\'attribution à citer), achetee (banque de musique) ou autre:<son texte>.';

const echec = (message, plus = {}) => Object.assign({ ok: false, message }, plus);
const racine = (personnel) => path.join(personnel || dossierPersonnel(), 'musiques');
const estTexte = (v) => typeof v === 'string' && v.trim() !== '';
const lireJSONsur = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, '')); } catch { return null; } };

function slug(texte) {
  return String(texte || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
}

/** « cc-by », « autre:Licence du studio X » -> { code, texte? } | { erreur } */
function lireLicence(valeur) {
  const v = String(valeur || '').trim();
  if (!v) return { erreur: MESSAGE_LICENCE };
  const m = /^autre\s*:\s*(.*)$/is.exec(v);
  if (m) return m[1].trim() ? { code: 'autre', texte: m[1].trim() } : { erreur: 'Licence « autre » : il faut son texte (ce que la licence permet), par exemple « autre:usage commercial permis, sans revente ».' };
  if (v.toLowerCase() === 'autre') return { erreur: 'Licence « autre » : il faut son texte (ce que la licence permet), par exemple « autre:usage commercial permis, sans revente ».' };
  const code = v.toLowerCase();
  return Object.hasOwn(LICENCES, code) ? { code } : { erreur: `Licence « ${v} » inconnue. ${MESSAGE_LICENCE}` };
}

/** Fautes d'une fiche (ajout et import d'une archive). */
function validerFiche(f) {
  const fautes = [];
  if (!f || typeof f !== 'object' || Array.isArray(f)) return ['fiche.json illisible'];
  if (!estTexte(f.titre)) fautes.push('titre manquant');
  if (!Object.hasOwn(LICENCES, f.licence)) fautes.push(MESSAGE_LICENCE);
  if (f.licence === 'cc-by' && !estTexte(f.attribution)) fautes.push('Licence cc-by : l\'attribution (le texte à citer dans les crédits) est obligatoire.');
  if (f.licence === 'autre' && !estTexte(f.licenceTexte)) fautes.push('Licence « autre » : il faut son texte.');
  if (!Array.isArray(f.ambiances) || !f.ambiances.length || f.ambiances.some((a) => !Object.hasOwn(AMBIANCES, a))) fautes.push(`ambiances : une ou plusieurs de ${Object.keys(AMBIANCES).join(', ')}`);
  if (!(typeof f.duree === 'number' && f.duree > 0)) fautes.push('durée inconnue');
  if (f.tempo !== null && !(typeof f.tempo === 'number' && f.tempo >= 60 && f.tempo <= 180)) fautes.push('tempo : un nombre de 60 à 180, ou null');
  if (!(typeof f.fichier === 'string' && /^musique\.[a-z0-9]+$/.test(f.fichier) && Object.hasOwn(FORMATS, path.extname(f.fichier)))) fautes.push('fichier : musique.<mp3|m4a|aac|wav|ogg|opus>');
  return fautes;
}

/**
 * Tempo d'une musique tiré du flux spectral (analyse-son, cadence images par seconde) : autocorrélation de la force des
 * attaques (flux moins sa moyenne sur une demi-seconde, puis centrée), retards de 60 à 180 battements par minute, pondérés autour de 120
 * (une octave d'écart-type, pour ne pas prendre la moitié ou le double), affinée entre ses deux voisins. null si la
 * pulsation n'est pas nette (pic sous 15 % de l'énergie), ou si la musique dure moins de 4 s.
 */
function tempoDuFlux(flux, cadence = 60) {
  const n = flux ? flux.length : 0;
  if (n < cadence * 4) return null;
  const w = Math.round(cadence / 2);
  const cumul = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) cumul[i + 1] = cumul[i] + flux[i];
  const o = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - w), b = Math.min(n, i + w + 1);
    o[i] = Math.max(0, flux[i] - (cumul[b] - cumul[a]) / (b - a));
  }
  // Centrée : un bruit sans pulsation ne donne alors aucun pic.
  let moyenne = 0;
  for (let i = 0; i < n; i++) moyenne += o[i] / n;
  for (let i = 0; i < n; i++) o[i] -= moyenne;
  const auto = (L) => { let s = 0; for (let i = 0; i + L < n; i++) s += o[i] * o[i + L]; return s / (n - L); };
  const energie = auto(0);
  if (!(energie > 0)) return null;
  const lmin = Math.floor((60 * cadence) / 180), lmax = Math.ceil((60 * cadence) / 60);
  const ac = new Map();
  for (let L = lmin - 1; L <= lmax + 1; L++) ac.set(L, auto(L));
  const poids = (L) => Math.exp(-0.5 * Math.log2((60 * cadence) / L / 120) ** 2);
  let meilleur = lmin;
  for (let L = lmin; L <= lmax; L++) if (ac.get(L) * poids(L) > ac.get(meilleur) * poids(meilleur)) meilleur = L;
  if (ac.get(meilleur) < 0.15 * energie) return null;
  const [a, b, c] = [ac.get(meilleur - 1), ac.get(meilleur), ac.get(meilleur + 1)];
  const d = a - 2 * b + c;
  const decalage = d < 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / d)) : 0;
  const bpm = Math.round((60 * cadence) / (meilleur + decalage));
  return bpm >= 60 && bpm <= 180 ? bpm : null;
}

// Page d'aide : le fichier servi en /_pm/source, décodé par le navigateur, mesuré par les modules du moteur.
const PAGE = `<!doctype html><meta charset="utf-8"><title>Pulse Motion – musique</title>
<script src="/_pm/sonie.js"></script><script src="/_pm/analyse-son.js"></script>
<script>
window.__pmMesurer = async function () {
  var donnees = await (await fetch('/_pm/source')).arrayBuffer();
  var b;
  try { b = await new OfflineAudioContext(2, 1, 44100).decodeAudioData(donnees); } catch (e) { return { erreur: 'decodage' }; }
  var canaux = [];
  for (var c = 0; c < b.numberOfChannels; c++) canaux.push(b.getChannelData(c));
  var mono = new Float32Array(b.length);
  canaux.forEach(function (x) { for (var i = 0; i < x.length; i++) mono[i] += x[i] / canaux.length; });
  var s = M.sonie.mesurer(canaux, b.sampleRate);
  var t = M.analyseSon.analyser(mono, b.sampleRate, {});
  return { duree: b.duration, sonie: isFinite(s.integree) ? s.integree : null, cadence: t.cadence,
    flux: Array.prototype.map.call(t.flux, function (v) { return Math.round(v * 1000) / 1000; }) };
};
window.__pmPret = true;
</script>`;

/** Durée (s), tempo (bpm ou null) et sonie (LUFS intégrés) d'un fichier, dans Chrome ou Edge sans fenêtre. */
async function mesurerMusique({ fichier, navigateur = require('./navigateur.js').trouverNavigateur() }) {
  if (!navigateur) throw Object.assign(new Error('Chrome ou Edge introuvable : la musique se mesure dans le navigateur (durée, tempo, volume). Lancez « pulse-motion outils » pour voir quoi installer.'), { francais: true });
  const { servirAide } = require('./import.js');
  const { ouvrirPage } = require('./cdp.js');
  const js = (f) => [() => fs.readFileSync(path.join(RACINE, 'moteur', f)), 'text/javascript; charset=utf-8'];
  const aide = await servirAide(fichier, FORMATS[path.extname(fichier).toLowerCase()] || 'application/octet-stream', { page: PAGE, routes: { '/_pm/sonie.js': js('sonie.js'), '/_pm/analyse-son.js': js('analyse-son.js') } });
  let page;
  try {
    page = await ouvrirPage({ navigateur, largeur: 320, hauteur: 200, delai: 120000 });
    await page.aller(aide.url);
    for (let i = 0; i < 100 && !(await page.evaluer('!!window.__pmPret')); i++) await new Promise((r) => setTimeout(r, 50));
    const r = await page.evaluer('window.__pmMesurer()');
    if (!r || r.erreur) throw Object.assign(new Error('Ce fichier ne se lit pas comme une musique (format abîmé, ou non pris en charge par le navigateur).'), { francais: true });
    return { duree: Math.round(r.duree * 100) / 100, tempo: tempoDuFlux(r.flux, r.cadence), sonie: r.sonie === null ? null : Math.round(r.sonie * 10) / 10 };
  } finally {
    if (page) await page.fermer().catch(() => {});
    await aide.fermer();
  }
}

const empreinte = (donnees) => crypto.createHash('sha256').update(donnees).digest('hex');

function lireMusique(id, personnel) {
  if (!NOM.test(id || '')) return null;
  const dossier = path.join(racine(personnel), id);
  const fiche = lireJSONsur(path.join(dossier, 'fiche.json'));
  if (!fiche || validerFiche(fiche).length || !fs.existsSync(path.join(dossier, fiche.fichier))) return null;
  return { id, dossier, fiche };
}

function idsMusiques(personnel) {
  try { return fs.readdirSync(racine(personnel), { withFileTypes: true }).filter((e) => e.isDirectory() && NOM.test(e.name)).map((e) => e.name).sort(); } catch { return []; }
}

/** Musiques gardées (fiches valides), triées par titre ; ambiance : seulement celles de cette ambiance. */
function listerMusiques({ ambiance = null, personnel } = {}) {
  if (ambiance && !Object.hasOwn(AMBIANCES, ambiance)) return echec(`Ambiance « ${ambiance} » inconnue : ${Object.keys(AMBIANCES).join(', ')}.`);
  const musiques = idsMusiques(personnel).map((id) => lireMusique(id, personnel)).filter(Boolean)
    .filter((m) => !ambiance || m.fiche.ambiances.includes(ambiance))
    .map(({ id, fiche: f }) => ({ id, titre: f.titre, ...(f.auteur ? { auteur: f.auteur } : {}), licence: f.licence, ambiances: f.ambiances, tempo: f.tempo, duree: f.duree, sonie: f.sonie }))
    .sort((a, b) => a.titre.localeCompare(b.titre, 'fr'));
  return { ok: true, musiques };
}

/**
 * Garde une musique dans la bibliothèque. Licence obligatoire ; cc-by sans attribution refusée ; « autre » sans texte refusée.
 * mesurer (tests) : remplace la mesure dans le navigateur. -> { ok, id, fiche } | { ok: false, message, raison? }
 */
async function ajouterMusique({ fichier, ambiances, licence, titre, auteur, source, attribution, personnel, navigateur, mesurer = mesurerMusique } = {}) {
  const absolu = path.resolve(String(fichier || ''));
  if (!fichier || !fs.existsSync(absolu) || !fs.statSync(absolu).isFile()) return echec(`Fichier « ${fichier || ''} » introuvable : donner le chemin de la musique.`);
  const ext = path.extname(absolu).toLowerCase();
  if (!Object.hasOwn(FORMATS, ext)) return echec(`Format « ${ext || 'sans extension'} » non pris en charge : mp3, m4a, aac, wav, ogg ou opus.`);
  const l = lireLicence(licence);
  if (l.erreur) return echec(l.erreur, { raison: 'licence' });
  if (l.code === 'cc-by' && !estTexte(attribution)) return echec('Licence cc-by : il faut l\'attribution à citer dans les crédits (par exemple « « Matin clair » de Jeanne Martin, CC BY 4.0 »). Demandez-la à la personne.', { raison: 'attribution' });
  const liste = (Array.isArray(ambiances) ? ambiances : String(ambiances || '').split(',')).map((a) => String(a).trim()).filter(Boolean);
  if (!liste.length) return echec(`Il faut au moins une ambiance pour retrouver cette musique : ${Object.keys(AMBIANCES).join(', ')}.`);
  const inconnue = liste.find((a) => !Object.hasOwn(AMBIANCES, a));
  if (inconnue) return echec(`Ambiance « ${inconnue} » inconnue : ${Object.keys(AMBIANCES).join(', ')}.`);
  const donnees = fs.readFileSync(absolu);
  const nomTitre = estTexte(titre) ? titre.trim() : path.basename(absolu, path.extname(absolu));
  // Déjà gardée (même fichier) : rien n'est copié une seconde fois.
  for (const id of idsMusiques(personnel)) {
    const m = lireMusique(id, personnel);
    if (m && fs.readFileSync(path.join(m.dossier, m.fiche.fichier)).equals(donnees)) return { ok: true, id, deja: true, fiche: m.fiche, message: `Cette musique est déjà dans votre bibliothèque (« ${m.fiche.titre} »).` };
  }
  let mesure;
  try { mesure = await mesurer({ fichier: absolu, navigateur }); } catch (e) { return echec(e.francais ? e.message : `La musique n'a pas pu être mesurée (${e.message}).`); }
  const base = slug(nomTitre) || 'musique';
  let id = base;
  for (let k = 2; fs.existsSync(path.join(racine(personnel), id)); k++) id = `${base}-${k}`;
  const fiche = {
    titre: nomTitre, auteur: estTexte(auteur) ? auteur.trim() : '', licence: l.code, ...(l.texte ? { licenceTexte: l.texte } : {}),
    source: estTexte(source) ? source.trim() : '', attribution: estTexte(attribution) ? attribution.trim() : '', ambiances: [...new Set(liste)],
    tempo: mesure.tempo, duree: mesure.duree, sonie: mesure.sonie, boucle: false, fichier: `musique${ext}`, ajoutee: new Date().toISOString().slice(0, 10),
  };
  const fautes = validerFiche(fiche);
  if (fautes.length) return echec(fautes.join(' '));
  // Écrit à côté, puis renommé : une musique n'existe dans la bibliothèque qu'entière.
  const final = path.join(racine(personnel), id);
  const temporaire = `${final}.part-${process.pid}`;
  fs.rmSync(temporaire, { recursive: true, force: true });
  fs.mkdirSync(temporaire, { recursive: true });
  try {
    fs.writeFileSync(path.join(temporaire, fiche.fichier), donnees);
    fs.writeFileSync(path.join(temporaire, 'fiche.json'), `${JSON.stringify(fiche, null, 2)}\n`, 'utf8');
    fs.renameSync(temporaire, final);
  } catch (e) {
    fs.rmSync(temporaire, { recursive: true, force: true });
    return echec(`La musique n'a pas pu être rangée dans votre bibliothèque (${e.code || e.message}).`);
  }
  return { ok: true, id, fiche };
}

/** Libellé de la licence pour les crédits. */
function libelleLicence(f) {
  return f.licence === 'autre' ? `autre licence : ${f.licenceTexte}` : LICENCES[f.licence];
}

/**
 * Copie une musique de la bibliothèque dans la vidéo (assets/musique/<id>.<ext>), écrit musique.fichier et
 * musique.origine (« bibliotheque:<id> ») dans le déroulé (volume gardé), et note sa source et sa licence pour les crédits
 * (assets/sources.json). Un fichier déjà là, différent, n'est remplacé qu'avec remplacer (après l'accord de la personne).
 */
function utiliserMusique({ id, projet = '.', remplacer = false, personnel } = {}) {
  const dossier = path.resolve(projet);
  const fichierDeroule = path.join(dossier, 'deroule.json');
  if (!fs.existsSync(fichierDeroule)) return echec('Aucune vidéo dans ce dossier : ouvrez Claude Code dans le dossier de la vidéo où mettre cette musique.');
  const m = lireMusique(id, personnel);
  if (!m) {
    const ids = idsMusiques(personnel);
    return echec(`Musique « ${id || ''} » introuvable dans votre bibliothèque${ids.length ? ` (${ids.join(', ')})` : ' (elle est vide)'}.`);
  }
  const ext = path.extname(m.fiche.fichier);
  const rel = `assets/musique/${id}${ext}`;
  const cible = path.join(dossier, ...rel.split('/'));
  const donnees = fs.readFileSync(path.join(m.dossier, m.fiche.fichier));
  if (fs.existsSync(cible) && !fs.readFileSync(cible).equals(donnees) && !remplacer) {
    return echec(`La vidéo a déjà un fichier « ${rel} », différent : demandez à la personne s'il faut le remplacer.`, { raison: 'pris', fichier: rel });
  }
  let brut;
  try { brut = JSON.parse(fs.readFileSync(fichierDeroule, 'utf8').replace(/^\uFEFF/, '')); } catch { return echec('deroule.json est illisible : rien n\'a été changé.'); }
  ecrireAtomique(cible, donnees);
  const avant = brut.musique && typeof brut.musique === 'object' ? brut.musique : {};
  brut.musique = { fichier: rel, origine: `bibliotheque:${id}`, ...(avant.volume !== undefined ? { volume: avant.volume } : {}) };
  ecrireAtomique(fichierDeroule, `${JSON.stringify(brut, null, 2)}\n`);
  const f = m.fiche;
  const L = require('./livrables.js');
  const note = L.noterSource({ projet: dossier, fichier: rel, source: f.source || 'bibliothèque personnelle de musiques', licence: libelleLicence(f),
    auteur: [f.titre ? `« ${f.titre} »` : '', f.auteur].filter(Boolean).join(', '), attribution: f.attribution, licenceCode: f.licence });
  if (!note.ok) return echec(note.message);
  return { ok: true, id, fichier: rel, origine: `bibliotheque:${id}`, tempo: f.tempo, duree: f.duree, licence: f.licence, empreinte: empreinte(donnees) };
}

/** Retire une musique de la bibliothèque ; les vidéos qui s'en servent gardent leur copie. */
function retirerMusique({ id, personnel } = {}) {
  if (!NOM.test(id || '') || !fs.existsSync(path.join(racine(personnel), id))) return echec(`Musique « ${id || ''} » introuvable dans votre bibliothèque.`);
  fs.rmSync(path.join(racine(personnel), id), { recursive: true, force: true });
  return { ok: true, id, message: 'Musique retirée de votre bibliothèque ; les vidéos qui s\'en servent gardent leur copie.' };
}

module.exports = {
  ajouterMusique, listerMusiques, utiliserMusique, retirerMusique, mesurerMusique, tempoDuFlux, validerFiche, lireLicence, libelleLicence,
  idsMusiques, FORMATS, LICENCES, PAGE,
};
