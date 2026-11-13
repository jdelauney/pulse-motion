# Architecture de Pulse Motion

## In English, in short

Pulse Motion turns a sentence into a motion design video, entirely on the user's computer. Claude (through the plugin's **skills**) writes a **timeline** (`deroule.json`: scenes, texts, durations, transitions, music), which the user approves; the **animateur** agent writes each scene as a small HTML fragment animated with CSS and SVG; the **assembler** (`scripts/assembler.js`) inlines texts, brand colours, fonts, images, sound and the **engine** (`moteur/`) into one self-contained HTML page. The engine is a deterministic clock: every visible state is a pure function of time `t` (timing, easing curves, camera, transitions, particles, characters, mixed audio). The **checker** (`scripts/controler.js`) renders the page in headless Chrome and measures it (overflow, overlap, contrast, reading time, flashes, sound), fixing safe cases itself. The **exporter** produces an MP4 either in the browser (WebCodecs + Mediabunny) or, when ffmpeg is installed, by capturing exact frames (high-fidelity export). Personal data (brand kits, own styles, tools) lives in `~/.pulse-motion/`. Everything user-facing is in French and never shows a command; this document is in French. `references/moteur.md` remains the reference for Claude; this file is its human-oriented counterpart. See also [CONTRIBUTING.en.md](CONTRIBUTING.en.md).

---

Ce document explique comment une vidéo est fabriquée, pour un développeur qui veut comprendre le code ou y contribuer. Les consignes exactes que lit Claude restent dans `plugins/pulse-motion/references/` (en particulier `references/moteur.md`, la référence de l'écriture des scènes) ; ce texte en est la version pour un humain. Pour installer le dépôt et lancer les tests : [CONTRIBUTING.md](CONTRIBUTING.md). Tous les chemins ci-dessous sont relatifs à `plugins/pulse-motion/`.

## 1. La chaîne de fabrication

```
idée (une phrase)
  │  compétence creer : questions, modèle de vidéo, style conseillé
  ▼
deroule.json ──── validé par la personne (le seul accord en parcours rapide)
  │  agent animateur, une scène chacun, en parallèle
  ▼
scenes/NN-id.html
  │  scripts/assembler.js : textes, charte, couleurs lisibles, polices, images, son, moteur
  ▼
sortie/<titre>.html  ── page autonome, lisible sans connexion
  │  moteur/ : horloge, minutage, courbes, caméra, transitions, son, particules, personnages
  ├──► aperçu (scripts/apercu.js) : la page servie sur 127.0.0.1, rechargée à chaque changement
  ├──► contrôle (scripts/controler.js) : rendu dans Chrome sans fenêtre, mesuré, corrigé quand c'est sûr
  └──► export (scripts/exporter.js) : MP4 dans le navigateur, ou fidèle avec ffmpeg
```

### 1.1 L'idée et le déroulé

La compétence `creer` (`skills/creer/SKILL.md`) pose une petite ronde de questions (durée, format, public, parcours, musique, voix), cherche le modèle de vidéo qui correspond au sujet (`scripts/modeles.js`, `modeles/videos/*.json`) et propose des styles (`references/styles/recommandation.json`). Elle écrit le **déroulé**, `deroule.json`, contrat central du projet, validé par `scripts/lib/deroule.js` :

- `titre`, `genre`, `parcours`, `format` (`ratio` 16:9, 9:16, 1:1 ou 4:5 ; `ips`), `style`, `charte` (réglages ponctuels), `musique`, `sousTitres`, `bruitages` ;
- `scenes[]` : `id`, `fichier`, `duree`, `transition` (celle de la scène qui **entre**), `rythme` (étire tous les temps de la scène), `intention`, `textes` (clé → texte à l'écran), `voix`, `mouvements` (numéros du dictionnaire), `type` (nom de la scène toute faite du style dont elle vient).

Les textes ne s'écrivent jamais dans le HTML d'une scène : « change le titre » ne touche que le déroulé.

### 1.2 Les scènes

L'agent `animateur` (`agents/animateur.md`) écrit une scène à la fois : un fichier `scenes/NN-id.html` qui contient une seule `<section data-scene="id">`. Il part d'une scène toute faite du style (`styles/<style>/scenes/*.html`) ou compose la sienne. Il lit le tronc `references/moteur.md` et seulement les parties dont la scène a besoin (`references/moteur/`, `references/rythme/`, `references/particules/`…), pour garder peu de jetons.

### 1.3 L'assemblage

`scripts/assembler.js` produit `sortie/<titre>.html`, une page **autonome** :

- textes injectés dans les `data-texte` (`scripts/lib/scenes.js`) ;
- charte finale (`scripts/lib/fusion-charte.js`) : valeurs par défaut, puis charte du style, puis `charte/charte.json` du projet, puis réglages du déroulé ; ton clair ou sombre ; couleurs lisibles calculées ;
- polices, images, logo et sons **embarqués** dans la page (`scripts/lib/embarquer.js`, `scripts/lib/police.js`) : aucune ressource en ligne ;
- effets de particules, personnages, écrans filmés, calque de dessin, shaders préparés par leurs modules de `scripts/lib/` ;
- le moteur à la carte : seuls les groupes de modules dont la vidéo a besoin sont inclus (`scripts/lib/groupes-moteur.js`, `moteur/absents.js`), puis minifiés.

### 1.4 Le moteur

`moteur/` est inclus dans chaque page. Sa règle : **l'état visible ne dépend que de t** (`moteur/horloge.js`). Rien n'avance tout seul : l'aperçu, le contrôle et l'export demandent chacun « l'image à t », et obtiennent la même.

| Module | Rôle |
|---|---|
| `horloge.js`, `lecteur.js` | Le temps de la vidéo, la barre de lecture |
| `minutage.js` | Temps absolus des scènes et des éléments (`data-start`, `data-dur`, références `#id:fin`, ancres sur la voix `mot:`, temps musicaux `4t`) |
| `courbes.js`, `tween.js` | Courbes d'animation et interpolation `data-tween` |
| `transitions.js` | Transitions d'entrée d'une scène (CSS) ; `shaders/` pour celles par shader |
| `camera.js`, `temps.js` | Caméra `data-camera` et parallaxe ; image figée `data-gel`, accéléré `data-vitesse` |
| `lettres.js`, `tailles.js` | Texte lettre par lettre ou mot par mot ; taille ajustée d'un texte |
| `audio.js`, `mixage.js`, `synthe/`, `sonie.js` | Un seul mixage hors temps réel (voix, musique composée, bruitages), baisse de la musique sous la voix, sonie |
| `sous-titres.js`, `sous-titres-rendu.js` | Cartons de sous-titres calés sur les mots |
| `particules/` | Effets de particules simulés à graine (recettes de `effets/`) |
| `personnages/`, `squelette.js`, `clips.js`, `vivant.js`, `habillage-*.js` | Personnages : squelette 2.5D, poses, mouvements, expressions, habillages (registre unique `personnages/habillages.js` : la scène, la validation, l'assemblage et l'atelier y lisent leur liste) |
| `ecran.js`, `pointeur.js`, `film.js`, `blocs/`, `cadres/` | Écrans des tutoriels de logiciel : application filmée lue image par image, pointeur, clics, projecteur |
| `dessin/` | Calque de dessin des vidéos explicatives : flèches, annotations, tracé à main levée, graphiques, code |
| `mouvements.css`, `base.css`, `ecran.css` | Classes communes à tous les styles (`pm-m-*` du dictionnaire), mise en page de base |
| `mesures.js`, `pixels.js`, `releve.js`, `debordement.js` | Mesures pour le contrôle (Chrome sans fenêtre) |
| `export.mjs`, `export-ui.mjs`, `capture.js` | Export dans le navigateur (servi par l'aperçu seulement, jamais dans la page livrée) |

### 1.5 Le contrôle

`scripts/controler.js` assemble la page, fait les contrôles rapides (déroulé, typographie, temps de lecture, contraste de la charte), puis rend la vidéo dans Chrome ou Edge sans fenêtre et la mesure : débordements, chevauchements, marges, zones des boutons des réseaux, contraste réel derrière chaque texte, flashs, textes fugaces, temps morts, son (voix couverte, silences). Les seuils sont dans `scripts/seuils.json` ; les règles et leur sens dans `references/controles.md`. Il corrige seul les cas sûrs (typographie, durées), après une copie d'historique, et écrit `sortie/controle.json`. Le rendu est incrémental : seules les scènes dont l'empreinte a changé sont mesurées de nouveau.

### 1.6 L'export

`scripts/exporter.js` choisit la voie :

- **fidèle** (`scripts/export-fidele.js`), quand ffmpeg est là : vraies captures de chaque image par le protocole de Chrome (`scripts/lib/cdp.js`, maison, sans Playwright), en segments alignés sur les scènes et en parallèle, gardés d'un export à l'autre sous l'empreinte de leurs pixels, puis assemblés par ffmpeg avec le son de la page ;
- **dans le navigateur** (`moteur/export.mjs`, WebCodecs et Mediabunny), sans rien installer.

Les réglages par usage (web, réseaux, présentation, master, courriel, brouillon) sont dans `scripts/usages.json`. La vidéo livrée est vérifiée (`sortie/verification.json`).

### 1.7 Autour de la chaîne

- **Aperçu** (`scripts/apercu.js`) : serveur local sur 127.0.0.1 seulement, derrière une garde commune (`scripts/lib/garde-locale.js`) ; il surveille le projet et recharge la page à la même position.
- **Historique** (`scripts/historique.js`) : une copie avant chaque retouche, annuler, rétablir, versions nommées, avant / après (`scripts/planche-retouche.js`).
- **Planches** : images de la vidéo que Claude regarde pour juger son travail (`scripts/regard.js`), et l'agent `critique` qui relit la vidéo comme un spectateur.
- **État** (`.pulse-motion/etat.json` dans le projet) : l'étape de la vidéo, pour `/pulse-motion:reprendre`.

## 2. La charte et ses variables

Une scène n'écrit jamais une couleur, une police ou une taille en dur. Elle utilise :

| Variable | Sens |
|---|---|
| `--c-primaire`, `--c-accent`, `--c-fond`, `--c-texte` | Couleurs de la charte |
| `--c-primaire-lisible`, `--c-accent-lisible` | La couleur de la marque, foncée ou éclaircie juste assez pour se lire sur `--c-fond` (calculées par l'assemblage) |
| `--c-sur-primaire`, `--c-sur-accent` | Noir ou blanc, pour un texte posé sur un aplat de cette couleur |
| `--f-titres`, `--f-texte` | Polices des titres et du texte |
| `cqh` | Unité de taille : 1 % de la hauteur de l'image, pour que tout suive le format (16:9, 9:16…) |
| `#pm-scene[data-ton="sombre"]` | Le ton de la vidéo, clair ou sombre |
| `--ease-<type>-<mode>` | Courbes d'animation dans le CSS (`--ease-back-out`…) |
| `--pm-dur`, `--pm-courbe`, `--pm-ampleur`, `--pm-fois` | Réglages des mouvements communs `pm-m-*` |

La charte d'une personne se garde dans `~/.pulse-motion/chartes/` et s'applique à une autre vidéo ; celle du projet est dans `charte/charte.json` (logo, couleurs, polices).

## 3. Les conventions d'une scène

- Une seule `<section data-scene="<id>">` par fichier ; son CSS propre dans un `<style>` avec `@scope { … }`.
- **Minutage** : `data-start` (relatif au début de la scène, ou à un autre élément : `#titre+0.3`, `#titre:fin+0.2`, ou à un mot de la voix : `mot:froid`), `data-dur` (1 s par défaut, `scene` jusqu'à la fin). Le moteur pose sur chaque élément minuté `--p` (progression 0 → 1) et `data-etat` (`avant`, `pendant`, `apres`).
- **Faire bouger** : une animation CSS calée par le moteur (`animation: … both`), `--p` dans le CSS, `data-tween`, ou, rarement, `M.chaqueImage` (seul JavaScript permis, à hasard semé). Jamais de `transition:` CSS ni de `setTimeout`.
- **Mouvements nommés** : le dictionnaire `references/mouvements/mouvements.json` donne la recette exacte de chaque mouvement du métier, par son numéro.
- **Effets** : `<div data-effet="confettis" data-start="…" data-dur="…">`, recettes dans `effets/`, réglages par `data-reglages` et `data-graine`.
- **Personnages** : `<div data-personnage="touffu">` et ses actions minutées (`<i data-action="marcher" …>`).
- **Ce que voit le contrôle** : les éléments de contenu (`data-texte`, images, logo, SVG) ; `data-decor` ou `.decor` pour le pur décor, `data-superpose` pour un chevauchement voulu.
- **Interdits** : ressources en ligne, `filter: url(…)`, `mix-blend-mode`, `backdrop-filter` (l'export dans le navigateur ne les capture pas).

Les pièges courants et leur symptôme : `references/pieges.md`.

## 4. Les médias de la personne

| Média | Où il va | Comment |
|---|---|---|
| Images, captures, logos | `assets/` du projet | Copiés, puis embarqués dans la page (`scripts/lib/embarquer.js`, `scripts/lib/images.js`) |
| Logo et couleurs de la marque | `charte/` du projet | `pulse-motion logo`, `charte depuis-logo` ; `<img data-logo>` dans une scène |
| Polices | `charte/`, `styles/<style>/polices/` ou les polices partagées des styles livrés (`plugins/pulse-motion/polices/<Famille>/`) | `scripts/polices.js` et `scripts/lib/police.js` les trouvent et les embarquent |
| Voix | `voix/<scène>.wav` | Enregistrée dans le studio de l'aperçu ou importée (`scripts/voix.js`), transcrite sur l'ordinateur (whisper), mots alignés pour les ancres `mot:` et les sous-titres |
| Musique | composée par le moteur (`moteur/synthe/`) ou importée | Mixée hors temps réel avec la voix et les bruitages |
| Application filmée, vidéo de l'écran | `films/` du projet | Figée en images avec ses métadonnées (`scripts/filmer.js`), lue image par image par `moteur/film.js` |

## 5. Les données personnelles

Rien n'est envoyé hors de l'ordinateur. Ce qui dépasse une vidéo vit dans `~/.pulse-motion/` (ou le dossier de `PULSE_MOTION_DOSSIER`) :

| Chemin | Contenu |
|---|---|
| `chartes/` | Chartes enregistrées (« enregistre ma charte sous le nom dupont ») |
| `styles/` | Styles personnels créés par `/pulse-motion:style` |
| `lexique.md` | Glossaire personnel (termes et formes à éviter) |
| `navigateur/` | Profil du navigateur utilisé pour filmer une application, hors de tout projet |
| `whisper/` | Transcription installée sur l'ordinateur |
| `essais/` | Projets d'essai des styles |
| `mesures/`, `encodeurs.json` | Mesures de vitesse de cet ordinateur (temps restant de l'export) |

Dans un projet, `.pulse-motion/` garde l'état et l'avancement, `.historique/` les copies des retouches, et `sortie/` ce qui est fabriqué.

## 6. Les références lues par Claude

| Référence | Sujet |
|---|---|
| `references/moteur.md` et `references/moteur/` | Écrire une scène pour le moteur |
| `references/rythme.md` et `references/rythme/` | Rythme, structure, temps de lecture |
| `references/controles.md` | Les règles du contrôle et leurs seuils |
| `references/realisation.md` | La méthode de réalisation chiffrée (doctrine) |
| `references/directions.md`, `revue.md`, `anti-cliches.md`, `compositions.md`, `recettes-rythme.md`, `scenes-temoins.md` | Savoir-faire de réalisation |
| `references/styles/*.md` | Fiches des styles en 11 sections |
| `references/mouvements/` | Le dictionnaire de mouvements |
| `references/particules.md`, `audio.md`, `personnages.md`, `ecran.md`, `explication.md`, `sorties.md` | Effets, son, personnages, écrans filmés, vidéos explicatives, livrables |
| `references/remarques.md`, `reglages-rapides.md`, `demandes.md` | Ce que dit la personne et ce qu'il faut régler |

Elles se lisent par `pulse-motion reference <nom>` et sont vérifiées contre le code par les tests (`tests/documentation.test.js`).

## 7. Les principes qui tiennent l'ensemble

- **Déterministe** : même projet, mêmes images, sur l'aperçu, au contrôle et à l'export ; prouvé par les tests.
- **Local** : aucun service en ligne, aucune dépendance npm ; ffmpeg, Python et whisper facultatifs.
- **Additif** : rien de nouveau ne change une vidéo existante ; la non-régression visuelle le vérifie.
- **Par la phrase** : la personne ne voit jamais de commande ; la commande `pulse-motion` est l'outil de Claude, pas le sien.
- **Mesuré** : ce qui se juge à l'œil se mesure d'abord (contraste, lisibilité, sonie), et Claude regarde les planches avant de dire que c'est bon.
