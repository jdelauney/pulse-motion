/* Pulse Motion – habillage « pièces » des personnages dessinés (personnages/dessins/<nom>.json), dans la page.
 *
 *   var perso = M.pieces.creer(groupeSvg, dessin, gabarit);    // dessin déjà validé (SVG filtré)
 *   perso.rendre(M.squelette.calculer(pose, gabarit, contexte));
 *   perso.main('Avant')                                         // <g> de la main, pour un accessoire tenu
 *
 * Chaque os porte une pièce dessinée « os debout » (pivot à l'origine, os vers +y sur sa longueur du gabarit),
 * un dessin par vue (profil obligatoire ; troisQuarts, face, dos facultatifs). À chaque image, seulement des
 * transformations : translate(pivot) rotate(angle écran) scale(miroir, longueur projetée / longueur du gabarit),
 * et l'affichage de la vue retenue (torse : vue + torseRot ; tête et visage : vue + teteTourne ; reste : vue).
 * Profil et 3/4 en miroir quand le personnage regarde vers la gauche. Visage : yeux (blanc, pupille bornée,
 * paupière découpée par le blanc), sourcils, bouche nommée (remplacement par la plus proche) ; caché de dos.
 * Couleurs : variables CSS --<nom> ; chaîne éloignée : classe pm-perso-loin et --teinte-loin: var(--dos).
 */
(function (racine, fabrique) {
  var api = fabrique(racine);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { racine.M = racine.M || {}; racine.M.pieces = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (racine) {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var DEG = Math.PI / 180;
  var SEUIL_LOIN = -6;
  var VUES = ['profil', 'troisQuarts', 'face', 'dos'];
  var REMPLACE = {
    profil: ['profil'], troisQuarts: ['troisQuarts', 'profil'], troisQuartsDos: ['profil'],
    face: ['face', 'troisQuarts', 'profil'], dos: ['dos', 'face', 'troisQuarts', 'profil']
  };
  var REMPLACE_VISAGE = { profil: ['profil'], troisQuarts: ['troisQuarts', 'profil'], face: ['face', 'troisQuarts', 'profil'] };
  var BOUCHES = {
    rire: ['rire', 'sourire'], sourire: ['sourire'], triste: ['triste'], colere: ['colere'], repos: ['repos'],
    surprise: ['surprise', 'O'], MBP: ['MBP', 'repos'], A: ['A', 'O', 'surprise'], E: ['E', 'I', 'A', 'O', 'surprise'],
    I: ['I', 'E', 'A', 'O', 'surprise'], O: ['O', 'U', 'A', 'surprise'], U: ['U', 'O', 'A', 'surprise'],
    FV: ['FV', 'MBP', 'repos'], L: ['L', 'E', 'I', 'A', 'O', 'surprise']
  };
  var CHAINES = [
    ['jambeArriere', ['cuisseArriere', 'tibiaArriere', 'piedArriere']],
    ['brasArriere', ['brasArriere', 'avantBrasArriere', 'mainArriere']],
    ['colonne', ['bassin', 'torse']],
    ['tete', ['tete']],
    ['brasAvant', ['brasAvant', 'avantBrasAvant', 'mainAvant']],
    ['jambeAvant', ['cuisseAvant', 'tibiaAvant', 'piedAvant']]
  ];
  var compteur = 0;
  var RACCOURCI_MIN = 0.15; // un membre pointé droit vers la caméra garde un peu de longueur (ses bouts arrondis)

  function r2(v) { return Math.round(v * 100) / 100 + 0; }
  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    if (parent) parent.appendChild(e);
    return e;
  }

  /** Vue d'un angle (degrés). */
  function vueDe(a) {
    a = ((a % 360) + 540) % 360 - 180;
    var ab = Math.abs(a);
    if (Math.min(ab, 180 - ab) <= 22.5) return 'profil';
    if (Math.abs(a - 90) <= 22.5) return 'face';
    if (Math.abs(a + 90) <= 22.5) return 'dos';
    return a > 0 ? 'troisQuarts' : 'troisQuartsDos';
  }
  function miroirDe(vue, a) { return vue === 'face' || vue === 'dos' ? 1 : (Math.cos(a * DEG) < 0 ? -1 : 1); }
  function premier(liste, dispo) { for (var i = 0; i < liste.length; i++) if (dispo[liste[i]]) return liste[i]; return null; }

  /** Bouche à afficher : la demandée, sinon la plus proche dans la table, sinon neutre ; null si aucune. */
  function boucheDe(nom, disponibles) {
    var dispo = {};
    disponibles.forEach(function (n) { dispo[n] = true; });
    return premier((BOUCHES[nom] || [nom]).concat(['neutre']), dispo);
  }

  function creer(groupe, dessin, gabarit) {
    var S = racine.M.squelette;
    var g = S.completerGabarit(gabarit);
    var id = 'pm-perso-' + (++compteur);
    var couleurs = dessin.couleurs || {};
    var accessoires = dessin.accessoires || [];
    // Le groupe peut être réutilisé (l'atelier change de dessin) : on repart d'un groupe vide.
    while (groupe.firstChild) groupe.removeChild(groupe.firstChild);
    (groupe.__pmVariables || []).forEach(function (k) { groupe.style.removeProperty(k); });
    groupe.__pmVariables = Object.keys(couleurs).map(function (k) { return '--' + k; });
    groupe.classList.add('pm-perso');
    groupe.setAttribute('data-decor', '');
    Object.keys(couleurs).forEach(function (k) { groupe.style.setProperty('--' + k, couleurs[k]); });
    var racineG = el('g', { 'data-pm-perso-racine': '' }, groupe);
    var parties = {}, pieces = {};
    var signature = '';

    function construireVues(parent, dessins) {
      var vues = {};
      VUES.forEach(function (v) {
        if (dessins && typeof dessins[v] === 'string') {
          var e = el('g', { 'data-vue': v }, parent);
          e.innerHTML = dessins[v];
          e.style.display = 'none';
          vues[v] = e;
        }
      });
      return vues;
    }
    function accessoire(parent, a) { var e = el('g', { 'data-accessoire': a.nom }, parent); return { vues: construireVues(e, a.dessins), actuelle: null }; }

    function construireVisage(parent) {
      var V = dessin.visage, oeil = V.oeil || {};
      var gv = el('g', { 'data-visage': '' }, parent);
      var parVue = {};
      Object.keys(REMPLACE_VISAGE).forEach(function (vue) {
        var pos = V.vues && V.vues[vue];
        if (!pos) return;
        var gvue = el('g', { 'data-visage-vue': vue }, gv);
        gvue.style.display = 'none';
        var yeux = pos.yeux.map(function (p, i) {
          var ge = el('g', { 'data-oeil': String(i) }, gvue);
          var clip = id + '-' + vue + '-oeil-' + i;
          el('clipPath', { id: clip }, ge).innerHTML = oeil.blanc;
          el('g', null, ge).innerHTML = oeil.blanc;
          var dedans = el('g', { 'clip-path': 'url(#' + clip + ')' }, ge);
          var pupille = el('g', { 'data-pupille': '' }, dedans);
          if (oeil.pupille) pupille.innerHTML = oeil.pupille;
          var paupiere = el('g', { 'data-paupiere': '' }, dedans);
          if (oeil.paupiere) paupiere.innerHTML = oeil.paupiere;
          return { g: ge, pos: p, pupille: pupille, paupiere: paupiere };
        });
        var centre = pos.yeux.reduce(function (s, p) { return s + p[0]; }, 0) / pos.yeux.length;
        var sourcils = (pos.sourcils || []).map(function (p) {
          var gs = el('g', { 'data-sourcil': '' }, gvue);
          if (V.sourcil) gs.innerHTML = V.sourcil;
          return { g: gs, pos: p };
        });
        var gb = el('g', { 'data-bouche': '', transform: 'translate(' + pos.bouche[0] + ' ' + pos.bouche[1] + ')' }, gvue);
        var bouches = {};
        Object.keys(V.bouches || {}).forEach(function (n) {
          var dv = premier(REMPLACE_VISAGE[vue], V.bouches[n] || {});
          if (!dv) return;
          var b = el('g', { 'data-bouche-nom': n }, gb);
          b.innerHTML = V.bouches[n][dv];
          b.style.display = 'none';
          bouches[n] = b;
        });
        parVue[vue] = { g: gvue, yeux: yeux, sourcils: sourcils, bouches: bouches, centre: centre, actuelle: null };
      });
      return { parVue: parVue, vue: undefined };
    }

    function construirePiece(partie, nom) {
      var p = dessin.pieces || {};
      var dessins = p[nom] || p[nom.replace(/Arriere$/, 'Avant')] || null;
      var acc = accessoires.filter(function (a) { return a.os === nom; });
      var visage = nom === 'tete' && dessin.visage;
      // Les mains existent toujours (même vides) : on y accroche les objets tenus.
      if (!dessins && !acc.length && !visage && !/^main/.test(nom)) return;
      var gp = el('g', { 'data-piece': nom }, partie);
      var piece = { g: gp, vues: {}, actuelle: null, accessoires: [], visage: null };
      acc.filter(function (a) { return !a.devant; }).forEach(function (a) { piece.accessoires.push(accessoire(gp, a)); });
      piece.vues = construireVues(gp, dessins);
      if (visage) piece.visage = construireVisage(gp);
      acc.filter(function (a) { return a.devant; }).forEach(function (a) { piece.accessoires.push(accessoire(gp, a)); });
      pieces[nom] = piece;
    }

    CHAINES.forEach(function (c) {
      var partie = el('g', { 'data-partie': c[0] }, racineG);
      parties[c[0]] = partie;
      c[1].forEach(function (nom) { construirePiece(partie, nom); });
    });
    g.osEnPlus.forEach(function (o) {
      var partie = el('g', { 'data-partie': o.nom }, racineG);
      parties[o.nom] = partie;
      construirePiece(partie, o.nom);
    });

    function montrer(objet, vue) {
      var choix = premier(REMPLACE[vue], objet.vues);
      if (objet.actuelle === choix) return;
      Object.keys(objet.vues).forEach(function (v) { objet.vues[v].style.display = v === choix ? '' : 'none'; });
      objet.actuelle = choix;
    }
    function placer(piece, angle, transform) {
      var vue = vueDe(angle);
      montrer(piece, vue);
      piece.accessoires.forEach(function (a) { montrer(a, vue); });
      piece.g.setAttribute('transform', transform(miroirDe(vue, angle)));
      return vue;
    }
    function os(nom, A, B, L, angle) {
      var piece = pieces[nom];
      if (!piece || !A || !B) return;
      var dx = B[0] - A[0], dy = B[1] - A[1];
      var th = -Math.atan2(dx, dy) / DEG, l = Math.max(RACCOURCI_MIN, Math.hypot(dx, dy) / L);
      placer(piece, angle, function (m) { return 'translate(' + r2(A[0]) + ' ' + r2(A[1]) + ') rotate(' + r2(th) + ') scale(' + m + ' ' + r2(l) + ')'; });
    }

    function rendreVisage(v, vueTete, p) {
      var choix = vueTete === 'dos' || vueTete === 'troisQuartsDos' ? null : premier(REMPLACE_VISAGE[vueTete], v.parVue);
      if (v.vue !== choix) {
        Object.keys(v.parVue).forEach(function (k) { v.parVue[k].g.style.display = k === choix ? '' : 'none'; });
        v.vue = choix;
      }
      if (!choix) return;
      var pv = v.parVue[choix], oeil = dessin.visage.oeil || {};
      var course = oeil.course || 4, hauteur = oeil.hauteur || 24;
      var borne = function (x) { return Math.max(-1, Math.min(1, x)); };
      pv.yeux.forEach(function (e) {
        e.g.setAttribute('transform', 'translate(' + r2(e.pos[0]) + ' ' + r2(e.pos[1] + p.yeuxY) + ') scale(' + r2(p.tailleYeux) + ')');
        e.pupille.setAttribute('transform', 'translate(' + r2(borne(p.regardX / 6) * course) + ' ' + r2(borne(p.regardY / 7) * course) + ') scale(' + r2(p.taillePupilles) + ')');
        e.paupiere.setAttribute('transform', 'translate(0 ' + r2(-Math.max(0, Math.min(1, p.paupieres)) * hauteur) + ')');
      });
      pv.sourcils.forEach(function (s) {
        var sens = s.pos[0] <= pv.centre ? 1 : -1;
        s.g.setAttribute('transform', 'translate(' + r2(s.pos[0]) + ' ' + r2(s.pos[1] + p.yeuxY - p.sourcilsY) + ') rotate(' + r2(sens * p.sourcilsAngle) + ')');
      });
      var nom = boucheDe(typeof p.bouche === 'string' ? p.bouche : 'neutre', Object.keys(pv.bouches));
      if (pv.actuelle !== nom) {
        Object.keys(pv.bouches).forEach(function (n) { pv.bouches[n].style.display = n === nom ? '' : 'none'; });
        pv.actuelle = nom;
      }
    }

    function rendre(r) {
      var A = r.articulations, p = r.efficace;
      var aCorps = p.vue, aTorse = p.vue + p.torseRot, aTete = p.vue + p.teteTourne;
      ['Avant', 'Arriere'].forEach(function (s) {
        os('cuisse' + s, A['hanche' + s], A['genou' + s], g.cuisse, aCorps);
        os('tibia' + s, A['genou' + s], A['cheville' + s], g.tibia, aCorps);
        os('bras' + s, A['epaule' + s], A['coude' + s], g.bras, aCorps);
        os('avantBras' + s, A['coude' + s], A['main' + s], g.avantBras, aCorps);
        var main = pieces['main' + s];
        if (main) {
          var c = A['coude' + s], h = A['main' + s];
          var thm = -Math.atan2(h[0] - c[0], h[1] - c[1]) / DEG;
          placer(main, aCorps, function (m) { return 'translate(' + r2(h[0]) + ' ' + r2(h[1]) + ') rotate(' + r2(thm) + ') scale(' + m + ' 1)'; });
        }
        var pied = pieces['pied' + s];
        if (pied) {
          var a = A['cheville' + s], b = A['orteil' + s];
          var thp = Math.atan2(b[1] - a[1], b[0] - a[0]) / DEG, lp = Math.hypot(b[0] - a[0], b[1] - a[1]) / g.pied;
          var vuePied = vueDe(aCorps);
          placer(pied, aCorps, function (m) {
            // De face ou de dos, le pied pointe vers la caméra : dessin de face, à plat, sans rotation.
            if (vuePied === 'face' || vuePied === 'dos') return 'translate(' + r2(a[0]) + ' ' + r2(a[1]) + ') scale(1 1)';
            return 'translate(' + r2(a[0]) + ' ' + r2(a[1]) + ') rotate(' + r2(m < 0 ? thp + 180 : thp) + ') scale(' + r2(m * Math.max(RACCOURCI_MIN, lp)) + ' 1)';
          });
        }
      });
      var torse = pieces.torse;
      if (torse) {
        var B = A.bassin, C = A.cou;
        var tht = -Math.atan2(B[0] - C[0], B[1] - C[1]) / DEG, lt = Math.hypot(B[0] - C[0], B[1] - C[1]) / g.colonne;
        placer(torse, aTorse, function (m) { return 'translate(' + r2(B[0]) + ' ' + r2(B[1]) + ') rotate(' + r2(tht) + ') scale(' + m + ' ' + r2(lt) + ')'; });
      }
      if (pieces.bassin) {
        placer(pieces.bassin, aCorps, function (m) { return 'translate(' + r2(A.bassin[0]) + ' ' + r2(A.bassin[1]) + ') rotate(' + r2(p.bassinRot * Math.cos(p.vue * DEG)) + ') scale(' + m + ' 1)'; });
      }
      var tete = pieces.tete;
      if (tete) {
        var ct = A.centreTete;
        var vueTete = placer(tete, aTete, function (m) { return 'translate(' + r2(ct[0]) + ' ' + r2(ct[1]) + ') rotate(' + r2(r.tete.roulis) + ') scale(' + m + ' 1)'; });
        if (tete.visage) rendreVisage(tete.visage, vueTete, p);
      }
      g.osEnPlus.forEach(function (o) { os(o.nom, A[o.nom], A[o.nom + 'Bout'], o.longueur, o.parent === 'tete' ? aTete : o.parent === 'torse' ? aTorse : aCorps); });
      Object.keys(parties).forEach(function (n) {
        if (n === 'colonne' || n === 'tete') return;
        var loin = r.profondeurs[n] < SEUIL_LOIN;
        parties[n].classList.toggle('pm-perso-loin', loin);
        if (couleurs.dos && loin) parties[n].style.setProperty('--teinte-loin', 'var(--dos)');
        else parties[n].style.removeProperty('--teinte-loin');
      });
      var sig = r.ordre.join();
      if (sig !== signature) { r.ordre.forEach(function (n) { if (parties[n]) racineG.appendChild(parties[n]); }); signature = sig; }
      racineG.setAttribute('transform', 'translate(' + r2(p.x) + ' ' + r2(p.y) + ') scale(' + r2(p.echelle) + ')');
    }

    return { groupe: groupe, rendre: rendre, main: function (cote) { var m = pieces['main' + (cote || 'Avant')]; return m ? m.g : null; } };
  }

  return { creer: creer, vueDe: vueDe, boucheDe: boucheDe };
});
