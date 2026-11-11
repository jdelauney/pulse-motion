'use strict';
/* Pulse Motion – règles de réalisation et de vérité sans navigateur (spec S2, 5.7), appelées par controlesRapides :
 * rien-de-nouveau, comparaison-courte, camera-repetee (réalisation) ; terme-cle, chiffre-invente, chiffre-sans-source,
 * exemple-non-signale, cause-affirmee (vérité) ; glyphe-absent, emoji, image-repetee (textes et images) ; script-interdit
 * (contrat du code des scènes). Chaque problème porte sa scène (contrôle par scène), sauf un terme absent de toute la vidéo.
 * Idées : LONG, PINNED, glyphes absents de take-one (text-audit.mjs, MIT, © 2026 Tal Siach), contrat statique de take-one
 * (principe seulement), term_in() et vérité des chiffres de video-director (MIT, © 2026 win4r) ; code écrit à neuf.
 * Module pur (lit seulement les polices, mises en cache).
 */
// Forme affichée du texte dit (spec S7, 5.11) : sans [#repère], {affiché|dit} ni [pause].
const affiche = (texte) => require('../../moteur/aligner.js').lireTexteDit(texte).affiche;
const fs = require('node:fs');
const { analyserCamera } = require('../../moteur/camera.js');
const { analyserTween } = require('../../moteur/tween.js');
const { textesEnDur, imagesScene, scriptsScene } = require('./extraire.js');
const { nombresDuTexte, nombresEnChiffres, memeNombre } = require('./nombres.js');
const { lireTables, lecteurCmap } = require('./police.js');

const EPS = 1e-6;
const virgule = (x) => String(Math.round(x * 10) / 10).replace('.', ',');
const ecrireNombre = (n) => String(n).replace('.', ',');
const auPasSuperieur = (x, pas) => Math.round(Math.ceil(x / pas - EPS) * pas * 1000) / 1000;
const echapper = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* ---------- Réalisation ---------- */

/** Intervalle [a, b] couvert à au moins la moitié par les intervalles donnés (la voix y parle) ? */
function couvertMoitie(a, b, intervalles) {
  let couvert = 0;
  for (const [x, y] of intervalles) couvert += Math.max(0, Math.min(b, y) - Math.max(a, x));
  return couvert >= (b - a) / 2 - EPS;
}

/** Plages où la voix de la scène parle (mots calés, sinon la prise entière), en secondes de la vidéo. Voix prévue mais pas
 *  encore enregistrée (texte dit seulement) : estimée à 3,5 mots par seconde (débit de creer), dès 0,3 s. */
function plagesVoix(minutee, sceneMinutee, texteDit) {
  const v = sceneMinutee && sceneMinutee.voix;
  if (!v && texteDit) {
    const mots = (String(texteDit).match(/[\p{L}\p{N}]+/gu) || []).length;
    return mots ? [[minutee.debut + 0.3, minutee.debut + 0.3 + mots / 3.5]] : [];
  }
  if (!v) return [];
  const d = minutee.debut + (v.debut || 0);
  if (Array.isArray(v.mots) && v.mots.length) return v.mots.map((m) => [d + m.t0, d + m.t1]);
  return v.duree > 0 ? [[d, d + v.duree]] : [];
}

function rienDeNouveau({ deroule, min, elements, scenesMinutees, besoinLecture, social, S }) {
  const r = [];
  min.scenes.forEach((s, i) => {
    const contenu = (elements[s.id] || []).filter((e) => !e.decor && min.elements[s.id][e.cle]);
    const suivante = min.scenes[i + 1];
    const fin = suivante ? Math.min(s.fin, suivante.debut) : s.fin;
    const entrees = contenu.map((e) => min.elements[s.id][e.cle].debut).filter((t) => t > s.debut + EPS && t < fin - EPS).sort((a, b) => a - b);
    const points = [s.debut, ...entrees];
    // Pause finale de la dernière scène exclue : rien de nouveau n'y entre, c'est voulu.
    if (suivante) points.push(fin);
    const prevue = (deroule.scenes.find((x) => x.id === s.id) || {}).voix;
    const voix = plagesVoix(s, scenesMinutees.find((x) => x.id === s.id), prevue && prevue.texte && affiche(prevue.texte));
    const lecture = (besoinLecture[s.id] && besoinLecture[s.id].besoin) || 0;
    let pire = null;
    for (let k = 1; k < points.length; k++) {
      const [a, b] = [points[k - 1], points[k]];
      const base = social ? S.nouveauteMaxSocial : couvertMoitie(a, b, voix) ? S.nouveauteMaxVoix : S.nouveauteMax;
      const max = Math.max(base, lecture);
      if (b - a > max + EPS && (!pire || b - a > pire.b - pire.a)) pire = { a, b, max };
    }
    if (pire) {
      r.push({ regle: 'rien-de-nouveau', gravite: 'alerte', scene: s.id,
        message: `Scène « ${s.id} » : rien de nouveau n'apparaît pendant ${virgule(pire.b - pire.a)} s (de ${virgule(pire.a)} s à ${virgule(pire.b)} s) ; au-delà de ${virgule(pire.max)} s, la scène ressemble à une diapositive.` });
    }
  });
  return r;
}

function comparaisonCourte({ deroule, min, elements, avecVoix, corrigeable, S }) {
  const r = [];
  deroule.scenes.forEach((sc, i) => {
    if (sc.type !== 'comparaison') return;
    const s = min.scenes[i];
    if (!s) return;
    const contenu = (elements[s.id] || []).filter((e) => !e.decor && min.elements[s.id][e.cle]);
    if (!contenu.length) return;
    // Visibles ensemble : quand le dernier élément de contenu a fini d'entrer (une animation longue compte dès son début).
    const ensemble = Math.max(...contenu.map((e) => {
      const m = min.elements[s.id][e.cle];
      return m.fin - m.debut < S.animationLongue ? m.fin : m.debut;
    }));
    const suivante = min.scenes[i + 1];
    const fin = suivante ? Math.min(s.fin, suivante.debut) : s.fin;
    const tenue = fin - ensemble;
    if (tenue >= S.comparaisonTenue - EPS) return;
    const p = { regle: 'comparaison-courte', gravite: 'alerte', scene: s.id,
      message: `Scène « ${s.id} » : les deux colonnes ne restent visibles ensemble que ${virgule(Math.max(0, tenue))} s ; il faut au moins ${virgule(S.comparaisonTenue)} s pour les comparer.` };
    const nouvelle = auPasSuperieur(sc.duree + (S.comparaisonTenue - tenue) * s.rythme, 0.5);
    if (corrigeable && !avecVoix.has(s.id) && nouvelle <= sc.duree * S.lectureMaxAllonge + EPS) p.correction = { scene: s.id, duree: nouvelle };
    r.push(p);
  });
  return r;
}

const SENS = {
  zoom: (de, a) => (a > de ? 'zoom avant' : 'zoom arrière'),
  x: (de, a) => (a < de ? 'travelling vers la gauche' : 'travelling vers la droite'),
  y: (de, a) => (a < de ? 'travelling vers le haut' : 'travelling vers le bas'),
};
const AMPLEUR = { zoom: (de, a) => Math.abs(a - de) / de, x: (de, a) => Math.abs(a - de) / 100, y: (de, a) => Math.abs(a - de) / 100 };

/** Mouvements de caméra d'une scène assez amples pour se voir : [« zoom avant », …]. */
function mouvementsCamera(miseEnScene, temps, S) {
  const r = new Set();
  for (const m of miseEnScene) {
    if (m.camera === undefined || m.balise === 'section') continue;
    let clauses;
    try { clauses = analyserCamera(m.camera, temps); } catch { continue; }
    for (const c of clauses) if (SENS[c.prop] && AMPLEUR[c.prop](c.de, c.a) >= S.cameraAmpleurMin - EPS) r.add(SENS[c.prop](c.de, c.a));
  }
  return r;
}

function cameraRepetee({ deroule, scenesLues, temps, S }) {
  const r = [];
  const mouvements = deroule.scenes.map((s) => mouvementsCamera((scenesLues[s.id] || { miseEnScene: [] }).miseEnScene, temps, S));
  for (let i = 1; i < deroule.scenes.length; i++) {
    const commun = [...mouvements[i]].find((x) => mouvements[i - 1].has(x));
    if (!commun) continue;
    const [a, b] = [deroule.scenes[i - 1].id, deroule.scenes[i].id];
    r.push({ regle: 'camera-repetee', gravite: 'alerte', scene: b,
      message: `Scènes « ${a} » et « ${b} » : le même mouvement de caméra (${commun}) deux fois de suite ; en changer un ou le retirer.` });
  }
  return r;
}

/* ---------- Vérité des chiffres et des termes ---------- */

const estSigle = (t) => /\p{Lu}.*\p{Lu}/u.test(t) && t === t.toUpperCase();
/** Le terme est-il dans le texte : mot entier, sans casse (sauf un sigle), pluriel en -s ou -x, trait d'union facultatif. */
function contientTerme(texte, terme) {
  const corps = echapper(String(terme).trim()).replace(/\\-|-/g, '-?').replace(/['’]/g, "['’]").replace(/\s+/g, '\\s+');
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${corps}${estSigle(terme) ? '' : '(?:s|x)?'}(?![\\p{L}\\p{N}])`, estSigle(terme) ? 'u' : 'iu');
  return re.test(String(texte));
}

/** Textes affichés d'une scène : ceux du déroulé et ceux écrits dans le fichier. */
const textesAffiches = (scene, html) => [...Object.values(scene.textes || {}).filter((t) => typeof t === 'string'), ...textesEnDur(html)];

function termeCle({ deroule, scenesHtml, termes }) {
  const r = [];
  const avecVoix = deroule.scenes.some((s) => s.voix && s.voix.texte);
  for (const t of termes.filter((x) => x.cle)) {
    const dits = deroule.scenes.filter((s) => s.voix && s.voix.texte && contientTerme(affiche(s.voix.texte), t.terme)).map((s) => s.id);
    const montres = deroule.scenes.filter((s) => textesAffiches(s, scenesHtml[s.id] || '').some((x) => contientTerme(x, t.terme))).map((s) => s.id);
    if (dits.length && !dits.some((id) => montres.includes(id))) {
      r.push({ regle: 'terme-cle', gravite: 'alerte', scene: dits[0], element: t.terme,
        message: `Le terme « ${t.terme} » est dit dans la scène « ${dits[0]} » mais n'y est pas écrit : l'afficher quand il est dit.` });
    } else if (avecVoix && montres.length && !dits.length) {
      r.push({ regle: 'terme-cle', gravite: 'alerte', scene: montres[0], element: t.terme,
        message: `Le terme « ${t.terme} » est écrit dans la scène « ${montres[0]} » mais n'est jamais dit : le dire dans le texte de la voix de cette scène.` });
    } else if (!dits.length && !montres.length) {
      r.push({ regle: 'terme-cle', gravite: 'alerte', element: t.terme, message: `Le terme « ${t.terme} » n'apparaît nulle part dans la vidéo.` });
    }
  }
  return r;
}

/** Valeurs finales des compteurs (data-tween « nombre a→b ») d'une scène. */
function compteurs(elements) {
  const r = [];
  for (const e of elements) {
    if (!e.tween || !/(^|;)\s*nombre\s/.test(e.tween)) continue;
    try { for (const c of analyserTween(e.tween)) if (c.prop === 'nombre') r.push(c.a); } catch { /* tween-invalide le dit */ }
  }
  return r;
}

/** Nombres affichés d'une scène : compteurs, nombres des textes écrits dans le fichier, et (avec textes) ceux du déroulé
 *  hors numéro d'étape. -> [valeur] */
function nombresAffiches(scene, html, elements, { avecTextes }) {
  const r = [...compteurs(elements), ...textesEnDur(html).flatMap(nombresEnChiffres)];
  if (avecTextes) for (const [cle, t] of Object.entries(scene.textes || {})) if (cle !== 'numero' && typeof t === 'string') r.push(...nombresEnChiffres(t));
  // Valeurs d'un graphique sans source (spec S7, 5.6 : vérité des chiffres de S2) : comme les textes de la scène.
  if (avecTextes && scene.graphiques && typeof scene.graphiques === 'object') {
    for (const g of Object.values(scene.graphiques)) {
      if (g && !g.source && Array.isArray(g.valeurs)) for (const v of g.valeurs) if (v && typeof v.valeur === 'number') r.push(v.valeur);
    }
  }
  return r.filter((v, i, t) => t.findIndex((x) => memeNombre(x, v)) === i);
}

function chiffres({ deroule, scenesHtml, elements }) {
  const r = [];
  const faits = Array.isArray(deroule.faits) ? deroule.faits : [];
  for (const s of deroule.scenes) {
    const html = scenesHtml[s.id] || '';
    const sesFaits = faits.filter((f) => f.scene === s.id);
    const connus = [
      ...Object.values(s.textes || {}).filter((t) => typeof t === 'string'), s.intention || '', (s.voix && s.voix.texte) || '',
      ...sesFaits.map((f) => String(f.chiffre || '')),
    ].flatMap(nombresDuTexte);
    for (const n of nombresAffiches(s, html, elements[s.id] || [], { avecTextes: false })) {
      if (connus.some((x) => memeNombre(x, n))) continue;
      r.push({ regle: 'chiffre-invente', gravite: 'alerte', scene: s.id, element: ecrireNombre(n),
        message: `Scène « ${s.id} » : le nombre ${ecrireNombre(n)} s'affiche, mais il n'est ni dans les textes ni dans ce qui est dit ; vérifier qu'il est juste.` });
    }
    if (faits.length) {
      const sources = sesFaits.flatMap((f) => nombresEnChiffres(String(f.chiffre || '')));
      for (const n of nombresAffiches(s, html, elements[s.id] || [], { avecTextes: true })) {
        if (sources.some((x) => memeNombre(x, n))) continue;
        r.push({ regle: 'chiffre-sans-source', gravite: 'alerte', scene: s.id, element: ecrireNombre(n),
          message: `Scène « ${s.id} » : le chiffre « ${ecrireNombre(n)} » n'a pas de source ; demander sa source, ou le présenter comme un exemple.` });
      }
      for (const f of sesFaits.filter((x) => x.exemple === true)) {
        if (textesAffiches(s, html).some((t) => /exemple|fictif|illustratif/i.test(t))) continue;
        r.push({ regle: 'exemple-non-signale', gravite: 'alerte', scene: s.id, element: String(f.chiffre),
          message: `Scène « ${s.id} » : le chiffre « ${f.chiffre} » est un exemple, mais la scène ne le dit pas ; ajouter la mention « Exemple » près du chiffre.` });
      }
    }
    for (const [cle, t] of Object.entries(s.textes || {})) {
      if (typeof t !== 'string' || !/\d/.test(t) || !/(?<![\p{L}])grâce\s+(?:à|au|aux)(?![\p{L}])/iu.test(t)) continue;
      r.push({ regle: 'cause-affirmee', gravite: 'info', scene: s.id, element: cle,
        message: `Scène « ${s.id} », texte « ${cle} » : « grâce à » présente le chiffre comme un effet ; si l'on sait seulement que c'est arrivé après, écrire « après ».` });
    }
  }
  return r;
}

/* ---------- Textes et images ---------- */

const EMOJI = /\p{Emoji_Presentation}|\p{Extended_Pictographic}️/u;
const EMOJI_TOUS = /\p{Emoji_Presentation}|\p{Extended_Pictographic}️/gu;
// Ni espace, ni emoji, ni sélecteur de variante, ni liant (zwj) : un caractère à dessiner par la police.
const HORS_POLICE = /[\s︎️‍​⁠]|\p{Extended_Pictographic}|\p{Emoji_Modifier}/u;

const polices = new Map();
/** Fichier de police -> fonction code => glyphe présent (null : illisible). Mise en cache par chemin et date. */
function lecteurPolice(fichier) {
  let cle;
  try { cle = `${fichier}|${fs.statSync(fichier).mtimeMs}`; } catch { return null; }
  if (!polices.has(cle)) {
    let lecteur = null;
    try {
      const cmap = lireTables(fs.readFileSync(fichier)).get('cmap');
      if (cmap) lecteur = lecteurCmap(cmap);
    } catch { /* police illisible : ignorée */ }
    polices.set(cle, lecteur);
  }
  return polices.get(cle);
}

/** Textes d'une scène : [{ cle, texte }] (cle « » : écrit dans le fichier). */
const textesScene = (s, html) => [...Object.entries(s.textes || {}).filter(([, t]) => typeof t === 'string').map(([cle, texte]) => ({ cle, texte })),
  ...textesEnDur(html).map((texte) => ({ cle: '', texte }))];
const nomTexte = (s, cle) => (cle ? `Scène « ${s.id} », texte « ${cle} »` : `Scène « ${s.id} », texte écrit dans la scène`);

function glyphesEtEmoji({ deroule, scenesHtml, fichiersPolices }) {
  const r = [];
  const lecteurs = (fichiersPolices || []).map(lecteurPolice).filter(Boolean);
  for (const s of deroule.scenes) {
    const vus = new Set();
    for (const { cle, texte } of textesScene(s, scenesHtml[s.id] || '')) {
      for (const e of new Set(texte.match(EMOJI_TOUS) || [])) {
        r.push({ regle: 'emoji', gravite: 'alerte', scene: s.id, element: cle || undefined,
          message: `${nomTexte(s, cle)} : l'emoji « ${e} » change d'allure selon l'ordinateur et donne un air « fait par une IA » ; le retirer ou le remplacer par une icône dessinée.` });
      }
      if (!lecteurs.length) continue;
      for (const c of new Set([...texte])) {
        if (HORS_POLICE.test(c) || vus.has(c)) continue;
        if (lecteurs.some((l) => l(c.codePointAt(0)))) continue;
        vus.add(c);
        r.push({ regle: 'glyphe-absent', gravite: 'alerte', scene: s.id, element: cle || undefined,
          message: `${nomTexte(s, cle)} : le caractère « ${c} » n'existe pas dans les polices de la vidéo ; il s'affichera dans une autre police ou comme un carré.` });
      }
    }
  }
  return r;
}

function imageRepetee({ deroule, scenesHtml, S }) {
  const parFichier = new Map();
  for (const s of deroule.scenes) {
    for (const img of imagesScene(scenesHtml[s.id] || '')) {
      if (img.logo || img.decor || img.alt === '' || !img.src || /^data:/i.test(img.src)) continue;
      const fichier = img.src.replace(/^\.\//, '').replace(/\\/g, '/');
      if (!parFichier.has(fichier)) parFichier.set(fichier, []);
      if (!parFichier.get(fichier).includes(s.id)) parFichier.get(fichier).push(s.id);
    }
  }
  const r = [];
  for (const [fichier, scenes] of parFichier) {
    if (scenes.length < S.imageRepeteeScenes) continue;
    r.push({ regle: 'image-repetee', gravite: 'alerte', scene: scenes[0], element: fichier,
      message: `La même image « ${fichier} » revient dans ${scenes.length} scènes (${scenes.map((x) => `« ${x} »`).join(', ')}) ; en varier, ou n'en garder qu'une.` });
  }
  return r;
}

/* ---------- Contrat du code des scènes ---------- */

/** Code sans commentaires ni contenu des chaînes (les guillemets restent). */
function sansChaines(code) {
  let r = '';
  for (let i = 0; i < code.length; i++) {
    const c = code[i];
    if (c === '/' && code[i + 1] === '*') { const j = code.indexOf('*/', i + 2); i = j < 0 ? code.length : j + 1; r += ' '; continue; }
    if (c === '/' && code[i + 1] === '/') { const j = code.indexOf('\n', i); i = j < 0 ? code.length : j - 1; continue; }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < code.length && code[j] !== c) j += code[j] === '\\' ? 2 : 1;
      r += c + c;
      i = j;
      continue;
    }
    r += c;
  }
  return r;
}

/** Retire les blocs qui commencent à chaque correspondance de debut (parenthèses ou accolades équilibrées). */
function retirerBlocs(code, debut, ouvrant) {
  const fermant = ouvrant === '(' ? ')' : '}';
  let r = code;
  for (let m = debut.exec(r); m; m = debut.exec(r)) {
    let i = r.indexOf(ouvrant, m.index + m[0].length - 1);
    if (i < 0) break;
    let n = 0;
    let j = i;
    for (; j < r.length; j++) {
      if (r[j] === ouvrant) n++;
      else if (r[j] === fermant && --n === 0) break;
    }
    r = r.slice(0, m.index) + ' ' + r.slice(j + 1);
    debut.lastIndex = 0;
  }
  return r;
}

/** Retire les déclarations « var|let|const … » jusqu'au « ; » ou à la fin de ligne hors parenthèses, crochets, accolades. */
function retirerDeclarations(code) {
  let r = code;
  const debut = /\b(?:var|let|const)\s+[\w$]/g;
  for (let m = debut.exec(r); m; m = debut.exec(r)) {
    let n = 0;
    let j = m.index;
    for (; j < r.length; j++) {
      const c = r[j];
      if ('([{'.includes(c)) n++;
      else if (')]}'.includes(c)) n--;
      else if (n <= 0 && (c === ';' || c === '\n')) break;
    }
    r = r.slice(0, m.index) + ' ' + r.slice(j + 1);
    debut.lastIndex = 0;
  }
  return r;
}

const INTERDITS = [[/\bsetTimeout\b/, 'une minuterie'], [/\bsetInterval\b/, 'une minuterie répétée'], [/\brequestAnimationFrame\b/, 'l\'image du navigateur'],
  [/\bDate\b/, 'l\'heure'], [/\bperformance\s*\.\s*now\b/, 'l\'heure'], [/\bfetch\b/, 'un téléchargement'], [/\blocalStorage\b/, 'une mémoire du navigateur']];

/** Code d'une scène -> raisons d'interdiction ([texte]) ; vide : le code respecte le contrat. */
function analyserScript(code) {
  const net = sansChaines(String(code));
  const raisons = [...new Set(INTERDITS.filter(([re]) => re.test(net)).map(([, q]) => q))];
  // Hors de M.chaqueImage : tout ce qui n'est ni l'appel, ni une déclaration de fonction ou de variable.
  let reste = retirerBlocs(net, /M\s*\.\s*chaqueImage\s*\(/g, '(');
  reste = retirerBlocs(reste, /\bfunction\s+[\w$]+\s*\([^)]*\)\s*\{/g, '{');
  // Les chaînes sont déjà vidées : « 'use strict' » n'est plus qu'une chaîne vide, seule sur sa ligne.
  reste = retirerDeclarations(reste).replace(/(['"`])\1/g, '').replace(/[\s;]/g, '');
  if (reste) raisons.push('du code exécuté une seule fois, au chargement');
  return raisons;
}

function scriptInterdit({ deroule, scenesHtml }) {
  const r = [];
  for (const s of deroule.scenes) {
    const raisons = [...new Set(scriptsScene(scenesHtml[s.id] || '').flatMap(analyserScript))];
    if (!raisons.length) continue;
    r.push({ regle: 'script-interdit', gravite: 'erreur', scene: s.id,
      message: `Scène « ${s.id} » : son code dépend de l'heure ou d'une minuterie (${raisons.join(', ')}) ; elle ne se dessinera pas pareil dans l'aperçu et dans la vidéo exportée.` });
  }
  return r;
}

/**
 * reglesRealisation({ deroule, min, scenesMinutees, scenesHtml, scenesLues, besoinLecture, avecVoix, corrigeable, temps,
 *   termes, fichiersPolices, seuils }) -> [problèmes]
 */
function reglesRealisation(o) {
  const S = o.seuils;
  const elements = Object.fromEntries(Object.entries(o.scenesLues).map(([id, l]) => [id, l.elements]));
  const social = o.deroule.genre === 'social';
  return [
    ...rienDeNouveau({ deroule: o.deroule, min: o.min, elements, scenesMinutees: o.scenesMinutees, besoinLecture: o.besoinLecture, social, S }),
    ...comparaisonCourte({ deroule: o.deroule, min: o.min, elements, avecVoix: o.avecVoix, corrigeable: o.corrigeable, S }),
    ...cameraRepetee({ deroule: o.deroule, scenesLues: o.scenesLues, temps: o.temps, S }),
    ...termeCle({ deroule: o.deroule, scenesHtml: o.scenesHtml, termes: o.termes || [] }),
    ...chiffres({ deroule: o.deroule, scenesHtml: o.scenesHtml, elements }),
    ...glyphesEtEmoji({ deroule: o.deroule, scenesHtml: o.scenesHtml, fichiersPolices: o.fichiersPolices }),
    ...imageRepetee({ deroule: o.deroule, scenesHtml: o.scenesHtml, S }),
    ...scriptInterdit({ deroule: o.deroule, scenesHtml: o.scenesHtml }),
  ];
}

module.exports = { reglesRealisation, contientTerme, analyserScript, mouvementsCamera, EMOJI };
