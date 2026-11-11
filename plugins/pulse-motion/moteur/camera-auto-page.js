/* Pulse Motion – caméra automatique dans la page (spec S7, 5.8) : un plan par scène dont un conteneur porte
 * data-camera="auto", calculé après le relevé de mise en page (moteur/releve.js) par moteur/camera-auto.js.
 *
 *   <div data-camera="auto; secousse 1 3+0.2"> … </div>     zoom, x et y viennent du plan ; les autres clauses restent
 *   <i data-cadrer="#prix" data-start="mot:cher" data-dur="3"></i>   gros plan demandé sur #prix pendant 3 s (ne dessine rien)
 *
 * M.demarrerCameraAuto() (après M.demarrer et M.demarrerDessin) : repère les caméras automatiques, demande le relevé, calcule
 *   les plans à chaque relevé (M.apresReleve). Avant le relevé, la caméra reste neutre (aperçu : M.seek l'attend toujours).
 * M.cameraAutoA(idScene, t) -> { zoom, x, y } (x, y en % de l'image, t en secondes réelles de la scène) | null.
 * M.plansCamera() -> { idScene: { duree, depart, mouvements: [{ debut, duree, genre, vers }], continue } } (controle.json).
 * M.mesurerCameraAuto({ scenes? }) -> { constats, plans } : règle camera-auto-cadre (conteneur qui ne remplit pas la scène).
 * Plan d'une scène : éléments du relevé en secondes réelles, allure (M.donnees.allure), fin de la voix, vue à 7 % des bords,
 * zone utile hors bande des sous-titres (M.bandeSousTitres) et zones de la plateforme (--pm-zone-*), ou, en 9:16 sans
 * plateforme, hors zones des boutons de moteur/mesures.js. Continuité : scène précédente filmée elle aussi, transition autre
 * que coupe, au moins deux éléments à la même place au début de celle-ci que dans la dernière image de la précédente : elle
 * part du dernier plan de la précédente et le tient pendant la transition. Navigateur seulement ; dépend de horloge, releve,
 * camera, camera-auto (global M).
 */
(function (racine) {
  'use strict';
  var M = racine.M = racine.M || {};
  var etat = { scenes: {}, plans: {}, constats: [], vus: {} };

  function lireAuto(el) {
    try { var c = M.analyserCamera(el.getAttribute('data-camera'), M.dureeTemps); return !!c.auto; } catch (e) { return false; }
  }

  function signaler(id, regle, valeur) {
    var cle = regle + '|' + id;
    if (etat.vus[cle]) return;
    etat.vus[cle] = true;
    etat.constats.push({ regle: regle, scene: id, element: null, instant: null, valeur: valeur });
    var texte = 'Scène « ' + id + ' » : ' + valeur;
    if (M.erreurs) M.erreurs.push({ regle: regle, scene: id, message: texte });
    console.warn('[Pulse Motion] ' + texte);
  }

  function nombre(v) { var n = parseFloat(v); return isFinite(n) ? n : 0; }

  /** Part de l'image laissée libre (cqh) : sous-titres, zones de la plateforme, ou zones des boutons en 9:16. */
  function zoneUtile(cadre) {
    var u = { x0: 0, y0: 0, x1: cadre.L, y1: cadre.H };
    var scene = document.getElementById('pm-scene');
    var cs = scene ? getComputedStyle(scene) : null;
    var plateforme = M.donnees && M.donnees.format && M.donnees.format.plateforme;
    var ratio = (M.donnees && M.donnees.format && M.donnees.format.ratio) || '16:9';
    if (plateforme && cs) {
      u.y0 = nombre(cs.getPropertyValue('--pm-zone-haut'));
      u.y1 = cadre.H - nombre(cs.getPropertyValue('--pm-zone-bas'));
      u.x0 = nombre(cs.getPropertyValue('--pm-zone-gauche')) * cadre.L / 100;
      u.x1 = cadre.L - nombre(cs.getPropertyValue('--pm-zone-droite')) * cadre.L / 100;
    } else if (ratio === '9:16') {
      // Zones des boutons connues du contrôle (moteur/mesures.js : zoneHaut 0,07, zoneBas 0,2, zoneDroite 0,11).
      u.y0 = 7; u.y1 = 80; u.x1 = cadre.L * 0.89;
    }
    var bande = M.bandeSousTitres ? M.bandeSousTitres() : null;
    if (bande) {
      if (bande.haut > 0) u.y1 = Math.min(u.y1, bande.haut);
      else u.y0 = Math.max(u.y0, bande.bas);
    }
    return u;
  }

  function remplit(el, sec) {
    var ok = true;
    M.avecSceneNeutre(sec, function (cadre) {
      var r = el.getBoundingClientRect();
      var tol = 0.01 * Math.max(cadre.width, cadre.height);
      ok = Math.abs(r.left - cadre.left) <= tol && Math.abs(r.top - cadre.top) <= tol && Math.abs(r.width - cadre.width) <= tol && Math.abs(r.height - cadre.height) <= tol;
    });
    return ok;
  }

  function calculer(releves) {
    var CA = M.cameraAuto;
    etat.plans = {};
    var precedent = null;
    var allure = M.donnees && Number(M.donnees.allure) > 0 ? Number(M.donnees.allure) : 1;
    M.minutage.scenes.forEach(function (info, i) {
      var sc = etat.scenes[info.id];
      var releve = releves && releves[info.id];
      if (!sc || !releve) { precedent = null; return; }
      if (!remplit(sc.el, sc.sec)) {
        signaler(info.id, 'camera-auto-cadre', 'data-camera="auto" se pose sur un conteneur qui remplit toute la scène (position: absolute; inset: 0) : celui-ci n\'en couvre qu\'une partie, la caméra automatique ne le filme pas.');
        precedent = null;
        return;
      }
      var cadre = { L: releve.largeur, H: 100 };
      var vue = CA.vueDe(cadre);
      var utile = zoneUtile(cadre);
      var elements = CA.depuisReleve(releve, { rythme: info.rythme });
      var duree = info.fin - info.debut;
      var donnee = M.donnees.scenes[i] || {};
      var finVoix = donnee.voix && donnee.voix.duree > 0 ? (donnee.voix.debut || 0) + donnee.voix.duree : null;
      var transition = typeof info.transition === 'string' ? info.transition : 'fondu';
      var lie = !!(precedent && transition !== 'coupe' && transition !== 'aucune' && info.entree > 0
        && CA.continuite(precedent.elements, elements, CA.rectCadre(CA.cameraA(precedent.plan, precedent.plan.duree), vue, cadre), cadre));
      var depart = lie ? CA.cameraA(precedent.plan, precedent.plan.duree) : null;
      var plan = CA.planifierCamera(elements, { duree: duree, vue: vue, cadre: cadre, allure: allure, finVoix: finVoix, depart: depart,
        immobile: lie ? Math.min(info.entree, duree * 0.5) : 0, utile: utile });
      if (!plan) { precedent = null; return; }
      plan.continue = lie;
      plan.utile = utile;
      etat.plans[info.id] = plan;
      precedent = { plan: plan, elements: elements };
    });
  }

  M.demarrerCameraAuto = function () {
    if (!M.minutage || !M.cameraAuto || !M.demarrerReleve) return;
    var secs = {};
    document.querySelectorAll('#pm-scene > section[data-scene]').forEach(function (s) { secs[s.getAttribute('data-scene')] = s; });
    M.minutage.scenes.forEach(function (info) {
      var sec = secs[info.id];
      if (!sec) return;
      var el = Array.prototype.filter.call(sec.querySelectorAll('[data-camera]'), lireAuto)[0];
      if (el) etat.scenes[info.id] = { el: el, sec: sec };
    });
    if (!Object.keys(etat.scenes).length) return;
    M.apresReleve(calculer);
    M.demarrerReleve();
  };

  M.cameraAutoA = function (id, t) {
    var plan = etat.plans[id];
    if (!plan) return null;
    return M.cameraAuto.versCamera(M.cameraAuto.cameraA(plan, Math.max(0, Math.min(plan.duree, t))), plan.cadre);
  };

  function r3(x) { return Math.round(x * 1000) / 1000; }
  M.plansCamera = function (o) {
    var scenes = o && o.scenes;
    var r = {};
    Object.keys(etat.plans).forEach(function (id) {
      if (scenes && scenes.indexOf(id) < 0) return;
      var p = etat.plans[id], V = M.cameraAuto.versCamera;
      var u = p.utile;
      r[id] = { duree: r3(p.duree), continue: !!p.continue, depart: V(p.depart, p.cadre),
        utile: { x0: r3(u.x0), y0: r3(u.y0), x1: r3(u.x1), y1: r3(u.y1) },
        mouvements: p.mouvements.map(function (m) { return { debut: r3(m.debut), duree: r3(m.duree), genre: m.genre, vers: V(m.vers, p.cadre) }; }) };
    });
    return r;
  };
  M.mesurerCameraAuto = function (o) {
    var scenes = o && o.scenes;
    return { constats: etat.constats.filter(function (c) { return !scenes || scenes.indexOf(c.scene) >= 0; }), plans: M.plansCamera(o) };
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
