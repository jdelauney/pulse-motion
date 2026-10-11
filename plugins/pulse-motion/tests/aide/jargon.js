'use strict';
/* Mots réservés aux consignes : la personne ne les voit jamais dans une description, un libellé ou un bloc de fin. */
const SIGLES_JARGON = /\b(HTML|CSS|JSON|DOM)\b/;
const MOTS_JARGON = /\b(tween|render|payload|cqh|data-[a-z-]+|sous-agents?)\b/i;
const jargon = (texte) => SIGLES_JARGON.exec(texte) || MOTS_JARGON.exec(texte);
module.exports = { SIGLES_JARGON, MOTS_JARGON, jargon };
