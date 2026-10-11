'use strict';
/* Polices minimales pour les tests : tables OS/2 et cmap (format 12), en TTF, WOFF ou WOFF2. */
const zlib = require('node:zlib');
const { FRANCAIS } = require('../../scripts/lib/police.js');

function os2(fsType) { const t = Buffer.alloc(78); t.writeUInt16BE(4, 0); t.writeUInt16BE(fsType, 8); return t; }

function cmap12(codes) {
  const g = [...new Set(codes)].sort((a, b) => a - b);
  const t = Buffer.alloc(12 + 16 + g.length * 12);
  t.writeUInt16BE(0, 0); t.writeUInt16BE(1, 2); t.writeUInt16BE(3, 4); t.writeUInt16BE(10, 6); t.writeUInt32BE(12, 8);
  t.writeUInt16BE(12, 12); t.writeUInt32BE(16 + g.length * 12, 16); t.writeUInt32BE(g.length, 24);
  g.forEach((c, i) => { const o = 28 + i * 12; t.writeUInt32BE(c, o); t.writeUInt32BE(c, o + 4); t.writeUInt32BE(i + 1, o + 8); });
  return t;
}

const base128 = (v) => { const o = []; do { o.unshift(v & 0x7f); v = Math.floor(v / 128); } while (v > 0); return Buffer.from(o.map((x, i) => (i < o.length - 1 ? x | 0x80 : x))); };

function sfnt(tables) {
  const tete = Buffer.alloc(12 + 16 * tables.length);
  tete.writeUInt32BE(0x00010000, 0); tete.writeUInt16BE(tables.length, 4);
  let offset = tete.length;
  const corps = [];
  tables.forEach(([tag, d], i) => {
    const e = 12 + i * 16;
    tete.write(tag, e, 'latin1'); tete.writeUInt32BE(offset, e + 8); tete.writeUInt32BE(d.length, e + 12);
    const pad = Buffer.alloc((4 - (d.length % 4)) % 4);
    corps.push(d, pad); offset += d.length + pad.length;
  });
  return Buffer.concat([tete, ...corps]);
}

function woff(tables) {
  const entrees = tables.map(([tag, d]) => ({ tag, d, z: zlib.deflateSync(d) }));
  const tete = Buffer.alloc(44 + 20 * tables.length);
  tete.write('wOFF', 0, 'latin1'); tete.writeUInt32BE(0x00010000, 4); tete.writeUInt16BE(tables.length, 12);
  let offset = tete.length;
  entrees.forEach((e, i) => {
    const o = 44 + i * 20;
    tete.write(e.tag, o, 'latin1'); tete.writeUInt32BE(offset, o + 4); tete.writeUInt32BE(e.z.length, o + 8); tete.writeUInt32BE(e.d.length, o + 12);
    offset += e.z.length;
  });
  return Buffer.concat([tete, ...entrees.map((e) => e.z)]);
}

function woff2(tables) {
  const repertoire = Buffer.concat(tables.map(([tag, d]) => Buffer.concat([Buffer.from([63]), Buffer.from(tag, 'latin1'), base128(d.length)])));
  const flux = zlib.brotliCompressSync(Buffer.concat(tables.map(([, d]) => d)));
  const tete = Buffer.alloc(48);
  tete.write('wOF2', 0, 'latin1'); tete.writeUInt32BE(0x00010000, 4); tete.writeUInt16BE(tables.length, 12); tete.writeUInt32BE(flux.length, 20);
  return Buffer.concat([tete, repertoire, flux]);
}

function police({ fsType = 0, texte = FRANCAIS, format = 'ttf' } = {}) {
  const tables = [['OS/2', os2(fsType)], ['cmap', cmap12([...texte].map((c) => c.codePointAt(0)))]].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  return { ttf: sfnt, woff, woff2 }[format](tables);
}

module.exports = { police };
