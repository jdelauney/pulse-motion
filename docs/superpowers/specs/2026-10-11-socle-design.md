# Spec – Pulse Motion, brique 1 : le socle

> 2026-10-11 · Statut : à relire · Source : `docs/brief.md`, `aidd_docs/memory/project.md`, `aidd_docs/memory/external/references-motion.md`

## 1. Intention

Permettre à une formatrice sans notion de code (Claire) de produire, dans Claude Code et sur son ordinateur, une vidéo de formation animée en 16:9 de 1 à 3 minutes (texte à l'écran et musique), de la voir aussitôt dans son navigateur, de la retoucher en une phrase et de l'exporter en MP4, sans rien installer d'autre que Node.

### Critères de réussite

- Une vidéo de 15 à 30 s passe du premier message à l'aperçu en quelques minutes (chronométré sur 5 vidéos).
- Le projet de référence « La chaîne du froid » (60 s, 6 scènes) va de bout en bout : déroulé validé, aperçu, retouche, MP4.
- Une retouche simple (« ralentis la scène 3 ») est visible dans l'aperçu en quelques secondes, à la même position de lecture.
- La page HTML livrée est autonome (s'ouvre hors ligne, sans serveur).

### Découpage du projet (rappel)

Le projet complet est découpé en 7 briques, chacune avec son cycle spec → plan → implémentation :

1. **Socle** (cette spec)
2. Contrôles automatiques (complets)
3. Catalogue de styles et charte (plusieurs styles, choix entre 3)
4. Export fidèle (Chrome sans fenêtre + ffmpeg)
5. Audio (musique générée, voix, sous-titres)
6. Modèles et séries
7. Détourage

Le socle contient le strict nécessaire des briques 2 à 4 pour une vidéo de bout en bout : un style, une première série de contrôles, l'export dans le navigateur.

## 2. Décisions de cadrage

| Sujet | Décision | Raison |
|---|---|---|
| Public servi en premier | Formateur | Le plus exigeant sur la simplicité ; cas de Claire |
| Export v1 | Dans le navigateur (WebCodecs + Mediabunny) | Aucune installation ; l'export fidèle arrive en brique 4 |
| Prérequis | Node ≥ 20, bibliothèque standard seulement, aucun `npm install` | Comme pulse-vibe ; installation guidée si absent |
| Forme du projet | Hybride : `deroule.json` (structure, textes, durées) + une scène HTML/CSS/SVG libre par fichier | Vidéos singulières (Claude compose) et retouches fiables (structure en données) |
| Moteur | Écrit pour Pulse Motion, reprenant idées et extraits de showtime (MIT) | showtime (~6 000 lignes) est pensé pour la capture Chrome, pas pour l'export navigateur |
| Courbes | Portage JS de `BZAnimationTool.pas` (auteur : J. Delauney, publié sous MIT dans Pulse Motion) + ressorts en forme close + bézier | Modes composés (Spike, Arch…) absents du CSS |
| Licences | MIT, Apache 2.0, ISC, MPL 2.0, SIL OFL seulement | Décision `0001-licences-compatibles-mit.md` |

**Écarté** : bibliothèque fermée de types de scènes seule (vidéos uniformes, le défaut de Canva) ; reprise intégrale de showtime (trop lourde, mal adaptée à l'export navigateur).

## 3. Architecture

```
pulse-motion/                    (le plugin)
  .claude-plugin/plugin.json
  commands/                      creer, retoucher, exporter, reprendre
  agents/animateur.md            écrit une scène
  hooks/                         rappel de la vidéo en cours au démarrage
  references/                    moteur.md, rythme.md, styles/clair-pedagogique.md
  scripts/                       etat.js, assembler.js, apercu.js, controler.js (Node, stdlib)
  moteur/                        horloge.js, minutage.js, courbes.js, lecteur.js, export.js
  styles/clair-pedagogique/      style.css, scenes/*.html (8 scènes toutes faites), polices/
  vendor/mediabunny/             tel quel, avec LICENSE (MPL-2.0)
  tests/                         node:test + fixtures + navigateur.html

<projet de Claire>/              (une vidéo)
  deroule.json
  scenes/NN-nom.html
  assets/                        logo, images, polices, musique
  sortie/                        <titre>.html, <titre>.mp4, controle.json
  .pulse-motion/etat.json        étape en cours, port de l'aperçu
  .historique/NNN/               copie avant chaque retouche
```

### Unités et responsabilités

| Unité | Rôle | Dépend de |
|---|---|---|
| `etat.js` | Vérifie Node, lit `.pulse-motion/etat.json`, indique l'étape suivante | – |
| `assembler.js` | Valide `deroule.json`, injecte textes et charte dans les scènes, embarque polices/images en `data:`, inclut le moteur, écrit la page autonome | moteur, style |
| `apercu.js` | Serveur HTTP local : sert la page, recharge à chaque changement (SSE) en gardant t, sert le code d'export, reçoit le MP4 et le rapport de débordement | assembler |
| `controler.js` | Contrôles sans navigateur, écrit `sortie/controle.json` | minutage, courbes |
| `moteur/horloge` | Temps virtuel, `seek(t)`, gel des animations, aléa reproductible | – |
| `moteur/minutage` | Résout les temps relatifs, rythme, transitions ; pose `--p` et `data-etat` | – (pur) |
| `moteur/courbes` | Courbes, composition, échantillonnage CSS `linear()`, `data-tween` | – (pur) |
| `moteur/lecteur` | Interface d'aperçu (absente du MP4) | horloge |
| `moteur/export` | Capture image par image, encodage, envoi du MP4 | horloge, Mediabunny |

`minutage` et `courbes` sont des modules purs, chargés à la fois par le moteur (navigateur) et par les scripts Node (contrôles).

## 4. Format du projet

### `deroule.json`

Source de vérité, validée par Claire, lue par tous les scripts.

```json
{
  "version": 1,
  "titre": "La chaîne du froid",
  "genre": "formation",
  "parcours": "rapide",
  "format": { "ratio": "16:9", "ips": 30 },
  "style": "clair-pedagogique",
  "charte": {
    "couleurs": { "primaire": "#0a6cff", "accent": "#ffb000", "fond": "#ffffff", "texte": "#1a1a1a" },
    "polices": { "titres": "Figtree", "texte": "Inter" },
    "logo": "assets/logo.svg"
  },
  "musique": { "fichier": "assets/musique.mp3", "volume": 0.6 },
  "scenes": [
    {
      "id": "intro",
      "fichier": "scenes/01-intro.html",
      "duree": 6,
      "rythme": 1,
      "intention": "Poser la question qui accroche",
      "textes": { "titre": "Pourquoi 4 °C ?", "sous": "3 minutes pour comprendre" },
      "transition": "fondu"
    }
  ]
}
```

| Champ | Obligatoire | Valeurs |
|---|---|---|
| `version` | oui | `1` |
| `titre`, `genre` | oui | texte ; genre ∈ `formation`, `produit`, `storytelling`, `social` |
| `parcours` | oui | `rapide` (défaut) ou `accompagne` |
| `format.ratio` | oui | `16:9` (défaut), `9:16`, `1:1` |
| `format.ips` | non | `30` (défaut) |
| `style` | oui | `clair-pedagogique` en v1 |
| `charte` | non | couleurs (hex), polices (nom ou fichier dans `assets/`), logo |
| `musique` | non | fichier importé dans `assets/`, volume 0–1 |
| `scenes[].id` | oui | unique, `[a-z0-9-]+` |
| `scenes[].duree` | oui | secondes, > 0 |
| `scenes[].rythme` | non | `1` par défaut, > 0 |
| `scenes[].textes` | oui | clés libres, valeurs texte |
| `scenes[].transition` | non | `aucune` (défaut), `fondu`, `glissement`, `balayage` |

Les champs des briques suivantes (médias filmés, voix, sous-titres, zones de modèle) s'ajouteront en champs optionnels ; `version` permet de faire évoluer le format.

### Une scène

Fichier `scenes/NN-nom.html` contenant une seule `<section data-scene="<id>">` :

- **Textes** : jamais en dur ; `data-texte="titre"` est rempli par l'assembleur depuis `scenes[].textes`.
- **Temps** : relatifs au début de la scène. `data-start="0.4"` (absolu dans la scène), `data-start="#titre+0.3"` (début de `#titre` + 0,3 s) ou `data-start="#titre:fin+0.3"` (fin de `#titre` + 0,3 s) ; `data-dur="1.2"` (1 s par défaut).
- **CSS** : local à la scène via `@scope`. Tailles en `cqh`. Couleurs et polices seulement via les variables de la charte : `--c-primaire`, `--c-accent`, `--c-fond`, `--c-texte`, `--f-titres`, `--f-texte`.
- **Pas de JavaScript libre**. Seul point d'entrée : `M.chaqueImage("<id>", (p, t) => …)` dans un `<script>` de la scène.

### Calcul des temps

- Durée effective d'une scène = `duree / rythme`.
- Début de la scène n = somme des durées effectives des scènes précédentes − chevauchements de transition (0,5 s par transition autre que `aucune`).
- Les temps internes d'une scène sont multipliés par `1 / rythme`.
- Retouches types : « ralentis la scène 3 » → `rythme` 0,8 ; « laisse plus de temps à la fin » → `duree` augmentée (pause finale plus longue).

## 5. Moteur

### Contrat

L'état visible de la page ne dépend que de t. `M.rendre(t)` produit la même image quel que soit l'ordre des appels précédents.

### `horloge`

- **Mode aperçu** : `requestAnimationFrame` fait avancer t en temps réel ; la musique est calée sur t.
- **Mode capture** : `M.seek(n / ips)`, puis attente que l'image soit prête (`document.fonts.ready`, images décodées) avant de rendre la main.
- Dans les deux modes, toutes les animations sont en pause et positionnées par le moteur : CSS et WAAPI via `document.getAnimations()` et `currentTime` ; SMIL via `pauseAnimations()` et `setCurrentTime()`.
- `Date`, `performance.now`, `Math.random`, `requestAnimationFrame` sont remplacés par des versions reproductibles (repris de `showtime/runtime/stage.js`, mention MIT conservée).

### `minutage`

- Construit le graphe des `data-start` / `data-dur`, le résout ; une référence circulaire ou inconnue lève une erreur qui nomme la scène et l'élément.
- Applique `rythme` et les chevauchements de transition.
- Pose sur chaque élément animé `--p` (progression 0→1) et `data-etat` (`avant`, `pendant`, `apres`).
- Met les scènes hors de leur fenêtre en `display:none`.

### `courbes`

- `M.courbe(type, mode, param?)` → fonction [0,1] → ℝ.
  - Types : `linear`, `quad`, `cubic`, `quart`, `quint`, `expo`, `sine`, `circle`, `elastic`, `back`, `bounce`, `bell`, `power`, `step`, `swing`, `jitter`, `wave`, `tardis`, `cubic-bezier`, `ressort`.
  - Modes : `in`, `in-inv`, `out`, `out-inv`, `inout`, `outin`, `spike`, `spike-inv`, `arch`, `arch-inv`, `spike-arch`, `spike-arch-inv`, `arch-spike` (portés de `TBZAnimationMode`).
- Opérateurs : `M.mix(a, b, k)`, `M.fondu(a, b)`, `M.echelle(a)`, `M.echelleInverse(a)`.
- `ressort` : forme close paramétrée par `raideur` et `amortissement` (idée de `motion-graphics-main/skills/motion-broll/engine/motion.js`).
- `M.courbeCSS(type, mode, param?, n = 40)` → chaîne CSS `linear(…)`. Au démarrage, le moteur publie `--ease-<type>-<mode>` pour les combinaisons usuelles (types `quad` à `bounce` × modes `in`, `out`, `inout`).
- `data-tween="opacity 0→1 back-out; --compteur 0→1250 cubic-out"` interpole des valeurs à chaque image, sur la fenêtre `data-start`/`data-dur` de l'élément. `M.nombre(v)` formate en français (`1 250`).

### `lecteur` (aperçu seulement)

Barre de lecture graduée par scène avec le nom de la scène courante ; espace (lecture/pause), ←/→ (image), Maj+←/→ (scène), B (boucle sur la scène). Au rechargement, t est conservé.

### Taille visée

~700 lignes pour `horloge` + `minutage` + `lecteur`, ~300 pour `courbes`, ~300 pour `export`.

## 6. Export dans le navigateur

- **Lancement** : bouton « Exporter en MP4 » dans l'aperçu servi par `apercu.js`, ou `/pulse-motion:exporter` qui ouvre l'aperçu en mode export. `export.js` et Mediabunny sont servis par le serveur et ne sont pas embarqués dans la page livrée.
- **Page → image** :
  1. HTML-in-Canvas (`drawElementImage`) si disponible.
  2. Sinon SVG `foreignObject` : `seek(t)`, clone de la scène visible avec styles calculés figés et animations retirées, polices et images déjà en `data:`, dessin dans un canvas.
- **Vidéo** : `VideoEncoder` H.264 (`avc1`) ; 1920×1080 (16:9), 1080×1920 (9:16), 1080×1080 (1:1) ; 30 ips.
- **Audio** : musique mixée par `OfflineAudioContext` (volume, fondu d'entrée 0,5 s et de sortie 1,5 s), encodée en AAC par `AudioEncoder`. Si l'AAC n'est pas disponible, export sans son avec message explicite.
- **Assemblage** : Mediabunny (MPL-2.0) en MP4.
- **Écriture** : le MP4 est envoyé par morceaux à `apercu.js`, écrit dans `sortie/.<titre>.mp4.part`, renommé en `sortie/<titre>.mp4` seulement après relecture réussie.
- **Relecture** : nombre d'images = durée × ips, durée conforme, première et dernière images non noires.
- **Interface** : barre de progression (image n / total, temps restant estimé), bouton Annuler.
- **Navigateurs visés** : Chrome et Edge. Ailleurs, message expliquant pourquoi, avec la suggestion d'ouvrir l'aperçu dans l'un d'eux.
- **Performance attendue** : 30 à 100 ms par image en voie `foreignObject`, soit 3 à 9 min pour 3 min de vidéo. À mesurer sur le projet de référence.

## 7. Guidage

### Commandes

| Commande | Rôle |
|---|---|
| `/pulse-motion:creer` | Nouvelle vidéo : questions, déroulé, fabrication, aperçu |
| `/pulse-motion:retoucher <phrase>` | Applique une retouche ; « annule » restaure l'état précédent |
| `/pulse-motion:exporter` | Lance l'export MP4 ; la page HTML autonome est déjà dans `sortie/` |
| `/pulse-motion:reprendre` | Reprend la vidéo en cours selon `etat.js` |

Un hook de démarrage de session rappelle la vidéo en cours s'il en existe une dans le dossier courant.

### Parcours rapide (défaut)

1. **Ronde de 4 questions au plus**, chacune avec une option « (Recommandé) » : sujet et objectif, durée, public, parcours. Format 16:9 par défaut. Charte facultative (logo ou couleurs, en fichier ou en mots).
2. **Déroulé** : Claude écrit `deroule.json` et le présente en tableau (n°, scène, texte à l'écran, durée ; durée totale). **Seul accord demandé.**
3. **Fabrication** : un sous-agent `animateur` par scène, en parallèle, part d'une des scènes toutes faites du style ou compose librement ; puis `assembler` → `controler` → corrections automatiques (2 tours au plus) → ouverture de l'aperçu.
4. **Bloc de fin** : ✅ ce qui est fait, 📄 où sont les fichiers, ➡️ quoi faire ensuite.

### Parcours accompagné

Ajoute l'accord sur le **style** (planche d'images clés de 2 scènes, en PNG produites par la voie de capture de l'export) et l'accord sur la **vidéo finale**.

### Retouche en une phrase

1. Copie de `deroule.json`, `scenes/` et `assets/` dans `.historique/NNN/`.
2. Classement : texte (JSON), rythme/durée (JSON), visuel (HTML de la scène), global (charte, musique).
3. Application, `assembler`, `controler`, rechargement de l'aperçu à la même position.

## 8. Style v1 `clair-pedagogique`

- `style.css` fondé sur les variables de la charte ; valeurs par défaut si pas de charte.
- Polices OFL fournies : Figtree, Inter. Une police de la charte est embarquée si son fichier est fourni, sinon remplacée par la plus proche des polices fournies (et Claire en est informée).
- `references/styles/clair-pedagogique.md` : bloc « l'essentiel », règles de rythme (décalage 30 ms entre éléments d'une liste, pause finale ≥ 0,5 s, titres ~7 cqh), table de signaux d'alerte.
- 8 scènes toutes faites : titre, liste révélée, chiffre clé avec compteur, comparaison, étape numérotée, alerte, schéma fléché SVG, conclusion avec logo.
- 3 transitions : fondu, glissement, balayage.
- N'utilise ni `filter: url()`, ni `mix-blend-mode`, ni `backdrop-filter`.

## 9. Contrôles v1

Résultat dans `sortie/controle.json` : liste de `{ regle, gravite: "erreur" | "alerte", scene, element?, message }`, message en français.

**Dans `controler.js` (sans navigateur)**

| Règle | Seuil |
|---|---|
| Référence `data-start` invalide ou circulaire | erreur |
| `data-texte` sans valeur dans le déroulé | erreur |
| Temps mort (aucun élément `pendant`) | > 2,5 s → alerte |
| Pause finale de la vidéo | < 0,5 s → alerte |
| Durée de scène trop courte pour lire | < 1,5 s + 0,3 s × nombre de mots → alerte |
| Texte trop petit | < 3,5 cqh → alerte |
| Contraste texte / fond de la charte | < 4,5:1 → alerte |
| Effet non rendu par l'export rapide (`filter: url()`, `mix-blend-mode`, `backdrop-filter`) | alerte |
| Police utilisée non embarquée | erreur |

Les seuils sont dans `scripts/seuils.json`.

**Dans la page (aperçu)** : débordement d'un élément `data-texte` hors de son cadre, testé à 5 instants par scène ; rapport envoyé à `apercu.js` et fusionné dans `controle.json`.

## 10. Erreurs

| Situation | Comportement |
|---|---|
| Node absent ou < 20 | `etat.js` s'arrête et donne la marche à suivre selon le système ; rien d'autre n'est lancé |
| `deroule.json` invalide | Validation par schéma écrite à la main ; message qui nomme le champ et la scène ; Claude corrige avant d'assembler |
| Scène en erreur | La page est produite quand même ; la scène fautive affiche un panneau d'erreur dans l'aperçu |
| Port de l'aperçu pris | Port suivant essayé ; port retenu écrit dans `.pulse-motion/etat.json` |
| Export impossible | Message clair, suggestion Chrome ou Edge |
| Export interrompu ou relecture en échec | Fichier `.part` supprimé ; rien dans `sortie/` |
| Retouche ratée | « annule » restaure depuis `.historique/` |

## 11. Tests

- **`courbes`** (`node:test`) : valeurs connues à 0, 0,5 et 1 pour chaque type et mode ; continuité de `inout`, `spike`, `arch` en 0,5 ; `courbeCSS` fidèle à 1 % près ; `ressort` converge vers 1.
- **`minutage`** : références relatives, détection des cycles, effet de `rythme` et des chevauchements, sur des déroulés d'exemple.
- **`assembler` et `controler`** : projets d'exemple dans `tests/fixtures/`, sorties attendues (page produite, liste des contrôles).
- **Moteur dans le navigateur** : `tests/navigateur.html` vérifie que `seek(t)` donne la même image en y arrivant par des chemins différents (0→t, 5→t). Lancée à la main dans Chrome en v1.
- **De bout en bout** : projet « La chaîne du froid » (60 s, 6 scènes) produit, contrôlé, exporté ; délai du premier message à l'aperçu chronométré.

## 12. Hors périmètre du socle

Choix entre plusieurs styles, export fidèle, musique générée, voix, sous-titres, médias filmés, détourage, modèles et séries, partage avec un client, déclinaison multilingue. Le format de `deroule.json` est prévu pour les accueillir sans rupture.

## 13. Provenance et licences

| Origine | Licence | Usage |
|---|---|---|
| `showtime-main/skills/showtime/runtime/stage.js` | MIT | Extraits (horloge virtuelle, aléa reproductible), mention conservée |
| `hyperframes-main` | Apache 2.0 | Idées (linter orienté erreurs d'IA, adaptateurs déterministes) |
| `motion-graphics-main/skills/motion-broll/engine/motion.js` | MIT | Idée des ressorts en forme close |
| `motion-design-main` | aucune | Inspiration seulement (règles de rythme reformulées) |
| `BZAnimationTool.pas` | auteur du projet | Porté en JS et publié sous MIT |
| Mediabunny | MPL-2.0 | Fichier inchangé dans `vendor/`, licence jointe |
| Figtree, Inter | SIL OFL | Polices fournies avec le style |
