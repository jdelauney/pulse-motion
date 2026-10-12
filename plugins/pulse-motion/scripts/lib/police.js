'use strict';
/* Pulse Motion – lecture des polices (TTF, OTF, WOFF, WOFF2) sans dépendance :
 * licence d'intégration (OS/2.fsType) et caractères couverts (cmap) ; fichiers d'une famille dans un dossier. */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

// Ordre des tables connues du format WOFF2 (index 0 à 62 des drapeaux du répertoire).
const TAGS_WOFF2 = ['cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep', 'CFF ', 'VORG', 'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC', 'JSTF', 'MATH', 'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar', 'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar', 'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat', 'Gloc', 'Feat', 'Sill'];
const FRANCAIS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789éèêëàâäîïôöùûüÿçœæÉÈÊÀÇŒ«»’€%°…';
const EXTENSIONS_POLICE = ['.woff2', '.woff', '.ttf', '.otf'];

function tablesSfnt(buf) {
  const n = buf.readUInt16BE(4);
  const tables = new Map();
  for (let i = 0; i < n; i++) {
    const e = 12 + i * 16;
    const offset = buf.readUInt32BE(e + 8);
    tables.set(buf.toString('latin1', e, e + 4), buf.subarray(offset, offset + buf.readUInt32BE(e + 12)));
  }
  return tables;
}

function tablesWoff(buf) {
  const n = buf.readUInt16BE(12);
  const tables = new Map();
  for (let i = 0; i < n; i++) {
    const e = 44 + i * 20;
    const offset = buf.readUInt32BE(e + 4);
    const compresse = buf.readUInt32BE(e + 8);
    const donnees = buf.subarray(offset, offset + compresse);
    tables.set(buf.toString('latin1', e, e + 4), compresse < buf.readUInt32BE(e + 12) ? zlib.inflateSync(donnees) : donnees);
  }
  return tables;
}

function lireBase128(buf, pos) {
  let v = 0;
  for (let i = 0; i < 5; i++) {
    const octet = buf[pos.i++];
    if (octet === undefined || (i === 0 && octet === 0x80)) throw new Error('police WOFF2 abîmée');
    v = v * 128 + (octet & 0x7f);
    if (!(octet & 0x80)) return v;
  }
  throw new Error('police WOFF2 abîmée');
}

function tablesWoff2(buf) {
  if (buf.readUInt32BE(4) === 0x74746366) throw new Error('collection de polices (TTC) non prise en charge');
  const n = buf.readUInt16BE(12);
  const compresse = buf.readUInt32BE(20);
  const pos = { i: 48 };
  const entrees = [];
  for (let k = 0; k < n; k++) {
    const drapeaux = buf[pos.i++];
    const index = drapeaux & 0x3f;
    let tag;
    if (index === 63) { tag = buf.toString('latin1', pos.i, pos.i + 4); pos.i += 4; } else tag = TAGS_WOFF2[index];
    const origine = lireBase128(buf, pos);
    const version = (drapeaux >> 6) & 3;
    const transformee = tag === 'glyf' || tag === 'loca' ? version === 0 : version !== 0;
    entrees.push({ tag, longueur: transformee ? lireBase128(buf, pos) : origine });
  }
  const flux = zlib.brotliDecompressSync(buf.subarray(pos.i, pos.i + compresse));
  const tables = new Map();
  let o = 0;
  for (const e of entrees) { tables.set(e.tag, flux.subarray(o, o + e.longueur)); o += e.longueur; }
  return tables;
}

/** Tables de la police (décompressées). Lève une erreur en français pour un fichier non pris en charge. */
function lireTables(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) throw new Error('ce fichier n\'est pas une police TTF, OTF, WOFF ou WOFF2');
  const signature = buf.toString('latin1', 0, 4);
  try {
    if (signature === 'wOF2') return tablesWoff2(buf);
    if (signature === 'wOFF') return tablesWoff(buf);
    if (signature === 'OTTO' || signature === 'true' || buf.readUInt32BE(0) === 0x00010000) return tablesSfnt(buf);
  } catch (e) {
    if (/TTC|abîmée/.test(e.message)) throw e;
    throw new Error('police abîmée ou illisible');
  }
  if (signature === 'ttcf') throw new Error('collection de polices (TTC) non prise en charge');
  throw new Error('ce fichier n\'est pas une police TTF, OTF, WOFF ou WOFF2');
}

/** cmap -> fonction code => vrai si un glyphe existe (sous-tables 3/10 ou 0/x format 12, sinon 3/1 ou 0/x format 4). */
function lecteurCmap(cmap) {
  const n = cmap.readUInt16BE(2);
  let choix = null;
  for (let i = 0; i < n; i++) {
    const plateforme = cmap.readUInt16BE(4 + i * 8);
    const encodage = cmap.readUInt16BE(6 + i * 8);
    const offset = cmap.readUInt32BE(8 + i * 8);
    const format = cmap.readUInt16BE(offset);
    const rang = format === 12 && (plateforme === 0 || (plateforme === 3 && encodage === 10)) ? 3
      : format === 4 && (plateforme === 0 || (plateforme === 3 && encodage === 1)) ? 2 : 0;
    if (rang && (!choix || rang > choix.rang)) choix = { rang, offset, format };
  }
  if (!choix) return () => false;
  const o = choix.offset;
  if (choix.format === 12) {
    const groupes = cmap.readUInt32BE(o + 12);
    return (code) => {
      for (let g = 0; g < groupes; g++) {
        const e = o + 16 + g * 12;
        if (code >= cmap.readUInt32BE(e) && code <= cmap.readUInt32BE(e + 4)) return true;
      }
      return false;
    };
  }
  const seg = cmap.readUInt16BE(o + 6) / 2;
  const fins = o + 14;
  const debuts = fins + seg * 2 + 2;
  const deltas = debuts + seg * 2;
  const decalages = deltas + seg * 2;
  return (code) => {
    if (code > 0xffff) return false;
    for (let s = 0; s < seg; s++) {
      if (code > cmap.readUInt16BE(fins + s * 2)) continue;
      const debut = cmap.readUInt16BE(debuts + s * 2);
      if (code < debut) return false;
      const delta = cmap.readUInt16BE(deltas + s * 2);
      const decalage = cmap.readUInt16BE(decalages + s * 2);
      if (decalage === 0) return ((code + delta) & 0xffff) !== 0;
      const g = cmap.readUInt16BE(decalages + s * 2 + decalage + (code - debut) * 2);
      return g !== 0 && ((g + delta) & 0xffff) !== 0;
    }
    return false;
  };
}

/** -> { fsType, interdite, apercuSeulement, manquants } */
function analyserPolice(buf) {
  const tables = lireTables(buf);
  const os2 = tables.get('OS/2');
  const fsType = os2 && os2.length >= 10 ? os2.readUInt16BE(8) : 0;
  const cmap = tables.get('cmap');
  if (!cmap) throw new Error('police sans table de caractères (cmap)');
  let manquants;
  try {
    const contient = lecteurCmap(cmap);
    manquants = [...new Set(FRANCAIS)].filter((c) => !contient(c.codePointAt(0)));
  } catch {
    // Table des caractères qui pointe hors du fichier : lecture impossible.
    throw new Error('police abîmée ou illisible');
  }
  return {
    fsType,
    interdite: (fsType & 0x000f) === 0x0002,
    apercuSeulement: (fsType & 0x0004) !== 0 && (fsType & 0x0008) === 0,
    manquants,
  };
}

/** Fichiers « <famille>.<ext> » ou « <famille>-<graisse>.<ext> » du premier dossier qui en contient. */
function trouverFichiersPolice(famille, dossiers) {
  for (const dossier of dossiers) {
    let noms;
    try { noms = fs.readdirSync(dossier); } catch { continue; }
    const trouves = [];
    for (const nom of noms) {
      const ext = path.extname(nom).toLowerCase();
      if (!EXTENSIONS_POLICE.includes(ext)) continue;
      const base = nom.slice(0, -ext.length);
      const m = /^(.*)-(\d{3})(-italic)?$/.exec(base);
      if (base === famille) trouves.push({ fichier: path.join(dossier, nom), graisse: null, italique: false });
      else if (m && m[1] === famille) trouves.push({ fichier: path.join(dossier, nom), graisse: Number(m[2]), italique: Boolean(m[3]) });
    }
    if (trouves.length) return trouves.sort((a, b) => (a.graisse || 0) - (b.graisse || 0) || Number(a.italique) - Number(b.italique));
  }
  return [];
}

module.exports = { lireTables, analyserPolice, trouverFichiersPolice, FRANCAIS, EXTENSIONS_POLICE };
