'use strict';
/* Pulse Motion – consignes d'une compétence par section (spec Rapidité § 5.4.3) : « pulse-motion consignes creer fabrication »
 * imprime le titre, les règles et la seule section demandée, au lieu de tout le SKILL.md. Une section se nomme par le
 * premier mot de son titre, sans numéro ni accent : « ## 3. Fabrication » → fabrication, « ## 2. Déroulé et style » → deroule. */

const sansAccents = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Nom court d'un titre de section : « 1. Questions (une ronde) » → questions. */
function nomSection(titre) {
  const mot = sansAccents(titre.replace(/^\d+\.\s*/, '')).toLowerCase().match(/[a-z0-9-]+/);
  return mot ? mot[0] : '';
}

/** Découpe un SKILL.md -> { tete, sections: [{ nom, titre, texte }] } ; l'en-tête YAML est retiré de la tête. */
function decouper(texte) {
  const lignes = texte.replace(/\r\n/g, '\n').replace(/^---\n[\s\S]*?\n---\n/, '').split('\n');
  const sections = [];
  const tete = [];
  let courante = null;
  for (const l of lignes) {
    const m = /^## (.+)$/.exec(l);
    if (m) {
      courante = { nom: nomSection(m[1]), titre: m[1], lignes: [l] };
      sections.push(courante);
    } else if (courante) courante.lignes.push(l);
    else tete.push(l);
  }
  const net = (ls) => ls.join('\n').replace(/\s+$/, '') + '\n';
  return { tete: net(tete).replace(/^\n+/, ''), sections: sections.map((s) => ({ nom: s.nom, titre: s.titre, texte: net(s.lignes) })) };
}

/**
 * Titre, règles et sections demandées d'une compétence.
 * -> { ok: true, texte } | { ok: false, message, disponibles }
 */
function sectionsConsignes(texte, noms) {
  const { tete, sections } = decouper(texte);
  const disponibles = sections.map((s) => s.nom).filter((n) => n !== 'regles');
  const inconnus = noms.filter((n) => !disponibles.includes(n));
  if (inconnus.length) {
    return { ok: false, message: `Section inconnue : ${inconnus.join(', ')}. Sections : ${disponibles.join(', ')}.`, disponibles };
  }
  const regles = sections.filter((s) => s.nom === 'regles');
  const choisies = sections.filter((s) => noms.includes(s.nom));
  return { ok: true, texte: [tete, ...regles.map((s) => s.texte), ...choisies.map((s) => s.texte)].join('\n') };
}

module.exports = { sectionsConsignes, nomSection, decouper };
