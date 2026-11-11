# Contribuer à Pulse Motion

*English version: [CONTRIBUTING.en.md](CONTRIBUTING.en.md).*

Merci de votre intérêt. Pulse Motion est un plugin Claude Code qui fabrique des vidéos de motion design sur l'ordinateur de la personne, sans cloud. Ce guide dit comment installer le dépôt, lancer les tests, ce qu'il faut respecter, et comment ajouter un style, un effet de particules, un mouvement du dictionnaire ou un modèle de vidéo. Pour comprendre comment la vidéo est fabriquée, lisez [ARCHITECTURE.md](ARCHITECTURE.md).

Le plugin s'adresse à des personnes qui n'ont aucune notion de code et qui parlent français : c'est la règle qui décide de presque tout le reste.

## Le dépôt

| Dossier | Contenu |
|---|---|
| `.claude-plugin/marketplace.json` | Le catalogue (marketplace) `pulse-motion`, qui contient un seul plugin |
| `plugins/pulse-motion/` | Le plugin, tel qu'il est installé chez la personne (voir son [README](plugins/pulse-motion/README.md)) |
| `docs/` | Le wiki publié sur GitHub Pages (pages HTML, styles, scripts, petites captures) ; `docs/medias/` est fabriqué et ignoré par git |
| `outils/` | Outils de mainteneur, jamais livrés : le wiki (`wiki/`), le site et ses médias (`site/`), les mesures de vitesse (`mesures/`), les icônes (`icones/`), la porte de publication (`publication/`) |
| `.github/workflows/tests.yml` | Tests unitaires sur Windows, macOS et Linux à chaque envoi |

Dans le plugin :

| Dossier | Contenu |
|---|---|
| `skills/` | Les 13 compétences (`creer`, `retoucher`, `exporter`…) : ce que Claude fait quand la personne demande quelque chose |
| `agents/` | `animateur` (écrit une scène) et `critique` (relit la vidéo d'après ses planches) |
| `scripts/` | La commande `pulse-motion` (`scripts/pm.js`, lancée par `bin/`) : assemblage, aperçu, contrôle, export, historique, voix, tournage… ; `scripts/lib/` pour les modules communs |
| `moteur/` | Le moteur JavaScript inclus dans chaque page : horloge, minutage, caméra, son, particules, personnages, transitions |
| `styles/` | Les styles livrés |
| `effets/` | Les recettes des effets de particules |
| `personnages/` | Poses, mouvements, expressions, gabarits et dessins des personnages |
| `references/` | Les consignes lues par Claude (moteur, rythme, contrôles, réalisation, fiches de style, dictionnaire de mouvements…) |
| `modeles/videos/` | Les modèles de vidéo ; `exemples/` : un exemple fini par modèle |
| `shaders/`, `vendor/` | Fonds et transitions par shader ; bibliothèques tierces embarquées, avec leur `PROVENANCE.md` |
| `tests/` | Les tests (`node:test`), leurs aides (`tests/aide/`) et leurs données (`tests/fixtures/`) |

## Installer le dépôt

Il faut :

- **Node.js 20 ou plus** (Node 22 pour l'option `--sauter` des tests, comme la CI). **Aucun `npm install`** : le plugin n'a aucune dépendance.
- **Chrome ou Edge** : l'aperçu, le contrôle, l'export et la moitié des tests ouvrent le navigateur sans fenêtre.
- **ffmpeg**, facultatif : l'export fidèle, les tests qui le vérifient et les médias du site. Sans lui, ces tests sont sautés.
- **Python 3**, facultatif : la transcription de la voix (whisper).
- **Claude Code**, pour essayer le plugin en vrai.

```bash
git clone https://github.com/jdelauney/pulse-motion.git
cd pulse-motion
node plugins/pulse-motion/scripts/pm.js outils     # ce qui est prêt sur cet ordinateur
```

Pour essayer votre copie dans Claude Code, ajoutez le dépôt local comme catalogue, puis installez le plugin :

```
/plugin marketplace add <chemin du clone>
/plugin install pulse-motion@pulse-motion
```

Fermez puis relancez Claude Code après chaque changement du plugin. Les protocoles d'essai à la main sont dans `docs/essais/`.

## Lancer les tests

```bash
cd plugins/pulse-motion
npm test                                        # tout : environ 10 minutes
node scripts/lancer-tests.js --unitaires        # la phase sans navigateur, en parallèle (quelques minutes)
node scripts/lancer-tests.js --navigateur       # la phase qui ouvre Chrome ou Edge, deux fichiers à la fois
node --test tests/deroule.test.js               # un seul fichier
```

- `npm test` lance deux phases : les tests unitaires, puis ceux qui ouvrent le navigateur. Un fichier qui dépasse son délai sous charge est relancé une fois, seul, et la relance est signalée.
- **Non-régression visuelle du moteur** : deux vidéos étalons (`tests/fixtures/etalon/`) sont comparées à leurs images de référence, enregistrées par système. Quand un changement de rendu est voulu, `node scripts/lancer-tests.js --etalon` les réenregistre ; dites-le dans le message de commit.
- **Preuve du déterminisme** : les scènes à risque (code de scène, particules, personnages) sont rendues dans deux ordres et comparées (`tests/determinisme.test.js`).
- **Plugin installé** : un test copie le plugin hors du dépôt et fabrique puis exporte l'exemple comme une fois installé.
- **Documentation testée** : les règles, seuils, commandes et renvois cités par les références et les consignes sont vérifiés contre le code (`tests/documentation.test.js`) ; le wiki est vérifié contre le plugin (`tests/docs.test.js`, `tests/contribuer.test.js`…).
- **Évaluations des compétences** (est-ce la bonne compétence qui se déclenche ?) : `tests/evaluations/`, lancées à part avec `claude plugin eval` ; le mode d'emploi est en tête de `tests/evaluations/evaluer.js`.
- **Outils** : `node --test outils/site/*.test.js outils/mesures/*.test.js outils/publication/*.test.js`.
- **CI** : la phase unitaire tourne sur Windows, macOS et Linux à chaque envoi (`.github/workflows/tests.yml`) ; la phase navigateur se lance sur le poste de développement.

Une erreur fréquente et sa parade sont souvent déjà écrites : `plugins/pulse-motion/references/pieges.md` (les pièges d'une scène, chacun avec son symptôme et sa parade) et les « Signaux d'alerte » de `references/moteur.md`.

## Les règles

1. **Aucune dépendance npm**, aucun service cloud, aucune ressource en ligne. Une petite bibliothèque sous licence permissive peut être embarquée dans `vendor/<nom>/`, avec son `PROVENANCE.md` et sa notice ; une réécriture courte est préférée. Python, ffmpeg et whisper restent facultatifs.
2. **Tout se fabrique sur l'ordinateur.** Une vidéo ne charge rien sur internet, ni à l'aperçu ni à l'export. Le réseau ne sert que pendant la préparation, avec l'accord explicite de la personne (filmer un site, tirer une charte d'un site).
3. **Déterminisme.** L'image ne dépend que du temps : même projet, mêmes images. Jamais de `setTimeout`, de transition CSS ou de hasard non semé dans une scène ; une source en temps réel (application filmée, vidéo importée) est figée en images dans le projet.
4. **Additif.** Un ajout au moteur, aux styles ou aux contrôles ne change pas l'aspect d'une vidéo existante. Les seuils des contrôles (`scripts/seuils.json`) ne bougent pas sans raison écrite.
5. **En français, sans jargon, sans commande.** Compétences, messages, wiki : la personne parle français et ne voit jamais de commande de terminal, ni de mot comme « JSON », « CSS » ou « preset » (`tests/jargon.test.js`). La description d'une compétence tient en 250 caractères. Le code et ses commentaires sont en français, eux aussi.
6. **Typographie française.** Guillemets « », espace insécable avant `: ; ? !`, apostrophe typographique dans les textes des vidéos (le contrôle `typographie` les corrige), nombres à la française (« 1 250 », « 3,5 »).
7. **Licences.** Le code repris ou adapté d'un projet MIT ou ISC cite son origine en tête de fichier et dans les deux `THIRD-PARTY-NOTICES.md` (racine et plugin), qui restent identiques. Une simple idée y est mentionnée aussi. Rien de sous licence contaminante ou non commerciale.
8. **Version.** Chaque livraison augmente la version dans `plugins/pulse-motion/.claude-plugin/plugin.json` **et** `plugins/pulse-motion/package.json` (`tests/versions.test.js`), dans un commit à part : `chore: version X.Y.Z (résumé en français)`.
9. **Commits** en français, au format conventionnel : `feat(…)`, `fix(…)`, `docs(…)`, `test(…)`, `chore: …`.
10. **Porte de publication.** Avant chaque envoi : `node outils/publication/porte.js`. Elle refuse un chemin de votre ordinateur (votre dossier personnel, le dossier qui contient le dépôt) ou un secret (clé privée, jeton) dans un fichier suivi par git.

## Ajouter un style

Un style est un dossier `plugins/pulse-motion/styles/<id>/` :

| Fichier | Rôle |
|---|---|
| `style.css` | L'allure : mise en page, classes d'entrée (`.entre-bas`…), décor ; tailles en `cqh`, couleurs et polices **seulement** par les variables de la charte (`--c-*`, `--f-*`) |
| `charte.json` | Couleurs et polices par défaut du style |
| `identite.json` | Catégorie, usages, personnalité, signature, à faire, à éviter, mots-clés, palette sonore, provenance |
| `catalogue.json` | Les neuf scènes toutes faites et leurs textes à remplir |
| `scenes/*.html` | Les neuf scènes toutes faites (`titre`, `chiffre`, `liste`, `etape`, `comparaison`, `schema`, `alerte`, `moyeu`, `conclusion`) |
| `polices/` | Les polices embarquées et leur `LICENCES.md` |

Puis :

1. sa fiche en 11 sections, `references/styles/<id>.md` (gabarit et validation : `scripts/lib/fiche-style.js`) ;
2. sa place dans `references/styles/recommandation.json` (styles conseillés par genre) ;
3. `npm test` : `styles-livres`, `fiches-style`, `styles`, `contrat` et `temoin` vérifient les fichiers, la fiche, les scènes remplies de leurs textes d'exemple et le contenu témoin ;
4. le wiki : `node outils/site/medias.js galerie-styles`, puis `node outils/site/galerie.js` (le catalogue montre la boucle, les images témoin et les neuf scènes du style).

Le style d'une personne, lui, se crée par `/pulse-motion:style` et vit dans `~/.pulse-motion/styles/` : rien à ajouter au dépôt.

## Ajouter un effet de particules

1. Une recette `plugins/pulse-motion/effets/<nom>.json` : nom, description, paramètres réglables, calque de rendu et émetteurs. Le format et sa validation sont dans `moteur/particules/recette.js` ; partez d'une recette voisine.
2. La documenter dans `references/particules.md` (ou la partie concernée de `references/particules/`).
3. `npm test` (`particules-recette`, `effets`, `particules-*`), puis la régler en la regardant : `/pulse-motion:atelier-particules`.
4. Le wiki : `node outils/site/medias.js galerie-effets`, puis `node outils/site/galerie.js`.

## Ajouter un mouvement au dictionnaire

Le dictionnaire, `plugins/pulse-motion/references/mouvements/mouvements.json`, donne à chaque mouvement du métier un numéro stable, ses noms (français et du métier), son sens, une phrase pour le demander, quand s'en servir et sa **recette** exacte.

1. Prenez le numéro libre suivant ; **un numéro publié n'est jamais renuméroté, un nom jamais renommé**. Ajoutez-le à la liste figée `references/mouvements/numeros.json`.
2. La recette ne cite que ce que le moteur réalise vraiment : une classe commune `pm-m-*` de `moteur/mouvements.css` (réglable par `--pm-dur`, `--pm-courbe`, `--pm-ampleur`, `--pm-fois`), un attribut (`data-lettres`, `data-camera`, `data-gel`, `data-vitesse`, `data-tween`), une transition du déroulé, ou une combinaison. Ses chiffres viennent du code, jamais d'une estimation.
3. Si l'entrée vient de Motion Prompt, son champ `motionPrompt` donne le numéro d'origine.
4. `npm test` (`mouvements`, `mouvements-css`) ; puis `node outils/site/medias.js galerie-mouvements` et `node outils/site/galerie.js` : l'aperçu de la galerie est rendu à partir de la recette, jamais dessiné à part.

## Ajouter un modèle de vidéo

1. `plugins/pulse-motion/modeles/videos/<id>.json` : genre, format, durée, public, scènes (type de scène toute faite, intention, textes à remplir, durée, transition, mouvements conseillés), styles conseillés, ambiance musicale, phrases à copier et variantes selon le public. La validation est dans `scripts/modeles.js` (`validerModele`) ; `trouverModele` doit reconnaître les sujets qui lui correspondent.
2. Son exemple, `plugins/pulse-motion/exemples/<id>/` (`deroule.json`, `scenes/`, `exemple.json`), **fabriqué par une vraie séance** de `/pulse-motion:creer` lancée avec la phrase publiée, en prenant les réponses conseillées. `exemple.json` garde la phrase, les réponses et les retouches : le wiki les publie telles quelles. Pas de voix dans un exemple publié.
3. `npm test` (`modeles`, `exemple`).
4. Le wiki : `node outils/site/medias.js exemples`, puis `node outils/site/galerie.js` (pages Idées et Exemples).

## Le wiki

- Les pages de `docs/` se lisent sans JavaScript et en `file://` ; l'en-tête, la navigation et le pied viennent de `docs/js/gabarit.js` et `docs/js/donnees.js`.
- Les descriptions des commandes de `docs/js/donnees.js` suivent celles des `SKILL.md` : modifiez-les ensemble.
- Les blocs entre `<!-- galerie:<nom> -->` et `<!-- /galerie:<nom> -->` sont écrits par `node outils/site/galerie.js` : ne les modifiez pas à la main.
- Après une modification de page : `node outils/wiki/indexer.js` (index de recherche) et `node outils/site/liens.js` (liens).
- Publication, par le mainteneur, depuis `main` : `node outils/site/medias.js` (lots touchés), `node outils/site/galerie.js --verifier`, puis `node outils/site/publier.js`, qui construit la branche `gh-pages`. Détails : `outils/site/README.md`.
- Le wiki destiné aux personnes ne montre que les commandes `/pulse-motion:…` de Claude Code, jamais une commande de terminal.

## Signaler un problème, proposer un changement

- Un problème : ouvrez une [issue](https://github.com/jdelauney/pulse-motion/issues) avec la version de Pulse Motion, le système, ce que vous avez demandé et ce qui s'est passé. Ne joignez aucun texte ni fichier d'une vidéo que vous ne voulez pas rendre public.
- Un changement : une branche, des commits au format ci-dessus, `npm test` vert, la porte de publication passée, puis une demande de fusion (pull request) qui dit ce qui change pour la personne.

## Provenance

Pulse Motion reprend ou adapte des idées et du code de projets libres : Motion Prompt, Mediabunny, Lucide, argo, explainroo, rossark-motion-skill, take-one, reanimate, video-director, Lemo-Opuscar… Chaque reprise est décrite dans [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md). La façon d'écrire ce guide (« ajouter un… » pas à pas) suit l'exemple des guides de contributeur de reanimate (Niaz Morshed, MIT).

Licence du dépôt : MIT ([LICENSE](LICENSE)).
