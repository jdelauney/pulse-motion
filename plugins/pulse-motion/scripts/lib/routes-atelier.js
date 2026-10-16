'use strict';
/* Pulse Motion – routes de l'atelier des effets de particules (aperçu seulement, jamais dans la page livrée).
 *
 *   GET  /_pm/atelier/contexte              { projet, charte, recettes: { bibliotheque: [noms], projet: [noms] } }
 *   GET  /_pm/atelier/recette?nom=<nom>     { nom, source: 'projet' | 'bibliotheque', recette (résolue) }
 *   GET  /_pm/atelier/scenes                { charte, scenes: [{ id, fichier, empreinte, effets: [effet], shaders: [fond] }] }
 *   GET  /_pm/atelier/texture?chemin=assets/…   { uri } : image du projet en data:
 *   POST /_pm/atelier/reglages              { fichier, empreinte, scene, ordre, reglages, graine } -> { ok, empreinte }
 *   POST /_pm/atelier/recette               { nom, etend, recette, description?, dur?, remplacer?,
 *                                             cible?: { scene, ordre, empreinte, reglages, graine } } -> { ok, fichier, complete, empreinte? }
 *   POST /_pm/atelier/reglages-shader       { fichier, empreinte, scene, ordre, reglages } -> { ok, empreinte }   (fond par shader, P6)
 *   GET  /_pm/atelier/shader?nom=<nom>      { nom, source, fichier, json, code, erreurs } : sources d'un shader (modules de l'atelier)
 *   GET  /_pm/atelier?recette=<nom>         page d'atelier (moteur/atelier/page.html) ; /_pm/atelier/moteur.js, base.css, page.mjs
 *   GET  /_pm/atelier/expression.js, recette.js, editeur.mjs, panneau.mjs   modules de l'atelier
 *   effet : { ordre, nom, calque, ancre, reglages, graine, graineEcrite, dur, recette | null, erreur | null }
 *   fond : { ordre, nom, calque, ancre, reglages, usage, parametres, erreur | null }   (balises data-shader)
 * Écritures : JSON seulement (une autre origine est arrêtée par la requête préalable CORS), copie dans
 * .historique/ avant, fichier temporaire puis renommage ; 409 si la scène a changé sur le disque ({ conflit: true })
 * ou si le nom de la recette est invalide ou pris. Jamais d'écriture dans la bibliothèque du plugin.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { lireDeroule, dureeTemps } = require('./deroule.js');
const { chargeurRecettes, balisesEffets, modifierEffet, graineParDefaut, dureeStructures } = require('./effets.js');
const { cheminDansProjet, versDataURI } = require('./embarquer.js');
const { charteFinale, CHARTE_DEFAUT } = require('./fusion-charte.js');
const { trouverStyle } = require('../styles.js');
const { lireSecondes } = require('../../moteur/minutage.js');
const R = require('../../moteur/particules/recette.js');
const S = require('../../moteur/shaders/code.js');
const { chargeurShaders, balisesShaders, modifierShader, BIBLIOTHEQUE: BIBLIOTHEQUE_SHADERS } = require('./shaders.js');
const historique = require('../historique.js');
const { variablesCSS } = require('../../moteur/courbes.js');
const { lireMoteur } = require('../assembler.js');

const RACINE = path.resolve(__dirname, '..', '..');
const BIBLIOTHEQUE = path.join(RACINE, 'effets');
const NOM = /^[a-z0-9-]+$/;
const REGLAGES_SURS = /^[^"<>&\r\n]*$/;
const MAX_CORPS = 2e6;
// Fichiers servis tels quels : { chemin: { fichier, type } } (modules de l'atelier, plans 3 et 4).
const ATELIER = path.join(RACINE, 'moteur', 'atelier');
const PARTICULES = path.join(RACINE, 'moteur', 'particules');
const JS = 'text/javascript; charset=utf-8';
const STATIQUES = {
  '/_pm/atelier/expression.js': { fichier: path.join(PARTICULES, 'expression.js'), type: JS },
  '/_pm/atelier/recette.js': { fichier: path.join(PARTICULES, 'recette.js'), type: JS },
  '/_pm/atelier/editeur.mjs': { fichier: path.join(ATELIER, 'editeur.mjs'), type: JS },
  '/_pm/atelier/panneau.mjs': { fichier: path.join(ATELIER, 'panneau.mjs'), type: JS },
};
// Contenus fabriqués à la demande : { chemin: () => ({ type, corps }) } (page d'atelier, plan 4).
STATIQUES['/_pm/atelier'] = { fichier: path.join(ATELIER, 'page.html'), type: 'text/html; charset=utf-8' };
STATIQUES['/_pm/atelier/page.mjs'] = { fichier: path.join(ATELIER, 'page.mjs'), type: JS };
const GENERES = {
  // Moteur des vidéos, d'un bloc : mêmes fichiers, dans le même ordre, que dans une page assemblée.
  '/_pm/atelier/moteur.js': () => ({ type: JS, corps: lireMoteur(RACINE) }),
  '/_pm/atelier/base.css': () => ({
    type: 'text/css; charset=utf-8',
    corps: `:root { --pm-ratio-l: 16; --pm-ratio-h: 9; }
${fs.readFileSync(path.join(RACINE, 'moteur', 'base.css'), 'utf8')}
${variablesCSS()}`,
  }),
};

const CONFLIT = 'La scène a été modifiée sur le disque depuis l\'ouverture de la page (par exemple par une retouche) : rechargez la page. Les réglages non enregistrés seront perdus ; le fichier, lui, n\'a pas été touché.';
const SANS_PROJET = 'Aucune vidéo ouverte : lancez l\'atelier depuis le dossier d\'une vidéo (pulse-motion atelier) pour enregistrer vos effets.';

function repondre(res, statut, corps) {
  res.writeHead(statut, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(corps));
}

/** Empreinte d'un fichier : 16 caractères hexadécimaux du SHA-256 de ses octets. */
function empreinte(octets) {
  return crypto.createHash('sha256').update(octets).digest('hex').slice(0, 16);
}

const attendre = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/** Écrit dans un fichier temporaire voisin puis renomme : jamais de fichier à moitié écrit. Sous Windows, le
 *  renommage est réessayé quelques fois si le fichier est un instant verrouillé (antivirus, surveillance). */
function ecrireAtomique(fichier, contenu) {
  const temporaire = `${fichier}.${process.pid}-${Date.now()}.tmp`;
  try {
    fs.writeFileSync(temporaire, contenu);
    for (let essai = 0; ; essai++) {
      try {
        fs.renameSync(temporaire, fichier);
        break;
      } catch (e) {
        if (essai >= 4 || !['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) throw e;
        attendre(40);
      }
    }
  } catch (e) {
    try { fs.rmSync(temporaire, { force: true }); } catch { /* rien à nettoyer */ }
    throw e;
  }
}

function messageDisque(e) {
  return `Écriture impossible (${e && (e.code || e.message)}) : rien n'a été modifié. Vérifiez que le fichier n'est pas ouvert dans un autre programme et que le disque n'est pas plein.`;
}

const estObjet = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const graineValide = (g) => g === null || g === undefined || (Number.isInteger(g) && g >= 0 && g <= 0xffffffff);
const typeEst = (req, type) => String(req.headers['content-type'] || '').toLowerCase().split(';')[0].trim() === type;

function nomsRecettes(dossier) {
  try { return fs.readdirSync(dossier).filter((f) => /^[a-z0-9-]+\.json$/.test(f)).map((f) => f.slice(0, -5)).sort(); } catch { return []; }
}

function lireJSON(req) {
  return new Promise((resolve, reject) => {
    let corps = '';
    req.setEncoding('utf8');
    req.on('data', (m) => { corps += m; if (corps.length > MAX_CORPS) { req.destroy(); reject(new Error('trop gros')); } });
    req.on('end', () => { try { resolve(JSON.parse(corps)); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

/**
 * creerRoutesAtelier(projet, { dossierStyles?, bibliotheque?, bibliothequeShaders?, ecrire? }) -> (req, res, url) => bool (true si traitée)
 * bibliotheque : dossier des recettes livrées (tests : tests/fixtures/effets) ; bibliothequeShaders : dossier des shaders livrés ;
 * ecrire(fichier, contenu) : écriture atomique, remplaçable dans les tests pour simuler un disque plein.
 */
function creerRoutesAtelier(projet, { dossierStyles, bibliotheque = BIBLIOTHEQUE, bibliothequeShaders = BIBLIOTHEQUE_SHADERS, ecrire = ecrireAtomique } = {}) {
  const projetOuvert = () => fs.existsSync(path.join(projet, 'deroule.json'));
  const charger = () => chargeurRecettes(projet, bibliotheque);
  const chargerShaders = () => chargeurShaders(projet, bibliothequeShaders);

  function lireLeDeroule() {
    const { deroule } = lireDeroule(projet);
    return deroule && Array.isArray(deroule.scenes) ? deroule : null;
  }

  /** Couleurs de la charte, comme à l'assemblage ; charte par défaut hors projet ou si le style manque. */
  function charte(deroule = lireLeDeroule()) {
    try {
      const style = deroule && trouverStyle(deroule.style, dossierStyles);
      if (style) return charteFinale(deroule, style.dossier, projet).couleurs;
    } catch { /* déroulé incomplet : charte par défaut */ }
    return { ...CHARTE_DEFAUT.couleurs };
  }

  function contexte(res) {
    repondre(res, 200, { projet: projetOuvert(), charte: charte(), recettes: { bibliotheque: nomsRecettes(bibliotheque), projet: nomsRecettes(path.join(projet, 'effets')) } });
  }

  function recette(res, url) {
    const nom = url.searchParams.get('nom') || '';
    if (!NOM.test(nom)) return repondre(res, 400, { message: `Nom d'effet « ${nom} » invalide (minuscules, chiffres, tirets).` });
    const source = fs.existsSync(path.join(projet, 'effets', `${nom}.json`)) ? 'projet'
      : fs.existsSync(path.join(bibliotheque, `${nom}.json`)) ? 'bibliotheque' : null;
    if (!source) return repondre(res, 404, { message: `Effet « ${nom} » introuvable (ni dans effets/ du projet, ni dans la bibliothèque).` });
    try { return repondre(res, 200, { nom, source, recette: R.resoudre(nom, charger()) }); } catch (e) {
      if (!e.regle) throw e;
      return repondre(res, 422, { message: e.message });
    }
  }

  /** Durée écrite d'une scène du déroulé (s de τ), ou null. */
  function dureeSceneDe(deroule) {
    return (id) => { const s = deroule && deroule.scenes.find((x) => x.id === id); return s && s.duree > 0 ? s.duree : null; };
  }

  function decrireEffet(scene, b, ctx) {
    const a = b.attributs;
    const nom = a['data-effet'].trim();
    const lu = lireSecondes(String(a['data-dur'] || ''), ctx.temps);
    let dur = lu.erreur ? 1 : lu.valeur;
    let durScene = false;
    const graineEcrite = a['data-graine'] !== undefined && /^\d+$/.test(a['data-graine'].trim());
    const graine = graineEcrite ? Number(a['data-graine'].trim()) >>> 0 : graineParDefaut(scene, b.ordre, nom);
    const reglages = a['data-reglages'] || '';
    let resolue = null;
    let erreur = null;
    try { resolue = R.resoudre(nom, ctx.charger); } catch (e) {
      if (!e.regle) throw e;
      erreur = e.message;
    }
    if (resolue) {
      let c = R.compiler(resolue, { reglages, charte: ctx.charte, dur, graine });
      // Effet fait uniquement de structures sans data-dur : de son début à la fin de la scène (durée écrite dans le déroulé ;
      // data-start relatif : toute la scène). La page refait le calcul avec son minutage (début relatif résolu, allongement
      // par la voix compris : durScene, moteur/atelier/panneau.mjs).
      const d = c.ok ? dureeStructures(a, c.effet, ctx.dureeScene ? ctx.dureeScene(scene) : null, ctx.temps) : null;
      if (d) { dur = d; durScene = true; c = R.compiler(resolue, { reglages, charte: ctx.charte, dur, graine }); }
      if (!c.ok) erreur = c.erreurs.map((x) => x.message).join(' ');
    }
    return {
      ordre: b.ordre, nom, calque: (a['data-calque'] || 'avant').trim(),
      ancre: a['data-ancre'] ? a['data-ancre'].trim().replace(/^#/, '') : null,
      reglages, graine, graineEcrite, dur, ...(durScene ? { durScene } : {}), recette: resolue, erreur,
    };
  }

  /** Balise data-shader -> { ordre, nom, calque, ancre, reglages, usage, parametres, erreur } ; erreur : message, ou null. */
  function decrireShader(b, ctx) {
    const a = b.attributs;
    const nom = String(a['data-shader'] || '').trim();
    const reglages = a['data-reglages'] || '';
    let src = null;
    let erreur = null;
    try { src = ctx.shaders(nom); } catch (e) { erreur = e.message; }
    if (!src && !erreur) erreur = `Shader « ${nom} » introuvable (ni dans shaders/ du projet, ni dans la bibliothèque).`;
    else if (src && src.erreurs.length) erreur = src.erreurs.map((e) => e.message).join(' ');
    else if (src && src.json.usage !== 'fond') erreur = `Shader « ${nom} » : c'est une « ${src.json.usage} », « fond » attendu.`;
    if (src && !erreur) {
      const v = S.valeursShader(src.json, reglages, ctx.charte);
      if (v.erreurs.length) erreur = v.erreurs.map((e) => e.message).join(' ');
    }
    return {
      ordre: b.ordre, nom, calque: (a['data-calque'] || 'arriere').trim(),
      ancre: a['data-ancre'] ? a['data-ancre'].trim().replace(/^#/, '') : null,
      reglages, usage: src && src.json ? src.json.usage : null, parametres: src && src.json ? src.json.parametres || {} : {}, erreur,
    };
  }

  function scenes(res) {
    const deroule = lireLeDeroule();
    if (!deroule) return repondre(res, 200, { charte: charte(null), scenes: [] });
    const ctx = { charte: charte(deroule), temps: dureeTemps(deroule), charger: charger(), shaders: chargerShaders(), dureeScene: dureeSceneDe(deroule) };
    const liste = deroule.scenes.map((s) => {
      const absolu = cheminDansProjet(projet, String(s.fichier || ''));
      let brut = null;
      try { brut = absolu ? fs.readFileSync(absolu) : null; } catch { brut = null; }
      if (!brut) return { id: s.id, fichier: s.fichier, empreinte: null, effets: [], shaders: [] };
      const texte = brut.toString('utf8');
      return { id: s.id, fichier: s.fichier, empreinte: empreinte(brut), effets: balisesEffets(texte).map((b) => decrireEffet(s.id, b, ctx)),
        shaders: balisesShaders(texte).map((b) => decrireShader(b, ctx)) };
    });
    return repondre(res, 200, { charte: ctx.charte, scenes: liste });
  }

  function texture(res, url) {
    const chemin = url.searchParams.get('chemin') || '';
    const absolu = /^assets\//.test(chemin) ? cheminDansProjet(path.join(projet, 'assets'), chemin.slice('assets/'.length)) : null;
    if (!absolu || !fs.existsSync(absolu)) return repondre(res, 404, { message: `Image « ${chemin} » introuvable dans assets/ du projet.` });
    try { return repondre(res, 200, { uri: versDataURI(absolu) }); } catch (e) { return repondre(res, 415, { message: e.message }); }
  }

  /** Corps JSON d'une écriture, ou null (réponse 415 ou 400 déjà envoyée). */
  function lireDemande(req, res) {
    if (!typeEst(req, 'application/json')) {
      req.resume();
      repondre(res, 415, { message: 'JSON attendu.' });
      return Promise.resolve(null);
    }
    return lireJSON(req).then((c) => {
      if (!estObjet(c)) throw new Error('objet attendu');
      return c;
    }).catch(() => {
      if (!res.headersSent) repondre(res, 400, { message: 'Demande illisible.' });
      return null;
    });
  }

  const refuser = (res, r) => repondre(res, r.statut, { message: r.message, ...(r.conflit ? { conflit: true } : {}) });

  /** Scène visée par une écriture : -> { absolu, html } ou { statut, message, conflit? } (rien n'est écrit). */
  function sceneVisee(c, balises = balisesEffets) {
    const deroule = lireLeDeroule();
    const s = deroule && deroule.scenes.find((x) => x.id === c.scene);
    if (!s) return { statut: 404, message: `Scène « ${c.scene} » introuvable dans le déroulé.` };
    if (c.fichier !== undefined && c.fichier !== s.fichier) return { statut: 409, conflit: true, message: CONFLIT };
    const absolu = cheminDansProjet(projet, String(s.fichier || ''));
    let brut;
    try { brut = fs.readFileSync(absolu); } catch { return { statut: 404, message: `Fichier « ${s.fichier} » de la scène « ${s.id} » introuvable.` }; }
    if (empreinte(brut) !== c.empreinte) return { statut: 409, conflit: true, message: CONFLIT };
    const html = brut.toString('utf8');
    if (!Number.isInteger(c.ordre) || !balises(html)[c.ordre]) return { statut: 409, conflit: true, message: CONFLIT };
    return { absolu, html };
  }

  /** Texte de réglages sûr (pas de guillemet qui fermerait l'attribut), ou null. */
  function reglagesSurs(v) {
    const t = v === undefined || v === null ? '' : String(v).trim();
    return REGLAGES_SURS.test(t) ? t : null;
  }

  function ecrireReglages(c, res) {
    const reglages = reglagesSurs(c.reglages);
    if (reglages === null) return repondre(res, 400, { message: 'Réglages illisibles : guillemets, chevrons, « & » et retours à la ligne ne sont pas permis.' });
    if (!graineValide(c.graine)) return repondre(res, 400, { message: 'Graine : nombre entier positif attendu.' });
    const v = sceneVisee(c);
    if (v.statut) return refuser(res, v);
    // Compilés avant d'être écrits, comme à l'assemblage : un réglage refusé n'entre pas dans la scène.
    const deroule = lireLeDeroule();
    const d = decrireEffet(c.scene, balisesEffets(v.html)[c.ordre], { charte: charte(deroule), temps: dureeTemps(deroule), charger: charger(), dureeScene: dureeSceneDe(deroule) });
    if (!d.recette) return repondre(res, 422, { message: d.erreur, erreurs: [{ chemin: 'effet', message: d.erreur }] });
    const graine = c.graine === null || c.graine === undefined ? graineParDefaut(c.scene, c.ordre, d.nom) : c.graine;
    const compile = R.compiler(d.recette, { reglages, charte: charte(deroule), dur: d.dur, graine });
    if (!compile.ok) {
      const { erreurs } = compile;
      return repondre(res, 422, { message: `Réglages refusés : ${erreurs.map((x) => x.message).join(' ')}`, erreurs });
    }
    const nouveau = modifierEffet(v.html, c.ordre, {
      'data-reglages': reglages || null,
      'data-graine': c.graine === null || c.graine === undefined ? null : String(c.graine),
    });
    try {
      historique.sauvegarder(projet);
      ecrire(v.absolu, nouveau);
    } catch (e) { return repondre(res, 500, { message: messageDisque(e) }); }
    return repondre(res, 200, { ok: true, empreinte: empreinte(Buffer.from(nouveau, 'utf8')) });
  }

  /** Description écrite : celle envoyée, sinon celle de la recette si elle diffère de la base, sinon une mention. */
  function descriptionDe(c, base, etend) {
    if (typeof c.description === 'string' && c.description.trim()) return c.description.trim();
    const decrite = typeof c.recette.description === 'string' ? c.recette.description.trim() : '';
    if (decrite && (!base || decrite !== base.description)) return decrite;
    return etend ? `Dérivé de « ${etend} » dans l'atelier` : 'Créé dans l\'atelier';
  }

  function ecrireRecette(c, res) {
    if (!projetOuvert()) return repondre(res, 409, { message: SANS_PROJET });
    const nom = String(c.nom || '');
    if (!NOM.test(nom)) return repondre(res, 409, { message: `Nom « ${nom} » refusé : minuscules, chiffres et tirets seulement (exemple : etincelles-bleues).` });
    if (fs.existsSync(path.join(bibliotheque, `${nom}.json`))) {
      return repondre(res, 409, { message: `« ${nom} » est déjà le nom d'un effet de la bibliothèque : choisissez-en un autre (exemple : ${nom}-2).` });
    }
    const fichier = path.join(projet, 'effets', `${nom}.json`);
    const existant = fs.existsSync(fichier);
    if (existant && c.remplacer !== true) {
      return repondre(res, 409, { message: `Le projet a déjà un effet « ${nom} » : choisissez un autre nom, ou confirmez son remplacement.` });
    }
    if (!estObjet(c.recette)) return repondre(res, 400, { message: 'Recette absente ou illisible.' });
    let etend = c.etend === null || c.etend === undefined || c.etend === '' ? null : String(c.etend);
    if (etend === nom) {
      // Recette du projet réenregistrée sous son nom : elle garde son héritage.
      if (!existant) return repondre(res, 409, { message: `« ${nom} » ne peut pas hériter de lui-même : choisissez un autre nom.` });
      try { etend = JSON.parse(fs.readFileSync(fichier, 'utf8')).etend || null; } catch { etend = null; }
      if (etend === nom) etend = null;
    }
    if (etend !== null && !NOM.test(etend)) return repondre(res, 400, { message: `« etend » : nom d'effet « ${etend} » invalide.` });
    const cible = c.cible === undefined || c.cible === null ? null : c.cible;
    if (cible !== null) {
      if (!estObjet(cible)) return repondre(res, 400, { message: 'Cible illisible.' });
      if (reglagesSurs(cible.reglages) === null) return repondre(res, 400, { message: 'Réglages illisibles : guillemets, chevrons, « & » et retours à la ligne ne sont pas permis.' });
      if (!Number.isInteger(cible.graine) || !graineValide(cible.graine)) return repondre(res, 400, { message: 'Graine : nombre entier positif attendu.' });
    }

    const recettes = charger();
    let base = null;
    if (etend) {
      try { base = R.resoudre(etend, recettes); } catch (e) {
        if (!e.regle) throw e;
        return repondre(res, 422, { message: e.message });
      }
    }
    const description = descriptionDe(c, base, etend);
    const { version: _v, nom: _n, etend: _e, description: _d, ...corps } = c.recette;
    let contenu = null;
    let complete = false;
    if (base) {
      const { version: _bv, nom: _bn, etend: _be, description: _bd, ...corpsBase } = base;
      try { contenu = { version: 1, nom, etend, description, ...R.differences(corpsBase, corps) }; } catch (e) {
        if (!e.regle) throw e;
        complete = true; // un champ ou un émetteur retiré : « etend » ne sait pas l'écrire, la recette est écrite entière
      }
    }
    if (!contenu) contenu = { version: 1, nom, etend: null, description, ...corps };

    // Compilée avant d'être écrite : charte du projet, durée, réglages et graine de la balise visée.
    const reglagesCible = cible ? reglagesSurs(cible.reglages) : '';
    let compile;
    try {
      compile = R.compiler(R.resoudre(nom, (n) => (n === nom ? contenu : recettes(n))), {
        charte: charte(), dur: Number(c.dur) > 0 ? Number(c.dur) : 1, graine: cible ? cible.graine : 1, reglages: reglagesCible,
      });
    } catch (e) {
      if (!e.regle) throw e;
      compile = { ok: false, erreurs: [{ regle: e.regle, message: e.message, chemin: e.chemin || '' }] };
    }
    if (!compile.ok) return repondre(res, 422, { message: `Recette refusée : ${compile.erreurs.map((x) => x.message).join(' ')}`, erreurs: compile.erreurs });

    const v = cible ? sceneVisee(cible) : null;
    if (v && v.statut) return refuser(res, v);
    const avant = existant ? fs.readFileSync(fichier) : null;
    let nouvelleScene = null;
    try {
      historique.sauvegarder(projet);
      fs.mkdirSync(path.dirname(fichier), { recursive: true });
      ecrire(fichier, `${JSON.stringify(contenu, null, 2)}\n`);
      if (v) {
        nouvelleScene = modifierEffet(v.html, cible.ordre, { 'data-effet': nom, 'data-reglages': reglagesCible || null, 'data-graine': String(cible.graine) });
        try { ecrire(v.absolu, nouvelleScene); } catch (e) {
          // La recette ne reste pas seule : rien n'est modifié à moitié.
          try {
            if (avant) ecrire(fichier, avant);
            else fs.rmSync(fichier, { force: true });
          } catch { /* l'erreur d'origine est signalée */ }
          throw e;
        }
      }
    } catch (e) { return repondre(res, 500, { message: messageDisque(e) }); }
    return repondre(res, 200, { ok: true, fichier: `effets/${nom}.json`, complete, ...(nouvelleScene ? { empreinte: empreinte(Buffer.from(nouvelleScene, 'utf8')) } : {}) });
  }

  function ecrireReglagesShader(c, res) {
    const reglages = reglagesSurs(c.reglages);
    if (reglages === null) return repondre(res, 400, { message: 'Réglages illisibles : guillemets, chevrons, « & » et retours à la ligne ne sont pas permis.' });
    const v = sceneVisee(c, balisesShaders);
    if (v.statut) return refuser(res, v);
    const deroule = lireLeDeroule();
    const d = decrireShader(balisesShaders(v.html)[c.ordre], { charte: charte(deroule), shaders: chargerShaders() });
    if (d.usage !== 'fond') return repondre(res, 422, { message: d.erreur, erreurs: [{ chemin: 'shader', message: d.erreur }] });
    // Contrôlés avant d'être écrits, comme à l'assemblage.
    const val = S.valeursShader({ nom: d.nom, parametres: d.parametres }, reglages, charte(deroule));
    if (val.erreurs.length) return repondre(res, 422, { message: `Réglages refusés : ${val.erreurs.map((x) => x.message).join(' ')}`, erreurs: val.erreurs });
    const nouveau = modifierShader(v.html, c.ordre, { 'data-reglages': reglages || null });
    try {
      historique.sauvegarder(projet);
      ecrire(v.absolu, nouveau);
    } catch (e) { return repondre(res, 500, { message: messageDisque(e) }); }
    return repondre(res, 200, { ok: true, empreinte: empreinte(Buffer.from(nouveau, 'utf8')) });
  }

  function shader(res, url) {
    const nom = url.searchParams.get('nom') || '';
    let src = null;
    try { src = chargerShaders()(nom); } catch (e) { return repondre(res, 400, { message: e.message }); }
    if (!src) return repondre(res, 404, { message: `Shader « ${nom} » introuvable (ni dans shaders/ du projet, ni dans la bibliothèque).` });
    return repondre(res, 200, { nom, source: src.source, fichier: src.fichier, json: src.json, code: src.code, erreurs: src.erreurs });
  }

  const ecritures = { '/_pm/atelier/reglages': ecrireReglages, '/_pm/atelier/recette': ecrireRecette, '/_pm/atelier/reglages-shader': ecrireReglagesShader };

  return function routes(req, res, url) {
    const p = url.pathname;
    if (p !== '/_pm/atelier' && !p.startsWith('/_pm/atelier/')) return false;
    if (req.method === 'GET') {
      if (STATIQUES[p]) {
        res.writeHead(200, { 'Content-Type': STATIQUES[p].type, 'Cache-Control': 'no-store' });
        res.end(fs.readFileSync(STATIQUES[p].fichier));
        return true;
      }
      if (GENERES[p]) {
        const { type, corps } = GENERES[p]();
        res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
        res.end(corps);
        return true;
      }
      if (p === '/_pm/atelier/contexte') { contexte(res); return true; }
      if (p === '/_pm/atelier/recette') { recette(res, url); return true; }
      if (p === '/_pm/atelier/scenes') { scenes(res); return true; }
      if (p === '/_pm/atelier/texture') { texture(res, url); return true; }
      if (p === '/_pm/atelier/shader') { shader(res, url); return true; }
      return false;
    }
    if (req.method === 'POST' && ecritures[p]) {
      lireDemande(req, res).then((c) => {
        if (!c) return;
        try { ecritures[p](c, res); } catch (e) {
          if (!res.headersSent) repondre(res, 500, { message: messageDisque(e) });
        }
      });
      return true;
    }
    return false;
  };
}

module.exports = { creerRoutesAtelier, ecrireAtomique, empreinte, STATIQUES, GENERES, CONFLIT, SANS_PROJET };
