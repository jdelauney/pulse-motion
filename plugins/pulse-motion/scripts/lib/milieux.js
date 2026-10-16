'use strict';
/* Pulse Motion – milieu fluide d'une scène (P5c) à l'assemblage.
 *
 * Une scène pose son milieu avec <div data-milieu="nom" data-ancre="#id" data-calque="avant|arriere" data-reglages="…"
 * data-start="…" data-dur="…"></div> : recette de effets/ du projet, puis de la bibliothèque, qui a un bloc « milieu ».
 * Zone : l'ancre, ou la balise (plein cadre : la scène entière). Calque : arriere par défaut. Sans data-dur : jusqu'à la
 * fin de la scène (sansDuree), comme un fond par shader.
 * preparerMilieux(html, { scene, projet, bibliotheque, charte, premierIndex, dureeTemps })
 *   -> { html, milieux: [{ scene, calque, ancre, sansDuree, effet }], erreurs: [{ regle, gravite, scene, element?, message }] }
 * Chaque balise reçoit data-pm-milieu="N" (index dans M.donnees.milieux) ou data-pm-milieu-erreur (panneau dans l'aperçu) ;
 * erreurs : milieu-invalide (recette sans bloc « milieu », calque, bloc mal écrit), ancre-introuvable, deux-milieux (un seul
 * milieu par scène : le premier valide est gardé), et celles des recettes (effet-inconnu, reglage-invalide…).
 */
const { lireAttributs } = require('./extraire.js');
const { echapperHTML } = require('./scenes.js');
const { chargeurRecettes, graineParDefaut } = require('./effets.js');
const R = require('../../moteur/particules/recette.js');
const { lireSecondes } = require('../../moteur/minutage.js');

const BALISE = /<([a-zA-Z][\w-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
const CALQUES = ['avant', 'arriere'];

function preparerMilieux(html, { scene, projet, bibliotheque, charte = {}, premierIndex = 0, dureeTemps = null }) {
  const milieux = [];
  const erreurs = [];
  const source = String(html);
  const ids = new Set();
  for (const m of source.replace(/<!--[\s\S]*?-->/g, '').matchAll(BALISE)) {
    const a = lireAttributs(m[2]);
    if (a.id) ids.add(a.id);
  }
  const charger = chargeurRecettes(projet, bibliotheque);
  let ordre = 0;

  const sortie = source.replace(BALISE, (tout, balise, texteAttributs) => {
    const a = lireAttributs(texteAttributs);
    if (!('data-milieu' in a)) return tout;
    const position = ordre++;
    const fermante = /\/\s*$/.test(texteAttributs) ? ' /' : '';
    const attributs = texteAttributs.replace(/\s*\/\s*$/, '');
    const element = a.id || undefined;
    const signaler = (liste) => {
      liste.forEach(({ regle, message }) => erreurs.push({ regle, gravite: 'erreur', scene, ...(element ? { element } : {}), message: `Scène « ${scene} » : ${message}` }));
      return `<${balise}${attributs} data-pm-milieu-erreur="${echapperHTML(liste.map((e) => e.message).join(' '))}"${fermante}>`;
    };

    const nom = String(a['data-milieu']).trim();
    const calque = (a['data-calque'] || 'arriere').trim();
    if (!CALQUES.includes(calque)) return signaler([{ regle: 'milieu-invalide', message: `data-calque « ${calque} » : avant ou arriere.` }]);
    let ancre = null;
    if (a['data-ancre'] !== undefined) {
      const m = /^#([A-Za-z0-9_-]+)$/.exec(a['data-ancre'].trim());
      if (!m || !ids.has(m[1])) return signaler([{ regle: 'ancre-introuvable', message: `data-ancre « ${a['data-ancre']} » ne désigne aucun élément de la scène (forme attendue : #id).` }]);
      ancre = m[1];
    }
    // Durée : data-dur (illisible : 1 s, le minutage le signale) ; absente : jusqu'à la fin de la scène (dur des expressions : 1).
    const sansDuree = a['data-dur'] === undefined;
    const lu = sansDuree ? null : lireSecondes(String(a['data-dur']), dureeTemps);
    const dur = lu && !lu.erreur ? lu.valeur : 1;

    let compile;
    try {
      compile = R.compiler(R.resoudre(nom, charger), { reglages: a['data-reglages'] || '', charte, dur, graine: graineParDefaut(scene, position, nom) });
    } catch (e) {
      if (!e.regle) throw e;
      compile = { ok: false, erreurs: [{ regle: e.regle, message: e.message }] };
    }
    if (!compile.ok) return signaler(compile.erreurs);
    if (!compile.effet.milieu) {
      return signaler([{ regle: 'milieu-invalide', message: `« ${nom} » n'est pas un milieu (recette sans bloc « milieu ») : un effet se pose avec data-effet="${nom}".` }]);
    }
    if (milieux.length) {
      return signaler([{ regle: 'deux-milieux', message: `un seul milieu par scène : « ${nom} » est de trop (le premier, « ${milieux[0].effet.nom} », est gardé).` }]);
    }
    const index = premierIndex + milieux.length;
    milieux.push({ scene, calque, ancre, sansDuree, effet: compile.effet });
    return `<${balise}${attributs} data-pm-milieu="${index}"${fermante}>`;
  });

  return { html: sortie, milieux, erreurs };
}

module.exports = { preparerMilieux };
