'use strict';
/* Pulse Motion – archives ZIP sans dépendance (bibliothèque personnelle, chantier H).
 *
 * ecrireZip([{ nom, donnees, date? }]) -> Buffer : méthode Deflate (ou stockée quand Deflate ne gagne rien), noms en UTF-8
 * (drapeau 11), sans ZIP64 ; s'ouvre dans l'explorateur de fichiers de Windows et de macOS.
 * lireZip(donnees, { maxEntrees, maxOctets }) -> [{ nom, donnees }] : lecture prudente d'une archive venue d'ailleurs :
 * annuaire central, méthodes stockée et Deflate seulement, chiffrement refusé, taille décompressée bornée (entrée par entrée
 * et en tout), somme de contrôle vérifiée. Les dossiers (noms finissant par « / ») sont ignorés. Les noms ne sont pas jugés
 * ici : c'est à l'appelant de n'accepter que des chemins qu'il connaît (cheminSur).
 * Format : APPNOTE de PKWARE (en-têtes local et central, fin d'annuaire).
 */
const zlib = require('node:zlib');

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_FIN = 0x06054b50;
const UTF8 = 0x0800;
const MAX_ENTREES = 10000;
const MAX_OCTETS = 512 * 1024 * 1024;

const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** CRC-32 (celui de zlib quand Node l'a, sinon la table). */
function crc32(octets) {
  if (typeof zlib.crc32 === 'function') return zlib.crc32(octets) >>> 0;
  let c = 0xffffffff;
  for (let i = 0; i < octets.length; i++) c = TABLE[(c ^ octets[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Date au format MS-DOS (heure locale, à 2 s près ; 1980 au plus tôt). -> { heure, jour } */
function dateDos(date) {
  const d = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  const an = Math.max(1980, Math.min(2107, d.getFullYear()));
  return {
    heure: ((d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2)) & 0xffff,
    jour: (((an - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff,
  };
}

/** Archive ZIP des entrées { nom (chemin avec « / »), donnees (Buffer ou texte), date? }. -> Buffer */
function ecrireZip(entrees) {
  const morceaux = [];
  const central = [];
  let position = 0;
  for (const e of entrees) {
    const nom = Buffer.from(String(e.nom), 'utf8');
    const donnees = Buffer.isBuffer(e.donnees) ? e.donnees : Buffer.from(String(e.donnees), 'utf8');
    const deflate = zlib.deflateRawSync(donnees, { level: 9 });
    const stocke = deflate.length >= donnees.length;
    const corps = stocke ? donnees : deflate;
    const methode = stocke ? 0 : 8;
    const crc = crc32(donnees);
    const { heure, jour } = dateDos(e.date);
    if (position + 30 + nom.length + corps.length > 0xffffffff) throw new Error('archive trop grosse (4 Go au plus)');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(SIG_LOCAL, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(UTF8, 6);
    local.writeUInt16LE(methode, 8);
    local.writeUInt16LE(heure, 10);
    local.writeUInt16LE(jour, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(corps.length, 18);
    local.writeUInt32LE(donnees.length, 22);
    local.writeUInt16LE(nom.length, 26);
    local.writeUInt16LE(0, 28);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(SIG_CENTRAL, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(UTF8, 8);
    c.writeUInt16LE(methode, 10);
    c.writeUInt16LE(heure, 12);
    c.writeUInt16LE(jour, 14);
    c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(corps.length, 20);
    c.writeUInt32LE(donnees.length, 24);
    c.writeUInt16LE(nom.length, 28);
    c.writeUInt32LE(position, 42);
    central.push(c, nom);
    morceaux.push(local, nom, corps);
    position += local.length + nom.length + corps.length;
  }
  const annuaire = Buffer.concat(central);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(SIG_FIN, 0);
  fin.writeUInt16LE(entrees.length, 8);
  fin.writeUInt16LE(entrees.length, 10);
  fin.writeUInt32LE(annuaire.length, 12);
  fin.writeUInt32LE(position, 16);
  if (entrees.length > 0xffff) throw new Error('archive : trop de fichiers (65 535 au plus)');
  return Buffer.concat([...morceaux, annuaire, fin]);
}

function ErreurZip(message) {
  const e = new Error(message);
  e.zip = true;
  return e;
}

/** Entrées d'une archive ZIP. Lève une erreur (e.zip) pour une archive illisible, abîmée, chiffrée ou trop grosse. */
function lireZip(donnees, { maxEntrees = MAX_ENTREES, maxOctets = MAX_OCTETS } = {}) {
  if (!Buffer.isBuffer(donnees) || donnees.length < 22) throw ErreurZip('ce fichier n\'est pas une archive ZIP');
  let fin = -1;
  for (let i = donnees.length - 22; i >= Math.max(0, donnees.length - 22 - 0xffff); i--) {
    if (donnees.readUInt32LE(i) === SIG_FIN) { fin = i; break; }
  }
  if (fin < 0) throw ErreurZip('ce fichier n\'est pas une archive ZIP');
  const nombre = donnees.readUInt16LE(fin + 10);
  const taille = donnees.readUInt32LE(fin + 12);
  const debut = donnees.readUInt32LE(fin + 16);
  if (nombre === 0xffff || debut === 0xffffffff) throw ErreurZip('archive ZIP64, non prise en charge');
  if (nombre > maxEntrees) throw ErreurZip(`archive trop grosse (${nombre} fichiers, ${maxEntrees} au plus)`);
  if (debut + taille > fin) throw ErreurZip('archive abîmée (annuaire hors du fichier)');
  const sortie = [];
  let total = 0;
  let p = debut;
  for (let k = 0; k < nombre; k++) {
    if (p + 46 > fin || donnees.readUInt32LE(p) !== SIG_CENTRAL) throw ErreurZip('archive abîmée (annuaire illisible)');
    const drapeaux = donnees.readUInt16LE(p + 8);
    const methode = donnees.readUInt16LE(p + 10);
    const crc = donnees.readUInt32LE(p + 16);
    const tailleComprimee = donnees.readUInt32LE(p + 20);
    const tailleReelle = donnees.readUInt32LE(p + 24);
    const lNom = donnees.readUInt16LE(p + 28);
    const lExtra = donnees.readUInt16LE(p + 30);
    const lCommentaire = donnees.readUInt16LE(p + 32);
    const local = donnees.readUInt32LE(p + 42);
    const brut = donnees.subarray(p + 46, p + 46 + lNom);
    const nom = drapeaux & UTF8 ? brut.toString('utf8') : brut.toString('latin1');
    p += 46 + lNom + lExtra + lCommentaire;
    if (nom.endsWith('/')) continue;
    if (drapeaux & 1) throw ErreurZip(`« ${nom} » est chiffré : archive refusée`);
    if (methode !== 0 && methode !== 8) throw ErreurZip(`« ${nom} » : méthode de compression ${methode} non prise en charge`);
    total += tailleReelle;
    if (total > maxOctets) throw ErreurZip(`archive trop grosse (plus de ${Math.round(maxOctets / 1048576)} Mo une fois ouverte)`);
    if (local + 30 > donnees.length || donnees.readUInt32LE(local) !== SIG_LOCAL) throw ErreurZip(`« ${nom} » : en-tête abîmé`);
    const depart = local + 30 + donnees.readUInt16LE(local + 26) + donnees.readUInt16LE(local + 28);
    if (depart + tailleComprimee > donnees.length) throw ErreurZip(`« ${nom} » : archive tronquée`);
    const corps = donnees.subarray(depart, depart + tailleComprimee);
    let contenu;
    try {
      contenu = methode === 0 ? Buffer.from(corps) : zlib.inflateRawSync(corps, { maxOutputLength: Math.max(1, tailleReelle) });
    } catch (e) {
      throw ErreurZip(`« ${nom} » : contenu abîmé (${e.code === 'ERR_BUFFER_TOO_LARGE' ? 'plus gros qu\'annoncé' : e.message})`);
    }
    if (contenu.length !== tailleReelle || crc32(contenu) !== crc) throw ErreurZip(`« ${nom} » : contenu abîmé (somme de contrôle fausse)`);
    sortie.push({ nom, donnees: contenu });
  }
  return sortie;
}

/** Chemin relatif sûr d'une archive : segments non vides, ni « . » ni « .. », ni « \ », ni « : », ni chemin absolu. */
function cheminSur(nom) {
  if (typeof nom !== 'string' || !nom || nom.length > 400 || nom.startsWith('/') || /[\\:\0]/.test(nom)) return false;
  return nom.split('/').every((s) => s !== '' && s !== '.' && s !== '..' && !/[<>"|?*\u0000-\u001f]/.test(s));
}

module.exports = { ecrireZip, lireZip, cheminSur, crc32, MAX_ENTREES, MAX_OCTETS };
