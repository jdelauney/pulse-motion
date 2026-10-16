/* Pulse Motion – interactions d'un personnage (dans la page) : atteindre une cible avec la main, regarder une cible.
 *
 *   <i data-action="atteindre" data-main="avant" data-cible="#lettre-n" data-point="50% 0%" data-start="2" data-dur="1"></i>
 *   <i data-action="atteindre" data-cible="#n2" data-niveau="haut" …></i>        rencontre si #n2 vise aussi celui-ci
 *   <i data-action="regarder" data-cible="#pancarte" data-start="1"></i>          jusqu'au prochain « regarder »
 *
 * M.interactions.appliquer(p, t, pose, ctx) modifie la pose (unités de la scène : pose.x, pose.y, pose.echelle) :
 * - atteindre : bras amenés sur la cible par l'IK du squelette (S.atteindre), fondu de 0,25 s à l'entrée et à la sortie ;
 *   cible = un élément (son point data-point, centre par défaut), un point « x% y% » de l'image, ou un personnage (sa main ;
 *   s'il vise aussi celui-ci au même moment : point de rencontre entre leurs épaules, à la hauteur data-niveau) ;
 * - regarder : pupilles et tête vers la cible (élément, point, personnage : sa tête, « camera »), « aucune » : regard libre.
 * ctx = { persos, W, H, placerBase(q, t) } ; une cible personnage est lue sur sa pose sans interactions (pas de boucle).
 */
(function (racine) {
  'use strict';
  var M = racine.M = racine.M || {};
  var FONDU = 0.25, DEG = Math.PI / 180;
  var NIVEAUX = { haut: -0.6, epaule: 0.15, bas: 0.6 };

  function lisse(k) { k = Math.max(0, Math.min(1, k)); return k * k * (3 - 2 * k); }
  function poids(a, t) {
    if (!(t >= a.debut && t < a.fin)) return 0;
    return lisse(Math.min((t - a.debut) / FONDU, a.fin === Infinity ? 1 : (a.fin - t) / FONDU, 1));
  }
  function lirePoint(texte, defaut) {
    var m = /^\s*(-?\d*\.?\d+)%\s+(-?\d*\.?\d+)%\s*$/.exec(texte || '');
    return m ? [Number(m[1]), Number(m[2])] : defaut;
  }
  function echapper(id) { return typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id; }
  function versScene(pose, local) { return { x: pose.x + local[0] * pose.echelle, y: pose.y + local[1] * pose.echelle }; }

  /** Cible d'une action : { x, y } (unités de la scène), { perso }, { camera: true }, ou null. */
  function cible(a, p, ctx) {
    var c = (a.cible || '').trim();
    if (!c || c === 'aucune') return null;
    if (c === 'camera') return { camera: true };
    var pt = lirePoint(c, null);
    if (pt) return { x: pt[0] / 100 * ctx.W, y: pt[1] / 100 * ctx.H };
    var el = null;
    try { el = p.sec.querySelector('#' + echapper(c.replace(/^#/, ''))); } catch (e) { el = null; }
    if (!el) return null;
    var q = ctx.persos.filter(function (x) { return x.div === el; })[0];
    if (q) return q === p ? null : { perso: q };
    // Élément : son point dans le repère du personnage (rectangles à l'écran : caméra et parallaxe comprises).
    var rd = p.div.getBoundingClientRect(), re = el.getBoundingClientRect();
    if (!(rd.width > 0 && rd.height > 0)) return null;
    var pp = lirePoint(a.point, [50, 50]);
    return { x: (re.left + re.width * pp[0] / 100 - rd.left) / rd.width * ctx.W, y: (re.top + re.height * pp[1] / 100 - rd.top) / rd.height * ctx.H };
  }

  function cote(main) { return main === 'arriere' ? 'Arriere' : 'Avant'; }

  function appliquerAtteindre(p, t, pose, ctx, S) {
    p.partition.actions.forEach(function (a) {
      if (a.type !== 'atteindre') return;
      var k = poids(a, t);
      if (k <= 0) return;
      var c = cible(a, p, ctx);
      if (!c || c.camera) return;
      var mains = a.main === 'deux' ? ['Avant', 'Arriere'] : [cote(a.main)];
      var pt = c;
      if (c.perso) {
        var q = c.perso, poseQ = ctx.placerBase(q, t), rQ = S.calculer(poseQ, q.gabarit);
        var retour = q.partition.actions.filter(function (b) {
          return b.type === 'atteindre' && (b.cible || '').trim().replace(/^#/, '') === p.div.id && poids(b, t) > 0;
        })[0];
        if (retour) {
          // Rencontre : les deux mains vont au même point, entre les deux épaules, à la hauteur demandée.
          var rP = S.calculer(pose, p.gabarit), e1 = S.pointDe(rP, 'epaule' + mains[0]), e2 = S.pointDe(rQ, 'epaule' + cote(retour.main === 'deux' ? 'avant' : retour.main));
          var g = S.completerGabarit(p.gabarit), bras = (g.bras + g.avantBras) * pose.echelle;
          var niveau = NIVEAUX[a.niveau] !== undefined ? NIVEAUX[a.niveau] : NIVEAUX.epaule;
          // Hauteur demandée, ramenée à ce que les deux bras atteignent (les mains se rejoignent si la distance le permet).
          var demi = Math.hypot(e1.x - e2.x, e1.y - e2.y) / 2, portee = 0.97 * bras;
          var haut = niveau * bras;
          if (demi * demi + haut * haut > portee * portee) haut = (haut < 0 ? -1 : 1) * Math.sqrt(Math.max(0, portee * portee - demi * demi));
          pt = { x: (e1.x + e2.x) / 2, y: (e1.y + e2.y) / 2 + haut };
        } else {
          pt = S.pointDe(rQ, 'mainAvant');
        }
      }
      mains.forEach(function (s) {
        var res = S.atteindre(pose, p.gabarit, 'main' + s, [(pt.x - pose.x) / pose.echelle, (pt.y - pose.y) / pose.echelle]);
        if (!res) return; // vue de face : pas d'IK
        ['bras' + s, 'avantBras' + s].forEach(function (os) {
          if (typeof res[os] === 'number') pose[os] = (pose[os] || 0) + (res[os] - (pose[os] || 0)) * k;
        });
      });
    });
  }

  function appliquerRegard(p, t, pose, ctx, S) {
    p.partition.actions.forEach(function (a) {
      if (a.type !== 'regarder') return;
      var k = poids(a, t);
      if (k <= 0) return;
      var c = cible(a, p, ctx);
      var voulu;
      if (!c) return;
      if (c.camera) voulu = { regardX: 0, regardY: 0, tete: 0, teteTourne: 40 };
      else {
        var pt = c;
        if (c.perso) {
          var rQ = S.calculer(ctx.placerBase(c.perso, t), c.perso.gabarit);
          pt = versScene(rQ.efficace, rQ.tete.centre);
        }
        var rP = S.calculer(pose, p.gabarit), tete = versScene(rP.efficace, rP.tete.centre);
        var dx = pt.x - tete.x, dy = pt.y - tete.y, d = Math.hypot(dx, dy);
        if (d < 1e-6) return;
        var cv = Math.cos((pose.vue || 0) * DEG), sens = Math.abs(cv) < 0.25 ? 1 : (cv > 0 ? 1 : -1);
        var ux = dx / d * sens, uy = dy / d;
        voulu = { regardX: 6 * ux, regardY: 7 * uy, tete: Math.max(-25, Math.min(25, uy * 25)) };
      }
      Object.keys(voulu).forEach(function (cle) { pose[cle] = (pose[cle] || 0) + (voulu[cle] - (pose[cle] || 0)) * k; });
    });
  }

  M.interactions = {
    FONDU: FONDU,
    poids: poids,
    /** Durées : un « regarder » sans data-dur dure jusqu'au suivant. */
    preparer: function (actions) {
      var regards = actions.filter(function (a) { return a.type === 'regarder'; }).sort(function (x, y) { return x.debut - y.debut; });
      regards.forEach(function (a, i) { if (a.jusquAuSuivant) a.fin = i + 1 < regards.length ? regards[i + 1].debut + FONDU : Infinity; });
    },
    appliquer: function (p, t, pose, ctx) {
      var S = M.squelette;
      if (!p.partition.actions.some(function (a) { return a.type === 'atteindre' || a.type === 'regarder'; })) return pose;
      appliquerRegard(p, t, pose, ctx, S);
      appliquerAtteindre(p, t, pose, ctx, S);
      return pose;
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
