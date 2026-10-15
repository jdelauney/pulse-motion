/* Pulse Motion – habillage « bâtonnets » des personnages (famille LemStick), dans la page.
 *
 *   var perso = M.batonnets.creer(groupeSvg, { couleurs: { corps: '#F5F5F5' }, epaisseur: 14 });
 *   perso.rendre(M.squelette.calculer(pose, gabarit, contexte));
 *   perso.main('Avant')   // <g> au bout de l'avant-bras, pour un accessoire
 *
 * Traits pour les membres, ellipse pour la tête, yeux ramenés vers la caméra (triche cartoon) pour rester lisibles
 * de profil, touffe de six mèches ; chaînes réordonnées selon la profondeur, chaînes éloignées teintées
 * (--pm-perso-dos). Yeux et touffe suivent la taille de la tête (tete.rx / 34). Le groupe porte data-decor.
 */
(function (racine, fabrique) {
  var api = fabrique();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { racine.M = racine.M || {}; racine.M.batonnets = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var DEG = Math.PI / 180;
  var SEUIL_LOIN = -6;
  var OEIL_R = 30, OEIL_ECART = 26, OEIL_TRICHE = 32;
  var MECHES = [[1, -60, 24], [6, 58, 23], [2, -36, 32], [5, 34, 30], [3, -13, 36], [4, 11, 34]];

  var CSS = [
    '.pm-perso{--pm-perso-corps:#F5F5F5;--pm-perso-dos:#C9C2D3;--pm-perso-oeil:#FFFFFF;--pm-perso-oeil-trait:#17151C;--pm-perso-pupille:#0B0A0E;--pm-perso-touffe:#63D13E;--pm-perso-touffe-trait:#2A7A22;--pm-perso-epaisseur:14}',
    '.pm-perso .pm-perso-membre{fill:none;stroke:var(--pm-perso-corps);stroke-width:var(--pm-perso-epaisseur);stroke-linecap:round;stroke-linejoin:round}',
    '.pm-perso .pm-perso-loin .pm-perso-membre{stroke:var(--pm-perso-dos)}',
    '.pm-perso .pm-perso-colonne{stroke-width:calc(var(--pm-perso-epaisseur) * 1.15)}',
    '.pm-perso .pm-perso-tete{fill:var(--pm-perso-corps)}',
    '.pm-perso .pm-perso-oeil{fill:var(--pm-perso-oeil);stroke:var(--pm-perso-oeil-trait);stroke-width:3}',
    '.pm-perso .pm-perso-pupille{fill:var(--pm-perso-pupille)}',
    '.pm-perso .pm-perso-reflet{fill:#FFFFFF}',
    '.pm-perso .pm-perso-touffe{fill:var(--pm-perso-touffe);stroke:var(--pm-perso-touffe-trait);stroke-width:2.5;stroke-linejoin:round}'
  ].join('\n');
  var VARIABLES = { corps: '--pm-perso-corps', dos: '--pm-perso-dos', oeil: '--pm-perso-oeil', oeilTrait: '--pm-perso-oeil-trait',
    pupille: '--pm-perso-pupille', touffe: '--pm-perso-touffe', touffeTrait: '--pm-perso-touffe-trait' };

  function trait(nom, classe) { return '<line class="pm-perso-membre' + (classe ? ' ' + classe : '') + '" data-os="' + nom + '"/>'; }
  function oeil(s) {
    return '<g data-oeil="' + s + '"><ellipse class="pm-perso-oeil"/><g data-pupille><circle class="pm-perso-pupille" r="6"/>' +
      '<circle class="pm-perso-reflet" cx="-2" cy="-2.5" r="1.8"/></g></g>';
  }
  function meche(m) {
    var h = m[2];
    return '<g data-meche="' + m[0] + '" data-base="' + m[1] + '"><path class="pm-perso-touffe" d="M -8 6 C -7 ' + (-h * 0.35) + ' -4 ' + (-h * 0.72) +
      ' 2 ' + (-h) + ' C 4 ' + (-h * 0.7) + ' 7 ' + (-h * 0.35) + ' 8 6 Z"/></g>';
  }
  var BALISAGE = '<g data-pm-perso-racine>' +
    '<g data-partie="jambeArriere">' + trait('cuisseArriere') + trait('tibiaArriere') + trait('piedArriere') + '</g>' +
    '<g data-partie="brasArriere">' + trait('brasArriere') + trait('avantBrasArriere') + '<g data-main="Arriere"></g></g>' +
    '<g data-partie="colonne">' + trait('colonne', 'pm-perso-colonne') + '</g>' +
    '<g data-partie="tete"><g data-place="yeuxDerriere"></g><ellipse class="pm-perso-tete"/>' +
    '<g data-touffe>' + MECHES.map(meche).join('') + '<ellipse class="pm-perso-touffe" cx="0" cy="3" rx="21" ry="9"/></g>' +
    '<g data-place="yeuxDevant">' + oeil('Arriere') + oeil('Avant') + '</g></g>' +
    '<g data-partie="brasAvant">' + trait('brasAvant') + trait('avantBrasAvant') + '<g data-main="Avant"></g></g>' +
    '<g data-partie="jambeAvant">' + trait('cuisseAvant') + trait('tibiaAvant') + trait('piedAvant') + '</g>' +
    '</g>';

  function r2(v) { return Math.round(v * 100) / 100; }

  function creer(groupe, apparence) {
    var svg = groupe.ownerSVGElement || groupe;
    if (!svg.querySelector('style[data-pm-perso]')) {
      var st = document.createElementNS(NS, 'style');
      st.setAttribute('data-pm-perso', '');
      st.textContent = CSS;
      svg.insertBefore(st, svg.firstChild);
    }
    groupe.classList.add('pm-perso');
    groupe.setAttribute('data-decor', '');
    var a = apparence || {};
    Object.keys(a.couleurs || {}).forEach(function (k) { if (VARIABLES[k]) groupe.style.setProperty(VARIABLES[k], a.couleurs[k]); });
    if (a.epaisseur !== undefined) groupe.style.setProperty('--pm-perso-epaisseur', String(a.epaisseur));
    groupe.insertAdjacentHTML('beforeend', BALISAGE);

    var q = function (s) { return groupe.querySelector(s); };
    var racine = q('[data-pm-perso-racine]');
    var parties = {};
    Array.prototype.forEach.call(racine.children, function (e) { parties[e.getAttribute('data-partie')] = e; });
    var traits = {};
    Array.prototype.forEach.call(groupe.querySelectorAll('line[data-os]'), function (l) { traits[l.getAttribute('data-os')] = l; });
    var mains = { Avant: q('[data-main="Avant"]'), Arriere: q('[data-main="Arriere"]') };
    var tete = q('.pm-perso-tete');
    var touffe = q('[data-touffe]');
    var meches = [1, 2, 3, 4, 5, 6].map(function (i) { var e = q('[data-meche="' + i + '"]'); return { e: e, base: +e.getAttribute('data-base') }; });
    var devant = q('[data-place="yeuxDevant"]'), derriere = q('[data-place="yeuxDerriere"]');
    var yeux = ['Avant', 'Arriere'].map(function (s) {
      var g = q('[data-oeil="' + s + '"]');
      return { s: s, cote: s === 'Avant' ? 1 : -1, g: g, el: g.querySelector('ellipse'), pupille: g.querySelector('[data-pupille]') };
    });
    var osEnPlus = {};
    var signature = '';

    function ligne(el, A, B) {
      el.setAttribute('x1', r2(A[0])); el.setAttribute('y1', r2(A[1]));
      el.setAttribute('x2', r2(B[0])); el.setAttribute('y2', r2(B[1]));
    }

    function rendreOs(r) {
      var presents = r.os || {};
      Object.keys(osEnPlus).forEach(function (nom) {
        if (!presents[nom]) { osEnPlus[nom].remove(); delete osEnPlus[nom]; delete parties[nom]; delete traits[nom]; signature = ''; }
      });
      Object.keys(presents).forEach(function (nom) {
        if (!osEnPlus[nom]) {
          var g = document.createElementNS(NS, 'g');
          g.setAttribute('data-partie', nom);
          g.innerHTML = trait(nom);
          racine.appendChild(g);
          osEnPlus[nom] = g; parties[nom] = g; traits[nom] = g.firstChild;
          signature = '';
        }
        ligne(traits[nom], presents[nom].base, presents[nom].bout);
      });
    }

    function rendreTete(r, p) {
      var T = r.tete, A = r.articulations;
      var k = T.rx / 34;
      tete.setAttribute('rx', r2(T.rx)); tete.setAttribute('ry', r2(T.ry));
      tete.setAttribute('transform', 'translate(' + r2(T.centre[0]) + ' ' + r2(T.centre[1]) + ') rotate(' + r2(T.roulis) + ')');
      var longHaut = Math.hypot(T.haut[0], T.haut[1]);
      touffe.setAttribute('transform', 'translate(' + r2(A.sommetTete[0]) + ' ' + r2(A.sommetTete[1]) + ') rotate(' + r2(T.roulis + p.touffeRot) +
        ') scale(' + r2(k) + ' ' + r2(k * p.touffeEtire * Math.max(0.35, longHaut)) + ')');
      meches.forEach(function (m, i) { m.e.setAttribute('transform', 'rotate(' + r2(m.base * p.touffeEventail + p.touffeOnde * (i % 2 ? 1 : -1)) + ')'); });

      var fwd = T.avant;
      var triche = OEIL_TRICHE * Math.cos(Math.atan2(fwd[2], fwd[0]));
      var places = yeux.map(function (E) {
        var a = (E.cote * OEIL_ECART + triche) * DEG;
        var pos = T.vers([OEIL_R * k * Math.cos(a), -6 * k + p.yeuxY, OEIL_R * k * Math.sin(a)]);
        var nd = T.direction([Math.cos(a), 0, Math.sin(a)])[2];
        var w = 0.55 + 0.45 * Math.max(0, nd);
        var rx = 13 * k * p.tailleYeux * w, ry = 15 * k * p.tailleYeux * p.paupieres;
        E.el.setAttribute('rx', r2(rx)); E.el.setAttribute('ry', r2(ry));
        E.g.setAttribute('transform', 'translate(' + r2(pos[0]) + ' ' + r2(pos[1]) + ') rotate(' + r2(T.roulis) + ')');
        E.g.style.display = nd < -0.35 ? 'none' : '';
        var px = fwd[0] * 3.5 * k + p.regardX * w, py = fwd[1] * 3.5 * k + p.regardY;
        var sp = k * p.taillePupilles;
        var lim = Math.max(0, Math.min(rx, ry) - 6 * sp), d = Math.hypot(px, py);
        if (d > lim) { px *= lim / d; py *= lim / d; }
        E.pupille.setAttribute('transform', 'translate(' + r2(px) + ' ' + r2(py) + ') scale(' + r2(sp) + ')');
        E.pupille.style.display = p.paupieres < 0.25 ? 'none' : '';
        return { E: E, nd: nd };
      });
      places.sort(function (a, b) { return a.nd - b.nd; }).forEach(function (x) {
        var place = x.nd < 0 ? derriere : devant;
        if (x.E.g.parentNode !== place || place.lastChild !== x.E.g) place.appendChild(x.E.g);
      });
    }

    function rendre(r) {
      var A = r.articulations, p = r.efficace;
      ['Avant', 'Arriere'].forEach(function (s) {
        ligne(traits['cuisse' + s], A['hanche' + s], A['genou' + s]);
        ligne(traits['tibia' + s], A['genou' + s], A['cheville' + s]);
        ligne(traits['pied' + s], A['cheville' + s], A['orteil' + s]);
        ligne(traits['bras' + s], A['epaule' + s], A['coude' + s]);
        ligne(traits['avantBras' + s], A['coude' + s], A['main' + s]);
        var h = A['main' + s], e = A['coude' + s];
        var ang = -Math.atan2(h[0] - e[0], h[1] - e[1]) / DEG;
        mains[s].setAttribute('transform', 'translate(' + r2(h[0]) + ' ' + r2(h[1]) + ') rotate(' + r2(ang) + ')');
      });
      ligne(traits.colonne, A.bassin, A.cou);
      rendreTete(r, p);
      rendreOs(r);
      Object.keys(parties).forEach(function (n) {
        if (n !== 'colonne' && n !== 'tete') parties[n].classList.toggle('pm-perso-loin', r.profondeurs[n] < SEUIL_LOIN);
      });
      var sig = r.ordre.join();
      if (sig !== signature) { r.ordre.forEach(function (n) { if (parties[n]) racine.appendChild(parties[n]); }); signature = sig; }
      racine.setAttribute('transform', 'translate(' + r2(p.x) + ' ' + r2(p.y) + ') scale(' + r2(p.echelle) + ')');
    }

    return { groupe: groupe, rendre: rendre, main: function (cote) { return mains[cote || 'Avant']; } };
  }

  return { creer: creer, CSS: CSS };
});
