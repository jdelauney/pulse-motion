'use strict';
/* Pulse Motion – préparation d'une scène : contrôle de la section, textes, scripts. */

function echapperHTML(texte) {
  return String(texte)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/\n/g, '<br>');
}

/** Vérifie qu'un fichier de scène contient une seule <section data-scene="id">. -> message ou null */
function verifierSection(html, id) {
  const sections = html.match(/<section\b[^>]*>/gi) || [];
  if (sections.length !== 1) return `le fichier doit contenir exactement une <section> (trouvé : ${sections.length}).`;
  const m = /\sdata-scene=(["'])([^"']*)\1/.exec(sections[0]);
  if (!m) return 'la <section> doit porter data-scene="' + id + '".';
  if (m[2] !== id) return `la <section> porte data-scene="${m[2]}" au lieu de "${id}".`;
  return null;
}

const ELEMENT_TEXTE = /<([a-zA-Z][\w-]*)(\b[^>]*?\sdata-texte=(["'])([^"']+)\3[^>]*)>([\s\S]*?)<\/\1>/g;

/**
 * Remplit les éléments data-texte="clé" avec les textes du déroulé (échappés).
 * -> { html, manquants: [clé] }
 */
function injecterTextes(html, textes) {
  const manquants = [];
  const sortie = html.replace(ELEMENT_TEXTE, (tout, balise, attributs, g, cle) => {
    if (!Object.prototype.hasOwnProperty.call(textes || {}, cle)) {
      manquants.push(cle);
      return `<${balise}${attributs}>[texte « ${echapperHTML(cle)} » manquant]</${balise}>`;
    }
    return `<${balise}${attributs}>${echapperHTML(textes[cle])}</${balise}>`;
  });
  return { html: sortie, manquants };
}

/** Retire les <script> d'une scène. -> { html, scripts: [code] } */
function extraireScripts(html) {
  const scripts = [];
  const sortie = html.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gi, (tout, code) => {
    scripts.push(code);
    return '';
  });
  return { html: sortie, scripts };
}

/** Ajoute src="logo" aux <img data-logo>. */
function injecterLogo(html, uriLogo) {
  if (!uriLogo) return html;
  return html.replace(/<img\b([^>]*\sdata-logo\b[^>]*?)\/?>/gi, (tout, attributs) => {
    const sansSrc = attributs.replace(/\ssrc=(["'])[^"']*\1/i, '');
    return `<img${sansSrc} src="${uriLogo}">`;
  });
}

/** Section de remplacement affichée dans l'aperçu quand une scène est en erreur. */
function panneauErreur(id, message) {
  return `<section data-scene="${echapperHTML(id)}" data-pm-erreur><div class="pm-erreur">Scène « ${echapperHTML(id)} » : ${echapperHTML(message)}</div></section>`;
}

module.exports = { echapperHTML, verifierSection, injecterTextes, extraireScripts, injecterLogo, panneauErreur };
