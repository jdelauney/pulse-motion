/* Pulse Motion – langue de la vidéo (spec S9, 5.1) : source unique des langues que la vidéo peut parler. L'interface (messages,
 * compétences, aperçu, ateliers) reste en français ; seule la vidéo change de langue.
 *
 *   L.lire('en-us')          -> { ok: true, etiquette: 'en-US', principale: 'en' } | { ok: false, message }
 *   L.etiquetteDe(deroule)   -> étiquette normalisée du déroulé (« langue » absente ou invalide : 'fr')
 *   L.de('pt-BR')            -> la langue, réglages de la région compris (typographie de pt-BR…)
 *   L.principale('en-GB')    -> 'en' ; L.nom('en-GB') -> 'anglais' ; L.adjectif('en-GB') -> 'anglaise'
 *   L.lecteur(etiquette)     -> textes de la barre de lecture de la page livrée
 *
 * Pour chaque langue : nom et adjectif (féminin) en français, pour les messages ; locale par défaut (Intl) ; articles et
 * liaisons des sous-titres (formes normalisées comme aligner.normaliserMot : jamais de coupe après un article, coupe
 * conseillée avant une liaison) ; nombres(n) : forme en lettres de 0 à 100, normalisée (ou null : comparaison sur les chiffres
 * seuls) ; caracteres attendus dans une police ; typographie : règles de lib/typographie.js ; repetitions correctes (mots
 * doublés) ; lecteur ; voixMac : voix macOS à essayer dans l'ordre ; espeak : voix d'espeak-ng ; iso6392 : étiquette de la
 * piste son ; source : mot devant la source d'un graphique ; kokoro : voix de la voix de synthèse locale (spec S7, 5.12), française seulement tant que l'auteur n'en a pas
 * validé d'autres (aucune autre voix n'est téléchargée).
 * Sources des règles : Chicago et Oxford (anglais), Duden (allemand), RAE (espagnol), Accademia della Crusca (italien),
 * Taalunie (néerlandais) ; listes écrites pour Pulse Motion.
 *
 * Module pur : chargé tel quel dans la page (global M.langues, groupe « langues » du moteur, seulement si la vidéo déclare sa
 * langue) et par Node (require).
 */
(function (racine, fabrique) {
  var api = fabrique();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { racine.M = racine.M || {}; racine.M.langues = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var LATIN = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  var COMMUNS = '’€%°…';

  function nombresAnglais(n) {
    var u = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen',
      'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
    var d = { 2: 'twenty', 3: 'thirty', 4: 'forty', 5: 'fifty', 6: 'sixty', 7: 'seventy', 8: 'eighty', 9: 'ninety' };
    if (n < 20) return u[n];
    if (n === 100) return 'onehundred';
    return d[Math.floor(n / 10)] + (n % 10 ? u[n % 10] : '');
  }

  function nombresEspagnols(n) {
    var u = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece',
      'catorce', 'quince', 'dieciseis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintidos', 'veintitres',
      'veinticuatro', 'veinticinco', 'veintiseis', 'veintisiete', 'veintiocho', 'veintinueve'];
    var d = { 3: 'treinta', 4: 'cuarenta', 5: 'cincuenta', 6: 'sesenta', 7: 'setenta', 8: 'ochenta', 9: 'noventa' };
    if (n < 30) return u[n];
    if (n === 100) return 'cien';
    return d[Math.floor(n / 10)] + (n % 10 ? 'y' + u[n % 10] : '');
  }

  function nombresAllemands(n) {
    var u = ['null', 'eins', 'zwei', 'drei', 'vier', 'funf', 'sechs', 'sieben', 'acht', 'neun', 'zehn', 'elf', 'zwolf', 'dreizehn',
      'vierzehn', 'funfzehn', 'sechzehn', 'siebzehn', 'achtzehn', 'neunzehn'];
    var d = { 2: 'zwanzig', 3: 'dreissig', 4: 'vierzig', 5: 'funfzig', 6: 'sechzig', 7: 'siebzig', 8: 'achtzig', 9: 'neunzig' };
    if (n < 20) return u[n];
    if (n === 100) return 'hundert';
    var r = n % 10;
    return (r ? (r === 1 ? 'ein' : u[r]) + 'und' : '') + d[Math.floor(n / 10)];
  }

  function nombresItaliens(n) {
    var u = ['zero', 'uno', 'due', 'tre', 'quattro', 'cinque', 'sei', 'sette', 'otto', 'nove', 'dieci', 'undici', 'dodici', 'tredici',
      'quattordici', 'quindici', 'sedici', 'diciassette', 'diciotto', 'diciannove'];
    var d = { 2: 'venti', 3: 'trenta', 4: 'quaranta', 5: 'cinquanta', 6: 'sessanta', 7: 'settanta', 8: 'ottanta', 9: 'novanta' };
    if (n < 20) return u[n];
    if (n === 100) return 'cento';
    var r = n % 10, base = d[Math.floor(n / 10)];
    // « ventuno », « ventotto » : la voyelle finale tombe devant uno et otto.
    if (r === 1 || r === 8) base = base.slice(0, -1);
    return base + (r ? u[r] : '');
  }

  function nombresPortugais(n) {
    var u = ['zero', 'um', 'dois', 'tres', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze',
      'catorze', 'quinze', 'dezasseis', 'dezassete', 'dezoito', 'dezanove'];
    var d = { 2: 'vinte', 3: 'trinta', 4: 'quarenta', 5: 'cinquenta', 6: 'sessenta', 7: 'setenta', 8: 'oitenta', 9: 'noventa' };
    if (n < 20) return u[n];
    if (n === 100) return 'cem';
    return d[Math.floor(n / 10)] + (n % 10 ? 'e' + u[n % 10] : '');
  }

  function nombresNeerlandais(n) {
    var u = ['nul', 'een', 'twee', 'drie', 'vier', 'vijf', 'zes', 'zeven', 'acht', 'negen', 'tien', 'elf', 'twaalf', 'dertien',
      'veertien', 'vijftien', 'zestien', 'zeventien', 'achttien', 'negentien'];
    var d = { 2: 'twintig', 3: 'dertig', 4: 'veertig', 5: 'vijftig', 6: 'zestig', 7: 'zeventig', 8: 'tachtig', 9: 'negentig' };
    if (n < 20) return u[n];
    if (n === 100) return 'honderd';
    var r = n % 10;
    // « eenentwintig », « tweeëntwintig » (le tréma tombe à la normalisation).
    return (r ? u[r] + 'en' : '') + d[Math.floor(n / 10)];
  }

  function borne(f) {
    return function (n) { n = Number(n); return Number.isInteger(n) && n >= 0 && n <= 100 ? f(n) : null; };
  }

  var COMMUNES = ['suspension', 'apostrophe'];
  var LANGUES = {
    fr: {
      nom: 'français', adjectif: 'française', locale: 'fr', regions: ['FR', 'CA', 'BE', 'CH'],
      articles: ['le', 'la', 'les', 'l', 'un', 'une', 'des', 'du', 'de', 'd', 'au', 'aux', 'ce', 'cet', 'cette', 'ces',
        'mon', 'ma', 'mes', 'ton', 'ta', 'tes', 'son', 'sa', 'ses', 'notre', 'nos', 'votre', 'vos', 'leur', 'leurs', 'a', 'en'],
      liaisons: ['et', 'ou', 'mais', 'donc', 'car', 'ni', 'qui', 'que', 'quand', 'pour', 'avec', 'sans', 'parce', 'puis', 'comme', 'si', 'dont'],
      // Les nombres français en lettres (jusqu'au milliard) sont ceux de moteur/aligner.js.
      nombres: null,
      caracteres: LATIN + 'éèêëàâäîïôöùûüÿçœæÉÈÊÀÇŒ«»' + COMMUNS,
      typographie: COMMUNES.concat(['guillemets-francais', 'espace-guillemets', 'espace-fine', 'espace-deux-points', 'unite-fine']),
      repetitions: ['nous', 'vous', 'très', 'si', 'bla', 'non', 'oui'],
      lecteur: { lecture: 'Lecture', pause: 'Pause', position: 'Position', lire: 'Lire la vidéo', scene: 'Scène', boucle: 'boucle',
        preparation: 'son en préparation', bloque: 'son bloqué par le navigateur : cliquez pour l\'entendre', echec: 'Le son n\'a pas pu être préparé.' },
      voixMac: ['Thomas', 'Amélie'], espeak: 'fr', iso6392: 'fra', kokoro: ['ff_siwis'], source: 'Source\u00a0: ',
    },
    en: {
      nom: 'anglais', adjectif: 'anglaise', locale: 'en-GB', regions: ['GB', 'US'],
      articles: ['the', 'a', 'an', 'this', 'that', 'these', 'those', 'my', 'your', 'his', 'her', 'its', 'our', 'their', 'of', 'to', 'in',
        'on', 'at', 'for', 'by', 'with', 'from', 'into', 'no', 'every', 'each', 'some', 'any'],
      liaisons: ['and', 'or', 'but', 'so', 'because', 'which', 'who', 'when', 'while', 'if', 'then', 'where', 'although', 'unless', 'until', 'since'],
      nombres: borne(nombresAnglais),
      caracteres: LATIN + '“”‘' + COMMUNS,
      typographie: COMMUNES.concat(['guillemets-anglais', 'sans-espace-ponctuation', 'unite-insecable-sauf-pourcent']),
      repetitions: ['that', 'had'],
      lecteur: { lecture: 'Play', pause: 'Pause', position: 'Position', lire: 'Play the video', scene: 'Scene', boucle: 'loop',
        preparation: 'preparing the sound', bloque: 'sound blocked by the browser: click to hear it', echec: 'The sound could not be prepared.' },
      voixMac: ['Daniel', 'Samantha'], espeak: 'en', iso6392: 'eng', kokoro: [], source: 'Source: ',
    },
    es: {
      nom: 'espagnol', adjectif: 'espagnole', locale: 'es', regions: ['ES', 'MX'],
      articles: ['el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'lo', 'al', 'del', 'este', 'esta', 'estos', 'estas', 'ese', 'esa',
        'mi', 'mis', 'tu', 'tus', 'su', 'sus', 'nuestro', 'nuestra', 'de', 'a', 'en', 'con', 'por', 'para', 'sin', 'sobre'],
      liaisons: ['y', 'e', 'o', 'u', 'pero', 'porque', 'que', 'cuando', 'si', 'como', 'aunque', 'mientras', 'donde', 'pues', 'sino', 'ni'],
      nombres: borne(nombresEspagnols),
      caracteres: LATIN + 'ñÑáéíóúüÁÉÍÓÚ¿¡«»' + COMMUNS,
      typographie: COMMUNES.concat(['guillemets-chevrons', 'sans-espace-ponctuation', 'unite-insecable']),
      repetitions: [],
      lecteur: { lecture: 'Reproducir', pause: 'Pausa', position: 'Posición', lire: 'Ver el vídeo', scene: 'Escena', boucle: 'bucle',
        preparation: 'preparando el sonido', bloque: 'sonido bloqueado por el navegador: haga clic para oírlo', echec: 'No se pudo preparar el sonido.' },
      voixMac: ['Mónica', 'Jorge'], espeak: 'es', iso6392: 'spa', kokoro: [], source: 'Fuente: ',
    },
    de: {
      nom: 'allemand', adjectif: 'allemande', locale: 'de', regions: ['DE', 'AT', 'CH'],
      articles: ['der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einen', 'einem', 'einer', 'eines', 'kein', 'keine', 'mein', 'meine',
        'sein', 'seine', 'ihr', 'ihre', 'unser', 'unsere', 'zu', 'zum', 'zur', 'im', 'am', 'vom', 'beim', 'mit', 'von', 'fur', 'auf', 'aus',
        'bei', 'nach', 'in', 'an'],
      liaisons: ['und', 'oder', 'aber', 'denn', 'weil', 'dass', 'wenn', 'als', 'ob', 'sondern', 'damit', 'obwohl', 'doch', 'sowie', 'bis', 'wahrend', 'nachdem', 'sobald'],
      nombres: borne(nombresAllemands),
      caracteres: LATIN + 'äöüßÄÖÜ„“' + COMMUNS,
      typographie: COMMUNES.concat(['guillemets-allemands', 'sans-espace-ponctuation', 'unite-insecable']),
      repetitions: ['die', 'der', 'das'],
      lecteur: { lecture: 'Abspielen', pause: 'Pause', position: 'Position', lire: 'Video abspielen', scene: 'Szene', boucle: 'Schleife',
        preparation: 'Ton wird vorbereitet', bloque: 'Ton vom Browser blockiert: klicken, um ihn zu hören', echec: 'Der Ton konnte nicht vorbereitet werden.' },
      voixMac: ['Anna'], espeak: 'de', iso6392: 'deu', kokoro: [], source: 'Quelle: ',
    },
    it: {
      nom: 'italien', adjectif: 'italienne', locale: 'it', regions: ['IT'],
      articles: ['il', 'lo', 'la', 'i', 'gli', 'le', 'un', 'uno', 'una', 'l', 'del', 'della', 'dei', 'delle', 'al', 'alla', 'ai', 'nel', 'nella',
        'sul', 'dal', 'di', 'a', 'da', 'in', 'con', 'su', 'per', 'tra', 'fra', 'questo', 'questa', 'mio', 'mia', 'suo', 'sua'],
      liaisons: ['e', 'ed', 'o', 'ma', 'perche', 'che', 'quando', 'se', 'come', 'mentre', 'dove', 'anche', 'oppure', 'pero', 'quindi', 'cioe'],
      nombres: borne(nombresItaliens),
      caracteres: LATIN + 'àèéìòùÀÈÉÌÒÙ«»' + COMMUNS,
      typographie: COMMUNES.concat(['guillemets-chevrons', 'sans-espace-ponctuation', 'unite-insecable-sauf-pourcent']),
      repetitions: [],
      lecteur: { lecture: 'Riproduci', pause: 'Pausa', position: 'Posizione', lire: 'Guarda il video', scene: 'Scena', boucle: 'ciclo',
        preparation: 'audio in preparazione', bloque: 'audio bloccato dal browser: fai clic per ascoltarlo', echec: 'Impossibile preparare l\'audio.' },
      voixMac: ['Alice'], espeak: 'it', iso6392: 'ita', kokoro: [], source: 'Fonte: ',
    },
    pt: {
      nom: 'portugais', adjectif: 'portugaise', locale: 'pt-PT', regions: ['PT', 'BR'],
      articles: ['o', 'a', 'os', 'as', 'um', 'uma', 'uns', 'umas', 'do', 'da', 'dos', 'das', 'no', 'na', 'nos', 'nas', 'ao', 'aos', 'pelo',
        'pela', 'de', 'em', 'com', 'por', 'para', 'sem', 'este', 'esta', 'esse', 'essa', 'meu', 'minha', 'seu', 'sua'],
      liaisons: ['e', 'ou', 'mas', 'porque', 'que', 'quando', 'se', 'como', 'embora', 'enquanto', 'onde', 'pois', 'porem', 'nem', 'logo'],
      nombres: borne(nombresPortugais),
      caracteres: LATIN + 'ãõâêôáéíóúçÃÕÂÊÔÁÉÍÓÚÇ«»' + COMMUNS,
      typographie: COMMUNES.concat(['guillemets-chevrons', 'sans-espace-ponctuation', 'unite-insecable-sauf-pourcent']),
      repetitions: [],
      lecteur: { lecture: 'Reproduzir', pause: 'Pausa', position: 'Posição', lire: 'Ver o vídeo', scene: 'Cena', boucle: 'repetição',
        preparation: 'som em preparação', bloque: 'som bloqueado pelo navegador: clique para o ouvir', echec: 'Não foi possível preparar o som.' },
      voixMac: ['Joana', 'Luciana'], espeak: 'pt', iso6392: 'por', kokoro: [], source: 'Fonte: ',
      // Portugais du Brésil : guillemets “ ”, voix et espeak-ng brésiliens d'abord.
      parRegion: { BR: { typographie: COMMUNES.concat(['guillemets-anglais', 'sans-espace-ponctuation', 'unite-insecable-sauf-pourcent']),
        caracteres: LATIN + 'ãõâêôáéíóúçÃÕÂÊÔÁÉÍÓÚÇ“”' + COMMUNS, voixMac: ['Luciana', 'Joana'], espeak: 'pt-br' } },
    },
    nl: {
      nom: 'néerlandais', adjectif: 'néerlandaise', locale: 'nl', regions: ['NL', 'BE'],
      articles: ['de', 'het', 'een', 't', 'dit', 'dat', 'deze', 'die', 'mijn', 'jouw', 'zijn', 'haar', 'ons', 'onze', 'hun', 'van', 'in', 'op',
        'aan', 'met', 'voor', 'naar', 'bij', 'uit', 'om', 'tot', 'door', 'te'],
      liaisons: ['en', 'of', 'maar', 'want', 'omdat', 'als', 'wanneer', 'toen', 'terwijl', 'hoewel', 'dus', 'zodat', 'waar'],
      nombres: borne(nombresNeerlandais),
      caracteres: LATIN + 'ëïéèËÏ“”' + COMMUNS,
      typographie: COMMUNES.concat(['guillemets-anglais', 'sans-espace-ponctuation', 'unite-insecable-sauf-pourcent']),
      repetitions: [],
      lecteur: { lecture: 'Afspelen', pause: 'Pauze', position: 'Positie', lire: 'Video afspelen', scene: 'Scène', boucle: 'herhaling',
        preparation: 'geluid wordt voorbereid', bloque: 'geluid geblokkeerd door de browser: klik om het te horen', echec: 'Het geluid kon niet worden voorbereid.' },
      voixMac: ['Xander'], espeak: 'nl', iso6392: 'nld', kokoro: [], source: 'Bron: ',
    },
  };
  // En-US : voix américaines d'abord.
  LANGUES.en.parRegion = { US: { voixMac: ['Samantha', 'Daniel'], espeak: 'en-us' } };

  var CODES = Object.keys(LANGUES);
  var ETIQUETTE = /^([A-Za-z]{2})(?:[-_]([A-Za-z]{2}))?$/;
  var MESSAGE = '« langue » doit être l\'une de : ' + CODES.map(function (c) { return LANGUES[c].nom + ' (' + c + ')'; }).join(', ')
    + ', avec une région facultative (ex. en-US).';

  /** Étiquette BCP 47 -> { ok, etiquette (normalisée, région par défaut posée), principale } | { ok: false, message }. */
  function lire(etiquette) {
    var m = typeof etiquette === 'string' ? ETIQUETTE.exec(etiquette.trim()) : null;
    var p = m && m[1].toLowerCase();
    if (!m || !Object.prototype.hasOwnProperty.call(LANGUES, p)) return { ok: false, message: MESSAGE };
    var region = m[2] ? m[2].toUpperCase() : null;
    var L = LANGUES[p];
    if (region && L.regions.indexOf(region) < 0) {
      return { ok: false, message: '« langue » : la région « ' + region + ' » n\'est pas prévue en ' + L.nom + ' ; régions : '
        + L.regions.map(function (r) { return p + '-' + r; }).join(', ') + ', ou « ' + p + ' » seul.' };
    }
    // Région absente : celle de la locale par défaut (en -> en-GB, pt -> pt-PT), sinon la langue seule.
    return { ok: true, etiquette: region ? p + '-' + region : L.locale, principale: p };
  }

  function principale(etiquette) {
    var r = lire(etiquette || 'fr');
    return r.ok ? r.principale : 'fr';
  }

  /** Étiquette normalisée de la vidéo : « langue » du déroulé, 'fr' si absente ou invalide. */
  function etiquetteDe(deroule) {
    var r = deroule && deroule.langue !== undefined ? lire(deroule.langue) : null;
    return r && r.ok ? r.etiquette : 'fr';
  }

  /** La langue d'une étiquette, réglages de la région compris (etiquette, principale, locale ajoutées). */
  function de(etiquette) {
    var r = lire(etiquette || 'fr');
    var p = r.ok ? r.principale : 'fr';
    var L = LANGUES[p], e = r.ok ? r.etiquette : 'fr';
    var region = e.indexOf('-') > 0 ? e.split('-')[1] : null;
    var sur = (region && L.parRegion && L.parRegion[region]) || {};
    var res = { code: p, etiquette: e, principale: p };
    Object.keys(L).forEach(function (k) { if (k !== 'parRegion') res[k] = Object.prototype.hasOwnProperty.call(sur, k) ? sur[k] : L[k]; });
    res.locale = e;
    return res;
  }

  function nom(etiquette) { return LANGUES[principale(etiquette)].nom; }
  function adjectif(etiquette) { return LANGUES[principale(etiquette)].adjectif; }
  function lecteur(etiquette) { return de(etiquette).lecteur; }
  function estFrancais(etiquette) { return principale(etiquette) === 'fr'; }

  return { LANGUES: LANGUES, CODES: CODES, MESSAGE: MESSAGE, lire: lire, principale: principale, etiquetteDe: etiquetteDe, de: de, nom: nom,
    adjectif: adjectif, lecteur: lecteur, estFrancais: estFrancais };
});
