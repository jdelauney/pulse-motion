/* Facturo – application de démonstration de Pulse Motion (spec S6, 5.17). Tout est faux et reste sur l'ordinateur : aucune
 * donnée n'est envoyée. Servie par Pulse Motion (« appli-essai »), une attente passe par une requête lente sur 127.0.0.1
 * (/api/attente) ; ouverte en fichier, par une minuterie. */
(function () {
  'use strict';

  function attendre(ms) {
    if (/^https?:$/.test(location.protocol)) return fetch('/api/attente?ms=' + ms).then(function (r) { return r.json(); });
    return new Promise(function (ok) { setTimeout(ok, ms); });
  }

  function toast(texte) {
    var t = document.createElement('div');
    t.className = 'toast';
    t.setAttribute('role', 'status');
    t.textContent = texte;
    document.body.appendChild(t);
  }

  // Connexion factice : aucun contrôle ; un cookie de session (effacé à la fermeture du navigateur) ouvre « Mon compte ».
  var connexion = document.getElementById('connexion');
  if (connexion) {
    connexion.addEventListener('submit', function (e) {
      e.preventDefault();
      document.cookie = 'facturo-session=1; path=/; SameSite=Lax';
      location.href = 'factures.html';
    });
  }

  // Liste des factures : « Actualiser » attend une réponse lente, puis la liste est à jour.
  var actualiser = document.getElementById('actualiser');
  if (actualiser) {
    actualiser.addEventListener('click', function () {
      var etat = document.getElementById('etat-liste');
      etat.innerHTML = '<span class="attente-roue"></span> Mise à jour…';
      attendre(1500).then(function () { etat.textContent = 'Liste à jour'; });
    });
  }

  // Nouvelle facture : la fenêtre de confirmation, puis l'enregistrement (lent), puis le message.
  var formulaire = document.getElementById('facture');
  if (formulaire) {
    var fenetre = document.getElementById('confirmer');
    var total = document.getElementById('total-facture');
    var calculer = function () {
      var montant = parseFloat(document.getElementById('montant').value || '0') || 0;
      var remise = parseFloat(document.getElementById('remise').value || '0') || 0;
      total.textContent = (montant * (1 - remise / 100)).toFixed(2).replace('.', ',') + ' €';
    };
    formulaire.addEventListener('input', calculer);
    formulaire.addEventListener('change', calculer);
    formulaire.addEventListener('submit', function (e) {
      e.preventDefault();
      fenetre.showModal();
    });
    document.getElementById('confirmer-oui').addEventListener('click', function () {
      fenetre.close();
      var etat = document.getElementById('etat-facture');
      etat.innerHTML = '<span class="attente-roue"></span> Enregistrement…';
      attendre(1200).then(function () { etat.textContent = ''; toast('Facture enregistrée'); });
    });
    document.getElementById('confirmer-non').addEventListener('click', function () { fenetre.close(); });
    document.getElementById('brouillon').addEventListener('click', function () {
      if (window.confirm('Supprimer le brouillon de cette facture ?')) formulaire.reset();
      calculer();
    });
    calculer();
  }
})();
