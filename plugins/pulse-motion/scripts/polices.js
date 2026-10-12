#!/usr/bin/env node
'use strict';
/* Pulse Motion – polices de la charte : téléchargées depuis Bunny Fonts (sur demande) ou fournies par la personne.
 *
 *   node scripts/polices.js "<famille>" [--graisses 400,700] [--dans <dossier>]
 *   node scripts/polices.js <fichier.ttf|otf|woff|woff2> [--famille "<nom>"] [--confirmer] [--dans <dossier>]
 *
 * Par défaut, les fichiers vont dans charte/polices/ du dossier courant. Résumé JSON ; code 1 en cas d'échec.
 * Bunny : l'identifiant doit exister dans le catalogue téléchargé ; une seule URL hors de fonts.bunny.net
 * fait refuser toute la feuille ; on garde le sous-ensemble latin (tout le français) ; écriture en .part
 * puis renommage, rien de partiel. Le réseau ne sert qu'à cette commande.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { analyserPolice, EXTENSIONS_POLICE } = require('./lib/police.js');
const { trouverStyle, lireJSON } = require('./styles.js');
const { sauvegarder } = require('./historique.js');

const HOTE = 'fonts.bunny.net';
const FAMILLE_ID = /^[a-z0-9-]+$/;
const DELAI = 15000;
const RIEN = ' Rien n\'a été installé.';

class Refus extends Error {}

function lireCatalogueBunny(json) {
  if (!json || typeof json !== 'object') return [];
  return Object.entries(json).filter(([, v]) => v && typeof v.familyName === 'string' && Array.isArray(v.weights)).map(([id, v]) => ({
    id, nom: v.familyName, graisses: v.weights.filter((g) => typeof g === 'number'), styles: Array.isArray(v.styles) ? v.styles : ['normal'], categorie: typeof v.category === 'string' ? v.category : 'autre',
  }));
}

/** L'identifiant doit être sûr ET présent dans le catalogue téléchargé : il part ensuite dans une URL. */
function familleConnue(id, catalogue) {
  const famille = FAMILLE_ID.test(id) && catalogue.find((f) => f.id === id);
  if (!famille) throw new Refus(`Police absente du catalogue Bunny Fonts : « ${id} ». Vérifiez son nom, ou donnez son fichier.`);
  return famille;
}

function urlFeuille(famille, graisses) {
  const dispo = graisses.filter((g) => famille.graisses.includes(g)).sort((a, b) => a - b);
  if (!dispo.length) throw new Refus(`Aucune des graisses demandées (${graisses.join(', ')}) n'existe pour ${famille.nom} : graisses disponibles ${famille.graisses.join(', ')}.`);
  return `https://${HOTE}/css?family=${famille.id}:${dispo.join(',')}`;
}

/** La plage déclarée contient-elle les lettres ordinaires et les accents (a et é) ? */
function couvreLatin(plage) {
  if (!plage) return true;
  const plages = [...plage.matchAll(/U\+([0-9a-f]+)(?:-([0-9a-f]+))?/gi)].map((m) => [parseInt(m[1], 16), parseInt(m[2] || m[1], 16)]);
  return [0x61, 0xe9].every((c) => plages.some(([a, b]) => c >= a && c <= b));
}

/** Règles @font-face de la feuille ; [] si une seule URL sort de fonts.bunny.net (feuille entière refusée). */
function fichiersDeLaFeuille(css) {
  const fichiers = [];
  for (const m of String(css).matchAll(/@font-face\s*\{([^}]*)\}/g)) {
    const bloc = m[1];
    const url = ((/url\(([^)]+)\)/.exec(bloc) || [])[1] || '').replace(/['"]/g, '').trim();
    if (!url) continue;
    if (!url.startsWith(`https://${HOTE}/`)) return [];
    fichiers.push({
      url,
      graisse: Number((/font-weight:\s*(\d+)/.exec(bloc) || [])[1] || 400),
      style: /font-style:\s*italic/.test(bloc) ? 'italic' : 'normal',
      latin: couvreLatin(((/unicode-range:\s*([^;}]+)/i.exec(bloc) || [])[1] || '').trim() || null),
    });
  }
  return fichiers;
}

/** Un fichier par graisse et style : celui du latin ordinaire (sinon le premier rencontré). */
function choisirLatin(fichiers) {
  const retenus = new Map();
  for (const f of fichiers) {
    const cle = `${f.graisse}|${f.style}`;
    const deja = retenus.get(cle);
    if (!deja || (!deja.latin && f.latin)) retenus.set(cle, f);
  }
  return [...retenus.values()];
}

// Pas de redirection suivie : seul fonts.bunny.net répond.
const recupererAvecDelai = (url) => fetch(url, { signal: AbortSignal.timeout(DELAI), redirect: 'error' });
const TAILLE_MAX = 5 * 1024 * 1024;
const aujourdhui = () => new Date().toISOString().slice(0, 10);

/** Police installée dans charte/polices d'un projet qui a un déroulé : copie avant (« annule » la défait). */
function sauvegarderProjetDe(dans) {
  const charte = path.dirname(path.resolve(dans));
  const projet = path.dirname(charte);
  if (path.basename(path.resolve(dans)) === 'polices' && path.basename(charte) === 'charte' && fs.existsSync(path.join(projet, 'deroule.json'))) sauvegarder(projet);
}

function ajouterLicence(dans, texte) {
  const fichier = path.join(dans, 'LICENCES.md');
  const debut = fs.existsSync(fichier) ? '' : '# Licences des polices\n\n';
  fs.appendFileSync(fichier, `${debut}${texte}\n\n`);
}

async function installerBunny({ famille, graisses = [400, 700], italique = false, dans, recuperer = recupererAvecDelai }) {
  const id = String(famille || '').trim().toLowerCase().replace(/\s+/g, '-');
  const parts = [];
  const installes = [];
  try {
    const liste = await recuperer(`https://${HOTE}/list`);
    if (!liste.ok) throw new Error(`catalogue indisponible, ${liste.status}`);
    const fam = familleConnue(id, lireCatalogueBunny(await liste.json()));
    // Le nom vient du catalogue téléchargé et sert de nom de fichier : caractères sûrs seulement.
    fam.nom = fam.nom.replace(/[^\p{L}\p{N} _-]/gu, '').trim();
    if (!fam.nom) throw new Refus(`Le catalogue Bunny Fonts donne un nom de police inutilisable pour « ${id} ».`);
    const feuille = await recuperer(urlFeuille(fam, graisses));
    if (!feuille.ok) throw new Error(`feuille indisponible, ${feuille.status}`);
    const fichiers = choisirLatin(fichiersDeLaFeuille(await feuille.text())).filter((f) => graisses.includes(f.graisse) && (f.style === 'normal' || (italique && f.style === 'italic')));
    if (!fichiers.length) throw new Refus(`La feuille de Bunny Fonts pour ${fam.nom} est vide ou pointe hors de ${HOTE}.`);
    sauvegarderProjetDe(dans);
    fs.mkdirSync(dans, { recursive: true });
    const entrees = [];
    for (const f of fichiers) {
      const reponse = await recuperer(f.url);
      if (!reponse.ok) throw new Error(`téléchargement refusé, ${reponse.status}`);
      const octets = Buffer.from(await reponse.arrayBuffer());
      // Le fichier doit être une police WOFF2 de taille raisonnable (pas une page d'erreur, pas un fichier démesuré).
      if (octets.length > TAILLE_MAX || octets.toString('latin1', 0, 4) !== 'wOF2') {
        throw new Refus(`Le fichier reçu de Bunny Fonts pour ${fam.nom} (${f.graisse}) n'est pas une police WOFF2 valide.`);
      }
      const nom = `${fam.nom}-${f.graisse}${f.style === 'italic' ? '-italic' : ''}.woff2`;
      const cible = path.join(dans, nom);
      fs.writeFileSync(`${cible}.part`, octets);
      parts.push(`${cible}.part`);
      entrees.push({ nom, cible, url: f.url, sha256: crypto.createHash('sha256').update(octets).digest('hex') });
    }
    for (const e of entrees) { fs.renameSync(`${e.cible}.part`, e.cible); installes.push(e.cible); }
    ajouterLicence(dans, [
      `## ${fam.nom}`, '',
      `- Source : Bunny Fonts (https://${HOTE}), le ${aujourdhui()}`,
      '- Licence : catalogue Google Fonts (SIL Open Font License, Apache 2.0 ou Ubuntu Font Licence), intégration autorisée',
      ...entrees.map((e) => `- ${e.nom} : ${e.url} (sha256 ${e.sha256})`),
    ].join('\n'));
    return { ok: true, famille: fam.nom, fichiers: entrees.map((e) => e.nom), dans };
  } catch (e) {
    // Rien de partiel : ni fichier .part, ni fichier déjà renommé de cette installation.
    for (const p of [...parts, ...installes]) { try { fs.rmSync(p, { force: true }); } catch { /* déjà absent */ } }
    if (e instanceof Refus) return { ok: false, message: e.message + RIEN };
    const cause = e.name === 'TimeoutError' || e.name === 'AbortError' ? 'délai dépassé' : (e.cause && e.cause.code) || e.message;
    return { ok: false, message: `Impossible d'installer « ${famille} » depuis Bunny Fonts (${cause}) : vérifiez la connexion internet et le nom de la police, puis relancez.${RIEN}` };
  }
}

/** Police du style pour ce rôle (titres ou texte), proposée en remplacement : « Fraunces » ou null. */
function policeDuStyle(style, role) {
  if (!style || !role) return null;
  const st = trouverStyle(style);
  const identite = st && lireJSON(path.join(st.dossier, 'identite.json'));
  const typo = identite && identite.typographie && identite.typographie[role];
  return typo && typo.famille ? typo.famille : null;
}

function installerFichier({ fichier, famille, confirmer = false, dans, style, role }) {
  const ext = path.extname(fichier).toLowerCase();
  if (!EXTENSIONS_POLICE.includes(ext)) return { ok: false, message: 'Format de police non pris en charge : donnez un fichier TTF, OTF, WOFF ou WOFF2.' };
  let octets;
  try { octets = fs.readFileSync(fichier); } catch { return { ok: false, message: `Fichier introuvable : « ${fichier} ».` }; }
  let analyse;
  try { analyse = analyserPolice(octets); } catch (e) { return { ok: false, message: `« ${path.basename(fichier)} » : ${e.message}.` }; }
  if (analyse.interdite) return { ok: false, message: `La police « ${path.basename(fichier)} » interdit son intégration dans un document (licence inscrite dans le fichier) : elle ne peut pas servir dans la vidéo. Choisissez une autre police, ou demandez une licence d'intégration à son éditeur.` };
  if (analyse.apercuSeulement && !confirmer) return { ok: false, aConfirmer: true, message: `La licence inscrite dans « ${path.basename(fichier)} » limite son intégration à l'affichage et à l'impression. Confirmez que vous avez le droit de l'utiliser dans une vidéo (ce contrôle ne remplace pas la lecture de la licence).` };
  const nomFamille = String(famille || path.basename(fichier, path.extname(fichier))).replace(/[^\p{L}\p{N} _-]/gu, '').trim();
  if (!nomFamille) return { ok: false, message: 'Indiquez le nom de la police avec --famille "<nom>".' };
  const nom = `${nomFamille}${ext}`;
  const cible = path.join(dans, nom);
  sauvegarderProjetDe(dans);
  fs.mkdirSync(dans, { recursive: true });
  fs.writeFileSync(`${cible}.part`, octets);
  fs.renameSync(`${cible}.part`, cible);
  ajouterLicence(dans, [
    `## ${nomFamille}`, '',
    `- Fichier fourni par la personne (« ${path.basename(fichier)} »), le ${aujourdhui()}`,
    `- Licence : celle de son éditeur ; intégration ${analyse.apercuSeulement ? 'limitée à l\'affichage, confirmée par la personne' : 'autorisée par le fichier'}`,
  ].join('\n'));
  const remplacement = policeDuStyle(style, role);
  const conseil = remplacement
    ? `si vos textes en contiennent, utilisez « ${remplacement} », la police des ${role} du style « ${style} ».`
    : 'gardez la police du style pour ce rôle si vos textes en contiennent.';
  const avertissements = analyse.manquants.length
    ? [`Caractères absents de cette police : ${analyse.manquants.join(' ')}. Ils s'afficheraient dans une autre police : ${conseil}`]
    : [];
  return { ok: true, famille: nomFamille, fichier: nom, dans, avertissements };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const valeur = (o) => { const i = args.indexOf(o); return i >= 0 ? args[i + 1] : undefined; };
  const cible = args.find((a, i) => !a.startsWith('--') && !['--graisses', '--dans', '--famille', '--style', '--role'].includes(args[i - 1]));
  const dans = path.resolve(valeur('--dans') || path.join('charte', 'polices'));
  if (!cible) {
    console.error('Usage : pulse-motion police "<famille>" [--graisses 400,700] [--italique] [--dans <dossier>] | <fichier> [--famille "<nom>"] [--confirmer] [--style <style> --role titres|texte] [--dans <dossier>]');
    process.exit(2);
  }
  const fini = (r) => { console.log(JSON.stringify(r, null, 2)); process.exit(r.ok ? 0 : 1); };
  if (EXTENSIONS_POLICE.includes(path.extname(cible).toLowerCase())) {
    fini(installerFichier({ fichier: cible, famille: valeur('--famille'), confirmer: args.includes('--confirmer'), dans, style: valeur('--style'), role: valeur('--role') }));
  } else {
    const graisses = (valeur('--graisses') || '400,700').split(',').map(Number).filter((g) => g > 0);
    installerBunny({ famille: cible, graisses, italique: args.includes('--italique'), dans }).then(fini);
  }
}

module.exports = { lireCatalogueBunny, familleConnue, urlFeuille, fichiersDeLaFeuille, choisirLatin, installerBunny, installerFichier };
