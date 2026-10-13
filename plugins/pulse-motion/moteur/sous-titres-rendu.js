/* Pulse Motion – sous-titres dessinés dans la vidéo : calque #pm-sous-titres au-dessus des scènes, carton actif à
 * chaque rendu ; mode « mot » : mot en cours mis en valeur (data-etat dit / en-cours / a-venir).
 * Taille, largeur, marge et position par défaut selon le format ; un style les change par --pm-st-taille, --pm-st-largeur, --pm-st-marge,
 * --pm-st-position (et --pm-st-police, --pm-st-texte, --pm-st-fond, --pm-st-accent pour l'habillage).
 * Navigateur seulement ; dépend de horloge (M.donnees, M.surRendu).
 */
(function (racine) {
  'use strict';
  var M = racine.M = racine.M || {};
  var DEFAUTS = {
    // Une ligne pleine (42, 32 ou 28 caractères) tient dans la largeur ; en 9:16, le carton reste à gauche des boutons des réseaux.
    '16:9': { taille: '4.6cqh', bas: '7cqh', haut: '6cqh', largeur: '90%' },
    '9:16': { taille: '2.4cqh', bas: '24cqh', haut: '10cqh', largeur: '78%' },
    '1:1': { taille: '3.3cqh', bas: '8cqh', haut: '7cqh', largeur: '90%' },
    '4:5': { taille: '3.2cqh', bas: '8cqh', haut: '7cqh', largeur: '90%' },
  };

  M.demarrerSousTitres = function () {
    var st = M.donnees && M.donnees.sousTitres;
    if (!st || !st.incrustes || !st.cartons || !st.cartons.length) return;
    var scene = document.getElementById('pm-scene');
    var calque = document.createElement('div');
    calque.id = 'pm-sous-titres';
    calque.setAttribute('aria-hidden', 'true');
    calque.setAttribute('data-mode', st.mode || 'ligne');
    scene.appendChild(calque);
    var cs = getComputedStyle(calque);
    var position = st.position || cs.getPropertyValue('--pm-st-position').trim() || 'bas';
    calque.setAttribute('data-position', position === 'haut' ? 'haut' : 'bas');
    var d = DEFAUTS[(M.donnees.format && M.donnees.format.ratio) || '16:9'] || DEFAUTS['16:9'];
    if (!cs.getPropertyValue('--pm-st-taille').trim()) calque.style.setProperty('--pm-st-taille', d.taille);
    if (!cs.getPropertyValue('--pm-st-largeur').trim()) calque.style.setProperty('--pm-st-largeur', d.largeur);
    if (!cs.getPropertyValue('--pm-st-marge').trim()) calque.style.setProperty('--pm-st-marge', position === 'haut' ? d.haut : d.bas);

    var courant = -1, mots = [];
    function afficher(t) {
      var i = -1;
      for (var k = 0; k < st.cartons.length; k++) { if (t >= st.cartons[k].debut && t < st.cartons[k].fin) { i = k; break; } }
      if (i !== courant) {
        courant = i;
        calque.textContent = '';
        mots = [];
        if (i >= 0) {
          var carton = document.createElement('div');
          carton.className = 'pm-st-carton';
          st.cartons[i].lignes.forEach(function (ligne) {
            var l = document.createElement('span');
            l.className = 'pm-st-ligne';
            l.setAttribute('data-pm-st', '');
            ligne.forEach(function (m, j) {
              if (j) l.appendChild(document.createTextNode(ligne[j - 1].insecable || ' '));
              var s = document.createElement('span');
              s.className = 'pm-st-mot';
              s.textContent = m.w;
              l.appendChild(s);
              mots.push({ el: s, t0: m.t0, t1: m.t1 });
            });
            carton.appendChild(l);
          });
          calque.appendChild(carton);
        }
      }
      mots.forEach(function (m) { m.el.setAttribute('data-etat', t >= m.t1 ? 'dit' : t >= m.t0 ? 'en-cours' : 'a-venir'); });
    }
    M.surRendu(afficher);
    afficher(M.temps());
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
