#!/usr/bin/env node
'use strict';
/* Pulse Motion – point d'entrée unique des skills (bin/pulse-motion).
 *
 *   pulse-motion etat <dossier> [--accord deroule|style|video] [--parcours rapide|accompagne|autonome]
 *   pulse-motion ebauche <dossier>       ébauche animée des scènes absentes (scène toute faite du style ou carte neutre)
 *   pulse-motion decisions <dossier> [noter "<sujet>" "<choix>" "<raison>" "<pour changer>"]   choix faits par Claude (« Faites pour moi »)
 *   pulse-motion rappel                 rappel de démarrage (crochet SessionStart, par le relais sh) : entrée JSON du crochet
 *   pulse-motion assembler <dossier>
 *   pulse-motion controler <dossier> [--sans-correction] [--sans-rendu] [--gpu] [--complet]   contrôle ; corrige seul les cas sûrs
 *   pulse-motion apercu <dossier> [--port 4321] [--ouvrir]
 *   pulse-motion atelier [<recette>] [--dossier <d>]   atelier des effets de particules (page de l'aperçu) : régler, enregistrer
 *   pulse-motion historique sauvegarder <dossier> [--phrase "<retouche>"] | annuler|retablir|liste <dossier> | nommer|revenir|oublier "<nom ou numéro>" <dossier>
 *   pulse-motion remarques [liste | attendre | faite <id> "<réponse>" | discuter <id> "<question>"] <dossier>   remarques épinglées dans l'aperçu
 *   pulse-motion exporter <dossier> [--pour web|reseaux|presentation|master|courriel|brouillon] [--taille-max <Mo>] [--qualite 1080p|720p|540p] [--ips 30|60] [--rapide] [--avec-provisoire] [--estimer] [--scene <id>[,<id>] | --plage <début>-<fin>] [--gif [--largeur 1280]] [--cadre telephone [--cadre-format 16:9|1:1]] [--flou oui|non] [--transparent [mov|webm]]   MP4 fidèle (ffmpeg) ou dans le navigateur ; extrait, passage seul, GIF, cadre de téléphone, flou de mouvement, fond transparent
 *   pulse-motion ffmpeg                  ffmpeg présent ? commande pour l'installer
 *   pulse-motion voix importer <fichier> [--scene <id>] [dossier] | provisoire [--scene <id>] [dossier] | transcrire [--scene <id>] [dossier] | studio <scène> [dossier] | mots --scene <id> [dossier] | synthese [--scene <id>] [dossier] | synthese installer [--legere|--normale]   voix d'une scène, voix provisoire, transcription, studio, mots datés, voix de synthèse locale
 *   pulse-motion exporter <dossier> --images [png|jpeg] [--de <s> --a <s>] [--ips n] [--estimer] [--accord]   séquence d'images pour un monteur (sans ffmpeg)
 *   pulse-motion musique ecouter [dossier] [--ouvrir]   musique seule dans sortie/musique.wav (pour l'écouter)
 *   pulse-motion musique ajouter <fichier> --ambiance a[,b] --licence <l> [--titre --auteur --source --attribution] | liste [--ambiance a] | utiliser <id> [dossier] [--remplacer] | retirer <id>
 *                                                       bibliothèque personnelle de musiques (avec leur licence)
 *   pulse-motion whisper [installer [--modele small]]   transcription des voix (Python, faster-whisper) : état ou installation
 *   pulse-motion outils [--plan]         état de l'ordinateur : Node, Chrome ou Edge, ffmpeg, Python, transcription, voix du système, voix de synthèse ;
 *                                        --plan : ce qui manque, dans l'ordre où l'installer (un accord pour la liste)
 *   pulse-motion avancement <dossier> [--suivre]   travail long en cours (contrôle, export, installation…) : une ligne, ou une par étape
 *   pulse-motion planche <dossier> [id1,id2] [--ouvrir]   images clés PNG dans sortie/planche/
 *   pulse-motion planche <dossier> [id1,id2] --pdf   PDF des planches (A4 paysage, deux scènes par page) : sortie/<titre>-planches.pdf
 *   pulse-motion credits <dossier> [noter <fichier> "<source>" "<licence>" ["<auteur>"]]   crédits de la vidéo ; source d'un fichier importé
 *   pulse-motion planche <dossier> --regard [--scenes a,b]   planches de regard dans sortie/regard/ (ouverture, temps forts, téléphone, bandes, fiche)
 *   pulse-motion planche <dossier> <id> --de <s> --duree <s> [--pas <n>]   planche image par image d'une scène (3 s au plus), dans sortie/planche/
 *   pulse-motion planche <dossier> --suivre <personnage|sélecteur> [--scene <id>] [--de <s>] [--duree <s>] [--pas <n>]   bandes recadrées
 *                                        autour de l'élément qui bouge, agrandies 4 fois sans lissage : sortie/planche/suivre-<cible>.png
 *   pulse-motion planche <dossier> --instants <t1,t2>   image de chaque instant (secondes de la vidéo), dans sortie/planche/instant-<ms>.png
 *   pulse-motion planche <dossier> --avant <numéro|nom|precedente> [id1,id2]   avant / après / différences des scènes modifiées : sortie/planche/avant-apres-<id>.png
 *   pulse-motion reference <nom>          affiche references/<nom>.md (ex. moteur, rythme, styles/clair-pedagogique) ; usages : tableau de scripts/usages.json
 *   pulse-motion reference styles/<style> --pour animateur   extrait de la fiche de style lu par l'animateur
 *   pulse-motion scene <style> <nom>      affiche une scène toute faite d'un style
 *   pulse-motion effet <nom>              affiche la recette d'un effet de particules (vidéo du dossier, bibliothèque personnelle, plugin)
 *   pulse-motion effet liste [--dossier <d>] | enregistrer <nom> [<dossier>] [--sous <autre>] [--remplacer] | utiliser <nom> [<dossier>] [--remplacer]
 *                                        effets avec leur provenance ; garder un effet de la vidéo ; le copier dans une vidéo
 *   pulse-motion filmer verifier|tourner|continuer|prises|choisir|supprimer|essai|connexions|flouter|importer|repere <dossier> <nom> …   filmer une application web ou importer une vidéo de l'écran (tutoriel)
 *   pulse-motion imiter niveau "<phrase>" | analyser <fichier | films/<nom>> [--de s --a s] [--zone x,y,l,h] [--couleurs #hex,…] [--niveau esprit|mouvement] [<dossier>]
 *                       | comparer <nom> --scene <id> [<dossier>] | fiche <nom> [<dossier>]   imiter la manière d'une animation fournie (jamais l'œuvre)
 *   pulse-motion bloc [<nom>]             blocs « interface » d'un écran de tutoriel (notification, toast, commande…) : liste, ou le HTML d'un bloc
 *   pulse-motion icones chercher <mots…> | afficher <nom> | planche <nom1,nom2…> [--ouvrir]   icônes Lucide : chercher en français, SVG, planche PNG
 *   pulse-motion cartes chercher <mots…> | afficher <carte> <lieu> [--cadre c] [--pays FR,DE] [--ratio r] | planche <carte> [--pays FR,DE] [--cadre c] [--ouvrir]   cartes de pays et de régions (Natural Earth)
 *   pulse-motion lottie importer <fichier.json|.lottie> [--nom n] [--source "…"] [--licence "…"] [--auteur "…"] [<dossier>] | analyser <fichier> [<dossier>]   animation Lottie fournie par la personne
 *   pulse-motion mouvements liste [--categorie <id>] | chercher <mots…> | afficher <n° ou nom> | reference | choisir [--categorie <id>] [--ouvrir]   dictionnaire de mouvements nommés ; choisir en regardant
 *   pulse-motion personnages liste|afficher <nom>|verifier|planche <nom> [--dessin <d>]|planche --dessin <d> --visage|atelier [<nom>] [--dessin <d>] [--decoupe <nom>] [--bibliotheque]|analyser <svg>|decouper <nom>|renommer-couleur <dessin> <ancien> <nouveau> [--dossier <d>]|enregistrer <nom> [--type t] [--sous <autre>] [--remplacer]|utiliser <nom> [--type t] [--remplacer]   poses, clips et gabarits des personnages ; bibliothèque personnelle
 *   pulse-motion styles [--genre <genre> [--noter <dossier>]]   liste les styles (JSON), classée pour le genre ; --noter :
 *                                         les 3 proposés, gardés dans la mémoire de la personne à l'accord sur le style
 *   pulse-motion styles chercher <mots…>  styles trouvés par leur nom de médium (« façon tableau blanc ») ou par une
 *                                         référence connue (« façon Kurzgesagt »)
 *   pulse-motion styles verifier <nom>    vérifie le contrat d'un style
 *   pulse-motion styles polices <style>   polices du style, deux alternatives sous licence OFL et polices trop vues
 *   pulse-motion styles choisir [--categorie <id>] [--ouvrir] [--delai <minutes>]   page locale : choisir un style en le regardant
 *   pulse-motion changer-style <dossier> <style>   recopie les scènes toutes faites du nouveau style
 *   pulse-motion decliner <dossier> [--format 9:16|1:1|4:5|16:9] [--langue <étiquette>] [--plateforme tiktok|shorts|reels|toutes] [--pour <usage>]   version verticale, carrée ou dans une autre langue, dans declinaisons/<nom>/ (l'original ne change pas)
 *   pulse-motion comparer <dossier> <s1,s2,s3> [--scenes a,b] [--ouvrir]   comparaison des styles sur le déroulé
 *   pulse-motion charte enregistrer <nom> <dossier> | liste | appliquer <nom> <dossier> | depuis-logo <fichier> [--style s] [--ton clair|sombre]
 *   pulse-motion police "<famille>" [--graisses 400,700] [--italique] | <fichier> [--famille "<nom>"] [--confirmer] [--style <style> --role titres|texte]   police de la charte (Bunny Fonts ou fichier)
 *   pulse-motion style nouveau <nom> [--depuis <style>] [--emprunts s1,s2] | verifier <nom> | planche <nom> [--scenes a,b] [--ratio r] [--ton t] [--textes exemple|maximum] [--temoin | --avec-base] [--ouvrir]
 *                      | noter <nom> <section> "<avant>" "<après>" "<pourquoi>" [--nouveau-tour] [--charte] | base <nom> [--a-jour]   style personnel
 *   pulse-motion glossaire <dossier> | glossaire noter <dossier> "<terme>" "<sens>" ["<à éviter>"] [--cle]   mots du métier (charte/glossaire.md)
 *   pulse-motion lexique [noter "<terme>" "<phrase>" "<comme…>" "<commande>"]   mots de l'outil expliqués à la personne
 *   pulse-motion consignes <skill> [<section>[,<section>]]   consignes d'un skill, ou ses règles et une section (ex. creer fabrication)
 *   pulse-motion rapport [<dossier>]       rapport de problème : sortie/rapport-probleme.md et adresse de signalement préremplie (rien n'est envoyé)
 *   pulse-motion preferences [liste [--genre g] [--style s] | noter "<citation>" "<règle>" [--domaine d] [--genre g] [--style s] | retirer <id>]   goûts retenus
 *   pulse-motion page <dossier> --bouton-mp4 oui|non   page livrée qui sait faire son MP4 (environ 250 Ko de plus), ou plus légère
 *   pulse-motion videos                   les vidéos de la personne (registre ~/.pulse-motion/videos.json) : étape, durée, format, style, MP4
 *   pulse-motion bibliotheque liste | exporter [<fichier.zip>] [--chartes a,b|tout] [--styles …] [--effets …] [--personnages …] [--musiques …] [--gouts] [--remplacer]
 *                       | importer <fichier.zip> [--voir] [--remplacer tout|<sorte>:<nom>,…]   bibliothèque personnelle emportée sur un autre ordinateur
 *
 * Chaque sortie en erreur d'une commande s'ajoute au journal ~/.pulse-motion/erreurs.jsonl (nom de la commande, sans ses
 * arguments : lib/erreurs.js), lu par « rapport ». Les sorties des scripts sont relayées au fil de l'eau.
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { trouverStyle, messageStyleInconnu } = require('./styles.js');

const RACINE = path.resolve(__dirname, '..');
const NOM_SUR = /^[a-z0-9-]+(\/[a-z0-9-]+)?$/;

const SCRIPTS = {
  etat: 'etat.js',
  rappel: 'rappel.js',
  avancement: 'avancement.js',
  ebauche: 'ebauche.js',
  remarques: 'remarques.js',
  decisions: 'decisions.js',
  assembler: 'assembler.js',
  controler: 'controler.js',
  apercu: 'apercu.js',
  atelier: 'atelier.js',
  historique: 'historique.js',
  exporter: 'exporter.js',
  styles: 'styles.js',
  'changer-style': 'changer-style.js',
  decliner: 'decliner.js',
  comparer: 'comparer.js',
  charte: 'charte.js',
  police: 'polices.js',
  style: 'style-perso.js',
  ffmpeg: 'ffmpeg.js',
  voix: 'voix.js',
  whisper: 'whisper.js',
  outils: 'outils.js',
  musique: 'musique.js',
  personnages: 'personnages.js',
  mouvements: 'mouvements.js',
  icones: 'icones.js',
  cartes: 'cartes.js',
  lottie: 'lottie.js',
  modeles: 'modeles.js',
  credits: 'credits.js',
  filmer: 'filmer.js',
  imiter: 'imiter.js',
  rapport: 'rapport.js',
  preferences: 'preferences.js',
  videos: 'videos.js',
  page: 'page.js',
  bibliotheque: 'bibliotheque.js',
};

/** Commandes traitées ici même, sans script à elles. */
const INTERNES = ['glossaire', 'lexique', 'planche', 'reference', 'scene', 'bloc', 'effet', 'consignes'];
/** Toutes les commandes de « pulse-motion » (les tests vérifient que les consignes n'en citent pas d'autres). */
const COMMANDES = [...Object.keys(SCRIPTS), ...INTERNES];

// Dernières sorties de la commande lancée, pour le journal des erreurs (lib/erreurs.js, messageDe).
const derniere = { sortie: '', erreur: '' };

/** Lance un script avec le Node courant ; sorties relayées au fil de l'eau et gardées (8 000 derniers caractères). -> Promise(code) */
function executer(args) {
  return new Promise((resoudre) => {
    const enfant = spawn(process.execPath, args, { stdio: ['inherit', 'pipe', 'pipe'] });
    enfant.stdout.on('data', (d) => { process.stdout.write(d); derniere.sortie = (derniere.sortie + d).slice(-8000); });
    enfant.stderr.on('data', (d) => { process.stderr.write(d); derniere.erreur = (derniere.erreur + d).slice(-8000); });
    const arrets = ['SIGINT', 'SIGTERM'].map((s) => [s, () => { try { enfant.kill(s); } catch { /* déjà arrêté */ } }]);
    for (const [s, fn] of arrets) process.on(s, fn);
    enfant.on('error', (e) => { derniere.erreur += `${e.message}\n`; });
    enfant.on('close', (code, signal) => {
      for (const [s, fn] of arrets) process.removeListener(s, fn);
      resoudre(code ?? (signal ? 1 : 0));
    });
  });
}

function afficherFichier(fichier, quoi) {
  if (!fs.existsSync(fichier)) {
    console.error(`${quoi} introuvable.`);
    return 1;
  }
  process.stdout.write(fs.readFileSync(fichier, 'utf8'));
  return 0;
}

function lancer(args) {
  const [commande, ...reste] = args;
  if (SCRIPTS[commande]) {
    return executer([path.join(RACINE, 'scripts', SCRIPTS[commande]), ...reste]);
  }
  if (commande === 'glossaire') {
    return executer([path.join(RACINE, 'scripts', 'vocabulaire.js'), 'glossaire', ...reste]);
  }
  if (commande === 'lexique') {
    return executer([path.join(RACINE, 'scripts', 'vocabulaire.js'), 'lexique', ...reste]);
  }
  if (commande === 'planche') {
    // Planche qui suit un élément (spec S11, 5.11 point 1) : avant la planche image par image, qui partage --de et --duree.
    if (reste.includes('--suivre')) return executer([path.join(RACINE, 'scripts', 'planche-suivre.js'), ...reste]);
    // Planche image par image (spec Mouvement vivant, 5.14) : planche <dossier> <id> --de <s> --duree <s> [--pas <n>].
    if (reste.includes('--de') || reste.includes('--duree')) {
      const AVEC_VALEUR = ['--de', '--duree', '--pas'];
      const libres = reste.filter((o, k) => !o.startsWith('--') && !AVEC_VALEUR.includes(reste[k - 1]));
      const [dossier = '.', id = ''] = libres;
      const val = (o) => { const k = reste.indexOf(o); return k >= 0 && reste[k + 1] !== undefined ? [o, reste[k + 1]] : []; };
      const cadence = [path.join(RACINE, 'scripts', 'regard.js'), dossier, '--cadence', id, ...val('--de'), ...val('--duree'), ...val('--pas')];
      return executer(cadence);
    }
    // Instants précis (remarques de l'aperçu) et avant / après (spec Retouches et ergonomie, 5.8 et 5.10).
    if (reste.includes('--instants') || reste.includes('--avant')) {
      return executer([path.join(RACINE, 'scripts', 'planche-retouche.js'), ...reste]);
    }
    const [dossier = '.', ...options] = reste;
    const ids = options.filter((o) => !o.startsWith('--'));
    const drapeaux = options.filter((o) => o.startsWith('--'));
    // Planches de regard (images que Claude regarde avant de montrer) : scènes en position ou après --scenes.
    if (drapeaux.includes('--regard')) {
      const regard = [path.join(RACINE, 'scripts', 'regard.js'), dossier, ...(ids.length ? ['--scenes', ids[0]] : [])];
      return executer(regard);
    }
    // PDF des planches (spec Rendu et export, 5.16) : captures fidèles, impression du navigateur, jamais ffmpeg.
    if (drapeaux.includes('--pdf')) {
      return executer([path.join(RACINE, 'scripts', 'planche-pdf.js'), dossier, ...ids.slice(0, 1)]);
    }
    const args = [path.join(RACINE, 'scripts', 'exporter.js'), dossier, '--planche', ...ids.slice(0, 1), ...drapeaux];
    return executer(args);
  }
  if (commande === 'reference') {
    const nom = reste[0] || '';
    // Le dictionnaire de mouvements est rendu depuis sa source JSON (references/mouvements/mouvements.json).
    if (nom === 'mouvements') return executer([path.join(RACINE, 'scripts', 'mouvements.js'), 'reference']);
    // Les usages d'export sont rendus depuis leur source (scripts/usages.json, mesures comprises).
    if (nom === 'usages') { process.stdout.write(require('./lib/usages.js').tableauUsages()); return 0; }
    if (!NOM_SUR.test(nom)) { console.error('Usage : pulse-motion reference <nom> (ex. moteur, rythme, styles/clair-pedagogique)'); return 2; }
    const fichier = path.join(RACINE, 'references', `${nom}.md`);
    const m = /^styles\/([a-z0-9-]+)$/.exec(nom);
    // Fiche de style : --pour animateur rend l'extrait que lit l'animateur (spec Styles et réalisation, 5.1).
    const iPour = reste.indexOf('--pour');
    const pour = iPour >= 0 ? reste[iPour + 1] : undefined;
    if (iPour >= 0 && (pour !== 'animateur' || !m)) { console.error('Usage : pulse-motion reference styles/<style> --pour animateur'); return 2; }
    let cible = fichier;
    let quoi = `Référence « ${nom} »`;
    if (m && !fs.existsSync(fichier)) {
      // Guide d'un style personnel : rangé avec le style (guide.md).
      const st = trouverStyle(m[1]);
      if (st && st.personnel) { cible = path.join(st.dossier, 'guide.md'); quoi = `Guide du style « ${m[1]} »`; }
    }
    if (!pour) return afficherFichier(cible, quoi);
    if (!fs.existsSync(cible)) { console.error(`${quoi} introuvable.`); return 1; }
    process.stdout.write(require('./lib/fiche-style.js').extraitAnimateur(fs.readFileSync(cible, 'utf8')));
    return 0;
  }
  if (commande === 'scene') {
    const [style, nom] = reste;
    if (!/^[a-z0-9-]+$/.test(style || '') || !/^[a-z0-9-]+$/.test(nom || '')) { console.error('Usage : pulse-motion scene <style> <nom>'); return 2; }
    const st = trouverStyle(style);
    if (!st) { console.error(messageStyleInconnu(style)); return 1; }
    return afficherFichier(path.join(st.dossier, 'scenes', `${nom}.html`), `Scène « ${nom} » du style « ${style} »`);
  }
  if (commande === 'bloc') {
    // Blocs « interface » (spec S6, 5.13) : HTML commun à tous les styles, dans moteur/blocs/.
    const dossier = path.join(RACINE, 'moteur', 'blocs');
    const nom = reste[0] || '';
    if (!nom) {
      const liste = fs.readdirSync(dossier).filter((f) => f.endsWith('.html')).map((f) => f.slice(0, -5)).sort();
      process.stdout.write(`${JSON.stringify({ blocs: liste }, null, 2)}
`);
      return 0;
    }
    if (!/^[a-z0-9-]+$/.test(nom)) { console.error('Usage : pulse-motion bloc [<nom>] (ex. notification, toast, commande)'); return 2; }
    return afficherFichier(path.join(dossier, `${nom}.html`), `Bloc « ${nom} »`);
  }
  if (commande === 'effet') {
    const nom = reste[0] || '';
    const B = require('./lib/bibliotheque.js');
    // Bibliothèque personnelle (chantier H) : liste avec provenance, garder un effet de la vidéo, le copier dans une vidéo.
    if (B.RESERVES.includes(nom)) return executer([path.join(RACINE, 'scripts', 'bibliotheque.js'), 'effet', ...reste]);
    if (!/^[a-z0-9-]+$/.test(nom)) { console.error('Usage : pulse-motion effet <nom> (ex. etincelles, confettis) | effet liste | effet enregistrer <nom> . | effet utiliser <nom> .'); return 2; }
    // La recette telle que la vidéo du dossier la voit, sinon celle de la bibliothèque personnelle, sinon celle du plugin.
    return afficherFichier(B.fichierEffet(nom, { projet: process.cwd() }) || path.join(RACINE, 'effets', `${nom}.json`), `Effet « ${nom} »`);
  }
  if (commande === 'consignes') {
    const nom = reste[0] || '';
    const sections = reste[1];
    if (!/^[a-z0-9-]+$/.test(nom) || (sections !== undefined && !/^[a-z0-9-]+(,[a-z0-9-]+)*$/.test(sections))) {
      console.error('Usage : pulse-motion consignes <skill> [<section>[,<section>]] (ex. creer fabrication)');
      return 2;
    }
    const fichier = path.join(RACINE, 'skills', nom, 'SKILL.md');
    if (sections === undefined || !fs.existsSync(fichier)) return afficherFichier(fichier, `Consignes « ${nom} »`);
    // Règles et sections demandées seulement (spec Rapidité § 5.4.3).
    const r = require('./lib/consignes.js').sectionsConsignes(fs.readFileSync(fichier, 'utf8'), sections.split(','));
    if (!r.ok) { console.error(r.message); return 2; }
    process.stdout.write(r.texte);
    return 0;
  }
  console.error([
    'Usage : pulse-motion <commande> …',
    '  etat <dossier> [--accord deroule|style|video] [--parcours rapide|accompagne|autonome]',
    '  ebauche <dossier>        ébauche animée des scènes absentes      decisions <dossier> [noter "<sujet>" "<choix>" "<raison>" "<pour changer>"]',
    '  assembler <dossier>      controler <dossier> [--sans-correction] [--sans-rendu] [--gpu] [--complet]      apercu <dossier> [--port N] [--ouvrir]',
    '  historique sauvegarder <dossier> [--phrase "<retouche>"] | annuler|retablir|liste <dossier> | nommer|revenir|oublier "<nom ou numéro>" <dossier>',
    '  remarques [liste | attendre | faite <id> "<réponse>" | discuter <id> "<question>"] <dossier>   remarques épinglées sur l\'image dans l\'aperçu',
    '  atelier [<recette>] [--dossier <dossier>]   atelier des effets de particules : régler à l\'œil, enregistrer dans effets/',
    '  exporter <dossier> [--pour <usage>] [--taille-max <Mo>] [--qualite 1080p|720p|540p] [--ips 30|60] [--rapide] [--avec-provisoire] [--estimer]   usages : reference usages',
    '           [--scene <id>[,<id>] | --plage <début>-<fin>] [--gif [--largeur 1280]] [--cadre telephone [--cadre-format 16:9|1:1]]   extrait, passage seul, GIF, cadre de téléphone : reference sorties',
    '  planche <dossier> [id1,id2] [--pdf]       planche <dossier> <id> --de <s> --duree <s> [--pas <n>]',
    '  planche <dossier> --instants <t1,t2>      planche <dossier> --avant <numéro|nom|precedente> [id1,id2]   instants précis ; avant / après d\'une retouche',
    '  planche <dossier> --suivre <personnage|sélecteur> [--scene <id>] [--de <s>] [--duree <s>] [--pas <n>]   un élément suivi de près, agrandi 4 fois',
    '  credits <dossier> [noter <fichier> "<source>" "<licence>" ["<auteur>"]]   crédits de la vidéo, source d\'un fichier importé',
    '  ffmpeg                   ffmpeg présent ? commande pour l\'installer',
    '  voix importer <fichier> [--scene <id>] [dossier] | provisoire [--scene <id>] [dossier] | transcrire [--scene <id>] [dossier] | studio <scène> [dossier] | mots --scene <id> [dossier] | synthese [--scene <id>] [dossier] | synthese installer [--legere|--normale]',
    '  whisper [installer [--modele small]]   transcription des voix',
    '  outils [--plan]          état de l\'ordinateur (ce qui est prêt, ce qui manque) ; --plan : ce qu\'il faudrait installer',
    '  avancement <dossier> [--suivre]   travail long en cours, une ligne (ou une par étape jusqu\'à la fin)',
    '  exporter <dossier> --images [png|jpeg] [--de <s> --a <s>] [--estimer] [--accord]   une image par fichier, pour un monteur',
    '  musique ecouter [dossier]   musique seule dans sortie/musique.wav',
    '  musique ajouter <fichier> --ambiance a --licence l | liste [--ambiance a] | utiliser <id> [dossier] | retirer <id>   vos musiques gardées, avec leur licence',
    '  filmer verifier|tourner [--accord]|continuer|prises|choisir|supprimer|essai|connexions|flouter|importer|repere <dossier> <nom> …   filmer une application web, importer une vidéo de son écran (tutoriel)',
    '  imiter niveau "<phrase>" | analyser <fichier | films/<nom>> [--de s --a s] [--zone x,y,l,h] [--couleurs #hex,…] [--niveau esprit|mouvement] [<dossier>] | comparer <nom> --scene <id> [<dossier>] | fiche <nom>   imiter une animation (reference imiter)',
    '  reference <nom>          scene <style> <nom>      effet <nom>      bloc [<nom>]      consignes <skill> [<section>]',
    '  effet liste [--dossier <d>] | enregistrer <nom> [<dossier>] [--sous <autre>] [--remplacer] | utiliser <nom> [<dossier>] [--remplacer]   effets gardés pour toutes les vidéos',
    '  mouvements liste [--categorie <id>] | chercher <mots…> | afficher <n° ou nom> | reference | choisir [--categorie <id>] [--ouvrir] [--delai <minutes>]   [--json]',
    '  icones chercher <mots…> | afficher <nom> | planche <nom1,nom2…> [--ouvrir]   icônes Lucide, posées par <svg data-icone="nom"> (reference icones)',
    '  cartes chercher <mots…> | afficher <carte> <lieu> [--cadre c] [--pays FR,DE] [--ratio r] | planche <carte> [--pays FR,DE] [--cadre c] [--ouvrir]   cartes, posées par <svg data-carte="monde"> (reference cartes)',
    '  lottie importer <fichier.json|.lottie> [--nom n] [--source "…"] [--licence "…"] [--auteur "…"] [<dossier>] | analyser <fichier>   animation Lottie, posée par <div data-lottie="…"> (reference lottie)',
    '  personnages liste|afficher <nom>|verifier|planche <nom> [--dessin <d>]|planche --dessin <d> --visage|atelier [<nom>] [--dessin <d>] [--decoupe <nom>] [--bibliotheque]|analyser <svg>|decouper <nom>|renommer-couleur <dessin> <ancien> <nouveau>|enregistrer <nom>|utiliser <nom> [--remplacer]   poses, clips et gabarits ; bibliothèque personnelle',
    '  modeles liste | afficher <id> | trouver "<sujet>" | exemple <id> <dossier> | apercu <id>   modèles de vidéo et leurs exemples finis',
    '  styles [--genre <genre> [--noter <dossier>]]      styles chercher <mots…>      styles verifier <nom>      styles polices <style>      styles choisir [--categorie <id>] [--ouvrir] [--delai <minutes>]',
    '  changer-style <dossier> <style>                  comparer <dossier> <s1,s2,s3> [--scenes a,b] [--ouvrir]',
    '  charte enregistrer <nom> <dossier> | liste | appliquer <nom> <dossier> | depuis-logo <fichier> [--style s] [--ton clair|sombre]',
    '  police "<famille>" [--graisses 400,700] [--italique] | <fichier> [--famille "<nom>"] [--confirmer] [--style <style> --role titres|texte] [--dans <dossier>]',
    '  style nouveau <nom> [--depuis <style>] [--emprunts s1,s2] | verifier <nom> | planche <nom> [--scenes a,b] [--ratio r] [--ton t] [--textes exemple|maximum] [--temoin | --avec-base] [--ouvrir]',
    '  style noter <nom> <section> "<avant>" "<après>" "<pourquoi>" [--nouveau-tour] [--charte] | base <nom> [--a-jour]   journal des changements, base du style',
    '  glossaire <dossier> | glossaire noter <dossier> "<terme>" "<sens>" ["<à éviter>"] ["<prononciation>"] [--cle]',
    '  lexique [noter "<terme>" "<phrase>" "<comme…>" "<commande>"]',
    '  rapport [<dossier>]      rapport de problème (fichier local et adresse préremplie, rien n\'est envoyé)      videos      les vidéos de la personne',
    '  page <dossier> --bouton-mp4 oui|non   page livrée qui sait faire son MP4, ou plus légère',
    '  preferences [liste [--genre g] [--style s] | noter "<citation>" "<règle>" [--domaine d] [--genre g] [--style s] | retirer <id>]   goûts retenus',
    '  bibliotheque liste | exporter [<fichier.zip>] [--chartes a,b|tout] [--styles …] [--effets …] [--personnages …] [--musiques …] [--gouts] [--remplacer] | importer <fichier.zip> [--voir] [--remplacer tout|<sorte>:<nom>,…]',
  ].join('\n'));
  return 2;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  // Messages écrits ici même (usage, fichier introuvable) : gardés pour le journal, comme ceux des scripts.
  const ecrireErreur = console.error;
  console.error = (...x) => { derniere.erreur += `${x.join(' ')}\n`; ecrireErreur(...x); };
  Promise.resolve(lancer(args)).then((code) => {
    // Journal des erreurs (spec Retouches et ergonomie, 5.20) : le nom de la commande seul, jamais ses arguments.
    if (code) {
      const E = require('./lib/erreurs.js');
      E.noterErreur({ commande: /^[a-z][a-z0-9-]*$/.test(args[0] || '') ? args[0] : 'inconnue', code, message: E.messageDe(derniere), masquer: args.slice(1) });
    }
    process.exitCode = code;
  });
}

module.exports = { lancer, COMMANDES };
