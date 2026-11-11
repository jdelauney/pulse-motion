# Mentions de tiers

## Motion Prompt

Le dictionnaire de mouvements (`references/mouvements/mouvements.json`) reprend, traduits en français et adaptés au moteur Pulse Motion, des noms du métier, leur sens et des idées de phrases-exemples et de descriptions publiés par Motion Prompt. Le champ `motionPrompt` d'une entrée donne le numéro de l'entrée d'origine. Aucun code de Motion Prompt n'est repris : chaque mouvement est réalisé par le moteur de Pulse Motion.

- Projet : https://github.com/showheyohtaki/motion-prompt
- Auteur : Shohei Ohtaki (大滝昇平)
- Licence : MIT

```
MIT License

Copyright (c) 2026 Shohei Ohtaki

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Mediabunny

L'export MP4 dans le navigateur utilise Mediabunny 1.61.3, repris sans modification (fichier non modifié) dans `plugins/pulse-motion/vendor/mediabunny/` (provenance, empreinte et texte de la licence dans ce dossier). Il est servi par l'aperçu pour l'export (usages, taille visée par une reconversion) et n'est jamais embarqué dans la page livrée.

- Projet : https://mediabunny.dev
- Version : 1.61.3 ; source : https://cdn.jsdelivr.net/npm/mediabunny@1.61.3/dist/bundles/mediabunny.min.mjs
- Licence : Mozilla Public License 2.0 (MPL-2.0, `plugins/pulse-motion/vendor/mediabunny/LICENSE`)

## Lucide

Les icônes posées dans une scène (`<svg data-icone="nom">`) et cherchées par `pulse-motion icones` sont celles de Lucide, paquet `lucide-static` 1.71.0, dans `plugins/pulse-motion/vendor/lucide/` (provenance, empreinte et texte de la licence dans ce dossier). Les dessins ne sont pas modifiés : leurs formes sont réécrites en chemins équivalents (`icones.json`), avec les étiquettes anglaises de Lucide (`etiquettes.json`). Seules les icônes utilisées entrent dans la page livrée. Les mots-clés français (`references/icones-fr.json`) sont écrits pour Pulse Motion. Une partie des icônes dérive de Feather (licence MIT, ci-dessous avec celle de Lucide).

- Projet : https://lucide.dev (https://github.com/lucide-icons/lucide)
- Version : 1.71.0 ; source : https://registry.npmjs.org/lucide-static/-/lucide-static-1.71.0.tgz
- Licence : ISC (Lucide Icons and Contributors) ; MIT pour les icônes dérivées de Feather (Cole Bemis)

```
ISC License

Copyright (c) 2026 Lucide Icons and Contributors

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

---

The following Lucide icons are derived from the Feather project:

airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out

The MIT License (MIT) (for the icons listed above)

Copyright (c) 2013-present Cole Bemis

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## argo

L'export par usage (`plugins/pulse-motion/scripts/usages.json`, `scripts/lib/ffmpeg.js` : `argsVideo`, `VERS_BT709`) traduit de près les arguments d'encodage de `src/export.ts` : conversion et étiquettes BT.709, `aq-mode=3`, `-movflags +faststart`, réglages de qualité de la présentation (CRF 16, `slow`). La détection des encodeurs de la carte graphique du brouillon (`detecterEncodeurs` : ordre NVENC, Quick Sync, AMF, VideoToolbox, essai d'une image, repli logiciel) suit `src/gpu-encoder.ts`. Les livrables de diffusion reprennent de près la vignette intégrée en flux `attached_pic`, assemblée sans `-shortest` (`src/export.ts` ; `assemblerSegments`), le fichier `;FFMETADATA1` des chapitres (`src/chapters.ts` ; `ffmetadata` de `scripts/lib/livrables.js`) et la palette du GIF en deux passes (`palettegen=stats_mode=diff`, `paletteuse` à tramage de Bayer, `src/export.ts` et `src/clip.ts` ; `encoderGif`), ainsi que l'extraction par scène (`src/clip.ts`, idée). La forme d'onde de la voix et les vignettes des scènes de l'aperçu (`plugins/pulse-motion/moteur/apercu/piste.mjs`) reprennent les idées de `preview-waveform.ts` (`computeWaveform` : pics par colonne) et de `sceneThumbnails`. Le code est réécrit en JavaScript ; aucun fichier n'est copié.

La transition `fuite-lumiere` (`plugins/pulse-motion/shaders/fuite-lumiere.wgsl`) traduit en WGSL `src/transitions/shaders/light-leak.glsl` (original d'argo : éclair en triangle au carré, maximum à mi-parcours, fondu des scènes en `smoothstep`), sa couleur chaude remplacée par la teinte claire de la couleur de la marque. Les teintes sombre (× 0,35) et claire (vers le blanc à 65 %) tirées d'une seule couleur reprennent les chiffres de `src/transitions/accent.ts` (`teinteSombre`, `teinteClaire` du prélude de `plugins/pulse-motion/moteur/shaders/code.js`). Mention de courtoisie : les transitions `brulure`, `lentille`, `iris` et `deformation` partent des idées de `ridged-burn`, `gravitational-lens`, `sdf-iris` et `domain-warp`, qu'argo adapte de HyperFrames (HeyGen, Apache-2.0) ; elles sont réécrites à partir de l'idée, sans aucune ligne de code reprise.

Les écrans des tutoriels de logiciel (spec S6) adaptent de près : le pointeur à trajets de Bézier à graine de `src/human-cursor.ts` (`buildHumanCursorPath`, `seededRandom` : courbure au plus 96 px ou 13 % de la distance, points de contrôle à 32 % et 72 %, accélération et freinage cubiques, bruit borné, durée de 300 à 1 100 ms selon la distance, pause avant le clic, point visé dans le bas gauche du libellé ; `plugins/pulse-motion/moteur/pointeur.js`), lui-même inspiré de CloverLabsAI/human-cursor et de feder-cr/invisible_playwright (MIT) ; le cercle de localisation du mode « click » de `src/cursor.ts` (700 ms) ; le projecteur, l'anneau de focus et l'assombrissement de `src/camera.ts` (`spotlight`, `focusRing`, `dimAround` et leurs valeurs par défaut, rendus sans `feGaussianBlur` ; `moteur/ecran.js`, `moteur/ecran.css`) ; l'enchaînement des zooms de `src/camera-move.ts` (`CHAIN_GAP_MS` 1 500, `CHAIN_PAN_MS` 1 000, `detectChainedPairs`, courbe 1 − (1 − p)³ ; `enchainerZooms` de `moteur/camera.js`) ; le cadre « présentation » de `src/frame.ts` (marge 40, coins 12, ombre 0,5) ; les blocs génériques de `src/blocks/` (notification, publication, carte d'application, bandeau de nom, idée des consignes `showActions` ; `moteur/blocs/`), sans l'aspect d'aucune marque. Le dessin de la flèche, les blocs et leurs styles sont écrits pour Pulse Motion.

Le tournage d'une application (spec S6, plan 2 : `plugins/pulse-motion/scripts/lib/tournage.js`) reprend le principe de `src/cdp-screencast.ts` (images du screencast datées par leur instant de peinture, accusées aussitôt reçues, puis ramenées à une cadence fixe en gardant la dernière image peinte avant chaque instant) et celui de `src/record.ts` (échelle forcée au lancement, qualité JPEG 80 au-delà de l'échelle 1) ; les couleurs des bords du cadre « présentation » suivent `probeEdgeColors` de `src/media.ts` (2-moyennes des bords d'une réduction à 16 × 16). L'import d'une vidéo de l'écran ou d'une animation (plan 4 : `plugins/pulse-motion/scripts/lib/import.js`) suit les principes de `src/import.ts` (formats acceptés, sonde de la durée et de la taille avant de décoder). Le code est réécrit ; rien n'est copié.

- Projet : https://github.com/shreyaskarnik/argo
- Auteur : Shreyas Karnik
- Licence : MIT

```
MIT License

Copyright (c) 2026 Shreyas Karnik

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## explainroo

La garde des serveurs locaux (`scripts/lib/garde-locale.js` : hôte et origine vérifiés, fichiers servis filtrés, liens symboliques refusés) et l'écriture atomique en fichier `.part` (`scripts/lib/fichiers.js`) suivent les principes du serveur local d'explainroo (`src/server.js`). La lisibilité sur un petit lecteur (`readability.js` : 854 px, 16 px ; règle `texte-petit-lecteur` de `moteur/mesures.js`), la couleur lisible proposée (`suggestColor`, adaptée à OKLCH : `suggererCouleur` de `scripts/lib/couleurs.js`) et les chiffres de la vérification du fichier (`verify` : `blackdetect`, `silencedetect` à −50 dB pendant 2,5 s ; `scripts/lib/ffmpeg.js`, `moteur/ecoute.js`) en sont des idées et des chiffres, comme les tests sur trois systèmes (`.github/workflows/tests.yml`). Les livrables de diffusion traduisent de près les chapitres de `src/chapters.js` (premier chapitre à 0:00, alertes YouTube à moins de 3 chapitres ou de 10 s, échappement ; `scripts/lib/livrables.js`) et les marges des plateformes de `src/project.js` (`FORMATS` « as of 2026 » : `zonesPlateformes` de `scripts/seuils.json`) ; la couverture sans sous-titres (`src/render.js`) et le GIF à 15 images par seconde et 960 px en sont des idées et des chiffres. Le WebM VP9 à couche alpha (`src/ffmpeg.js` : `yuva420p`, `-auto-alt-ref 0`) et la règle « jamais de flou en brouillon, en GIF ni en transparent » (`src/render.js`) sont repris pour la vidéo à fond transparent et le flou de mouvement. Les noms proches proposés dans les messages (`moteur/proches.js` : « vouliez-vous dire … ? ») reprennent l'idée de `suggest` (`engine/util.js`), réécrite. L'outil du mainteneur qui prépare les icônes Lucide (`outils/icones/preparer.js`, hors du plugin installé) adapte de près `scripts/build-icons.mjs` : formes converties en chemins dans la boîte 24 × 24, noms anciens retrouvés par leur dessin. Le bloc « toast » et la variante « terminal » du bloc « commande » des écrans de tutoriel (`plugins/pulse-motion/moteur/blocs/`) reprennent les idées du kit d'interface d'`engine/ui.js` (message bref avec coche, terminal tapé). Le calque de dessin des vidéos explicatives (`plugins/pulse-motion/moteur/dessin/`, `moteur/releve.js`) adapte de près `engine/stage.js` : options d'apparition et de sortie, graine et hasard stable (`_life`, `_seed`, `rand`, `noise`, `wiggle`), flèches entre éléments (`arrow`, `_arrowLabel`, `_edge` : écart de 14 px au bord, pointe de `épaisseur × 3,2 + 12` px ouverte de ± 0,5 rad, étiquette à 34 px du côté extérieur), annotations au mot (`annotate` : marge de 14 px, ellipse de 1,12 × 1,25, surlignage à 0,38 et 0,3, croix en deux traits) et révélation du tracé (trait sur 78 % de l'entrée, remplissage de 42 à 100 %) ; le relevé des boîtes reprend l'idée de `boundsRecorder` et des genres de `engine/director.js`. Le tracé à main levée (`moteur/dessin/main-levee.js`) suit les principes de Rough.js (MIT, © Preet Shihn) tels qu'utilisés par `engine/pen.js` (double passage, courbure, hachures, ébullition, cache de 4 000 tracés), réécrits en SVG sans en reprendre de code. Les graphiques de données (`moteur/dessin/graphiques.js`, `moteur/dessin/composants.js`) adaptent de près `bars`, `lineChart`, `pie` et `number` d'`engine/stage.js` (axe tracé en 0,5 s, barre qui pousse en 0,9 s, première 0,3 s après l'axe, décalage de 0,22 s, hauteur à 1,12 × la plus grande valeur, largeur de barre de 64 % de sa place ; courbe en 1,6 s, aire en dégradé de 0,35 à 0 après 60 % ; secteurs balayés en 1,2 s depuis midi, étiquette « libellé part % » à l'extérieur ; valeur qui compte avec la barre) ; le code animé (`moteur/dessin/code.js`) traduit `engine/code.js` (coloration d'une ligne, découpe en jetons, appariement des jetons communs par plus longue sous-suite commune, état du passage en 0,8 s : retirés sur la première moitié, nouveaux sur la seconde), la coloration du tableur y étant ajoutée ; les formules en MathML (`scripts/lib/formules.js`) sont écrites à neuf après l'évaluation de `src/math.js` (MathJax écarté). La caméra automatique (`plugins/pulse-motion/moteur/camera-auto.js`) traduit `engine/director.js` et `planCameras` d'`engine/runtime.js` (temps fort de 0,8 s, remplissage de 0,72 et de 0,82, zoom de 2,2 au plus, départ 0,3 s avant l'élément, 2,2 s entre deux mouvements, écart négligeable de 0,08, dérive de 3,5 %, rapprochement d'au moins 1,3 fois tenu 1,5 s et pas plus d'un changement de zoom en 5 s, gros plan gagnant 1,25 fois, marge de 7 %, pas de zoom de 1,06, durée d'un mouvement, recul final, passage par un plan large, courbe quintique, continuité d'une scène à l'autre) ; ses cas de test traduisent `test/director.test.js`. Les bruitages automatiques (`moteur/audio.js`) adaptent la logique de `sfxCues` (`engine/runtime.js` : même son à moins de 0,12 s ignoré, 0,045 s pour un tic, 3 sons au plus par fenêtre de 0,5 s, sons explicites jamais filtrés) et de `number` (`engine/stage.js` : tics d'un compteur) ; l'alignement renforcé (`moteur/aligner.js`) adapte la logique d'`alignWords` et d'`expand` (`src/align.js` : mot écrit pour plusieurs mots entendus et l'inverse, distance relative de 0,34), la lecture des nombres étant réécrite pour le français ; le balisage du texte dit (`[#repère]`, `{affiché|dit}`, `[pause 0.6]`) et l'allure globale reprennent les idées de `src/script.js`, d'`AGENTS.md` et de `src/timeline.js`. La voix de synthèse locale (`plugins/pulse-motion/scripts/lib/voix-locale.js`) reprend de `src/models.js` les noms du modèle et de la voix française (Kokoro-82M, `ff_siwis`), et de `src/voice.js` l'idée de réécouter chaque scène synthétisée par la transcription pour lister les mots mal lus ; le code est écrit à neuf. Hormis cet outil, le code de Pulse Motion est écrit à neuf ; aucun fichier n'est copié.

- Projet : https://github.com/vincentsch/explainroo
- Auteur : Vincent Schmalbach
- Licence : MIT

```
MIT License

Copyright (c) 2026 Vincent Schmalbach

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Voix de synthèse locale (installée chez la personne, jamais distribuée)

La voix de synthèse facultative (`plugins/pulse-motion/scripts/lib/voix-locale.js`, `scripts/voix-locale/synthetiser.py`) appelle, dans un processus séparé, des logiciels que Pulse Motion **ne contient pas et ne distribue pas** : ils sont téléchargés sur l'ordinateur de la personne, avec son accord, dans un environnement Python isolé (`~/.pulse-motion/voix-locale/`).

- Kokoro-82M (modèle de voix) : https://huggingface.co/hexgrad/Kokoro-82M, licence Apache-2.0. Voix `ff_siwis`, entraînée sur le corpus SIWIS (licence CC BY) : la mention « Voix de synthèse Kokoro-82M (Apache-2.0), voix ff_siwis (corpus SIWIS, CC BY) » est ajoutée aux crédits de chaque vidéo qui l'utilise.
- kokoro-onnx (lecture du modèle) : https://github.com/thewh1teagle/kokoro-onnx, licence MIT ; fichiers du modèle publiés avec lui.
- espeak-ng (phonèmes du français), apporté par les dépendances de kokoro-onnx : https://github.com/espeak-ng/espeak-ng, licence GPL-3.0. Le code MIT de Pulse Motion ne s'y lie pas : il lance un processus séparé.

## JetBrains Mono et Libertinus Math

Polices embarquées dans la page d'une vidéo seulement quand elle montre du code (JetBrains Mono 400, © 2020 The JetBrains Mono Project Authors) ou une formule (Libertinus Math, © 2012-2023 The Libertinus Project Authors), depuis `plugins/pulse-motion/vendor/polices/` : SIL Open Font License 1.1, texte complet, sources et empreintes dans `vendor/polices/LICENCES.md`. Fichiers non modifiés.

- Projets : https://github.com/JetBrains/JetBrainsMono, https://github.com/alerque/libertinus
- Licence : SIL Open Font License 1.1

## rossark-motion-skill

La méthode du mouvement vivant des personnages (spec « Mouvement vivant ») reprend la formule de `flow()` (interpolation d'Hermite cubique monotone de Fritsch–Butland, `templates/react-native/motion.ts`), traduite en JavaScript ES5 dans `plugins/pulse-motion/moteur/vivant.js`, avec une variante cyclique écrite à neuf. Les recettes chiffrées (clignement, repos vivant, retard des membres, ombre qui suit la hauteur, écrasement à l'atterrissage, durées des interfaces) et la liste « avant de dire que c'est vivant » sont réécrites en français (`references/mouvement-vivant.md`, `moteur/personnages/partition.js`, `moteur/personnages/scene.js`). Les gestes avancés reprennent aussi ses formules, réécrites : regard qui suit un mobile avec 50 et 140 ms de retard et `attention` (`ChefScene.swift`, `moteur/personnages/interactions.js`), vol pieds pendants (`drawMystery()`, `flotter` dans `partition.js`), lancer balistique calculé à l'arrivée, écrasement au contact et roulement `Δx / r` (`cakeState()`, `drawBall()`, `moteur/personnages/objets.js`). Les contrôles du mouvement (gestes trop brefs, personnages figés, boucles qui sautent, éléments en phase, à-coups de caméra : `moteur/mesures.js`) suivent sa liste des défauts d'un mouvement mécanique (`SKILL.md` § 1.6, § 1.12, § 5, § 7.10), avec nos propres seuils. Les boucles de vie du décor (`moteur/mouvements.css`, section « Vie », et les entrées #069 à #080 de `references/mouvements/mouvements.json` : balancement, flamme, volutes, flottement, lueur, scintillement, engrenage, vibreur, attente, dérive, ondes, pousse) reprennent les amplitudes, périodes et formes des recettes de vie de `SKILL.md` § 3, avec un CSS écrit à neuf ; le déphasage par graine et les fenêtres bornées par la scène sont propres à Pulse Motion. Les motifs #081 (appui : le bouton s'enfonce à 0,97, sur le bouton et non sur son dessin, `SKILL.md` § 7) et #082 (graphique qui se trace, barres l'une après l'autre, `SKILL.md` § 3) en reprennent les chiffres, avec un CSS écrit à neuf (`moteur/mouvements.css`, section « Motifs »). Le cadre de téléphone autour d'une vidéo verticale (`moteur/cadres/telephone.js`) reprend l'idée de son mode « phone », avec un dessin générique et des dimensions écrites à neuf. Aucun dessin ni personnage des démos n'est repris.

- Projet : rossark-motion-skill
- Auteur : rossark0 (GitHub)
- Licence : MIT

```
MIT License

Copyright (c) 2026 rossark0

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## take-one

Les principes de `scripts/life.js` (`blinkLid` : clignement en 110, 40 et 190 ms ; `eyesLead` : les yeux avant la tête ; `settle` : le retard d'un bout sur sa base) sont réécrits dans le moteur des personnages (`moteur/vivant.js`, `moteur/personnages/partition.js`, `moteur/personnages/interactions.js`). Les règles de `text-audit.mjs` (BROKEN, PINNED, SMALL) et de `plate-audit.mjs` (UPSCALE, REPEAT) sont adaptées au DOM dans `moteur/mesures.js` et `scripts/lib/realisation-regles.js` (`texte-casse`, `texte-epingle`, `texte-petit-lecteur`, `image-agrandie`, `image-repetee`, `glyphe-absent`). La règle de `references/motion-kit.md` qui proscrit un zoom avant suivi aussitôt d'un zoom arrière est reprise par le contrôle `a-coup-camera` (`moteur/mesures.js`). Les principes de `gate.mjs` (contrat du code des scènes, air mort de 0,5 %, sauts à 3 fois la médiane de 6 voisines) et de `audio-check.mjs` (masquage de la voix entre 500 Hz et 4 kHz, 3 dB, 80 %), ainsi que la preuve du déterminisme de `gate.mjs` (page froide dans l'ordre et page chauffée à l'envers, PSNR au-dessus de 45 dB, image fautive nommée ; `scripts/lib/determinisme.js`), sous licence Apache-2.0, sont seulement réécrits à partir de leur idée, sans lecture ni copie du code. Le master de l'export par usage (CRF 14, `slow` : `plugins/pulse-motion/scripts/usages.json`) reprend la valeur de `scripts/export.mjs`, sans code ; le passage seul (`--plage`, images de round(début × ips) à round(fin × ips) − 1 : `scripts/lib/livrables.js`) suit la convention `START/END` du même fichier. Le flou de mouvement par sous-images moyennées (`SUB`, `tmix` : `moteur/flou.js`, `scripts/lib/png.js`) et la vidéo à fond transparent en ProRes 4444 (`ALPHA=1` : `scripts/lib/ffmpeg.js`, `scripts/lib/export-transparent.js`) en reprennent l'idée et les réglages, réécrits. Les remarques épinglées sur l'image de l'aperçu (`plugins/pulse-motion/scripts/lib/remarques.js`, `scripts/remarques.js`, `scripts/lib/routes-retouches.js`, `moteur/apercu/remarques.mjs`, `references/remarques.md` § « Remarques épinglées ») adaptent les principes de la salle de relecture (`scripts/review-room/server.mjs` : notes, envoi, « done » ; `index.html` : épingle, capture, repères ; `references/review-room.md` : recopier les mots avant de changer, marquer fait seulement quand la nouvelle version répond, le goût se demande) à l'horloge du moteur, sans le logo ni le nom ; la comparaison de deux versions synchronisées (`moteur/apercu/comparer.mjs`) suit l'idée de `setCmp`. Trois motifs du dictionnaire reprennent des idées et chiffres de `references/motion-kit.md`, réécrits en CSS et en JavaScript : le zoom continu en échelle logarithmique (#086, jeton `log` de `moteur/camera.js`), la pulsation sur les temps de la musique (#083, « beat punches » de 0,012 par temps et 0,03 à la mesure, retombés en 0,12 s environ) et le cercle d'inondation jusqu'au coin le plus loin, rayon × 1,05, en 0,3 à 0,35 s (#090). L'idée d'une histoire témoin unique, jouée par chaque style avec deux images de composition fixe (`assets/previews-src/BOAT-BRIEF.md`), est reprise pour le contenu témoin des styles (`plugins/pulse-motion/references/styles/temoin.json`, `scripts/lib/temoin.js`), avec une histoire et des textes propres à Pulse Motion. Aucun fichier n'est copié, et aucun fichier dérivé d'anidoodle n'est utilisé.

- Projet : https://github.com/talsiach/take-one
- Auteur : Tal Siach
- Licence : MIT

```
MIT License

Copyright (c) 2026 Tal Siach

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## reanimate

La comparaison d'images de la non-régression visuelle du moteur (`scripts/lib/images.js`, `comparerImages` : écart moyen et maximal par canal, carte de différence ; `tests/non-regression-visuelle.test.js` : plancher de bruit mesuré d'abord, seuils d'écart moyen et par image) suit les idées de `compare.ts` et de `references/verify.md`, réécrites sans pixelmatch. La conversion des images capturées en YUV BT.709 plage limitée de l'export (`out_color_matrix=bt709:out_range=tv`, `scripts/lib/ffmpeg.js`) reprend celle de `site/video/scripts/render.ts`. La planche avant / après d'une retouche (`plugins/pulse-motion/scripts/planche-retouche.js` : trois colonnes, avant, après et différences) suit l'idée de `sheet.ts` (`compare`). Six motifs du dictionnaire (`references/mouvements/mouvements.json`, `moteur/mouvements.css`, section « Motifs ») reprennent les motifs décrits par `references/analysis.md` et `references/implementation.md` et montrés par les démos du site (`intro.js`, `pairs.js`, `helix.js`), réécrits : le défilement de logos par `translateX(-50 %)` d'une piste qui contient deux fois la liste, de 10 à 40 s par tour (#087), le suivi retardé (#084), les rémanences derrière un texte à 0,20, 0,11 et 0,06 d'opacité (#085), la roue de sélection (#091), l'avant/après balayé (#088) et l'hélice de vignettes (#093). Aucun exemple du site n'est repris. Les écrans des tutoriels (spec S6) reprennent l'idée de la fenêtre à trois pastilles de `how.js` (`makeWindow`) et de la commande d'installation avec son bouton de copie d'`install.js` (cadres « navigateur » et « fenêtre », bloc « commande »), réécrites. Le guide des contributeurs (`CONTRIBUTING.md`, `CONTRIBUTING.en.md` : « ajouter un style, un effet, un mouvement, un modèle » pas à pas) suit l'idée des guides de `site/README.md` (« Add an example ») et de `clerk-bento/src/widgets/README.md`, réécrite. Aucun fichier n'est copié.

- Projet : https://github.com/NiazMorshed2007/reanimate
- Auteur : Niaz Morshed
- Licence : MIT

```
MIT License

Copyright (c) 2026 Niaz Morshed

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## video-director

Portions adapted from video-director, Copyright (c) 2026 win4r, MIT License. La doctrine de réalisation (`plugins/pulse-motion/references/realisation.md` : posture, cadrans, symptôme → mécanisme → correction, clichés, vérité des chiffres) et la consigne du relecteur (`plugins/pulse-motion/agents/critique.md` : posture, grille, un seul tour) sont réécrites en français à partir de `SKILL.md` et de `references/quality.md` ; les seuils sont adaptés à des formations et à des vidéos de PME. Les analyses d'images et de son (`frame_stats`, `analyse_picture` : images isolées d'une seule image, sauts, images plates ; `analyse_audio` : fenêtres de 100 ms) sont réécrites dans `scripts/lib/series.js`, `scripts/lib/flashs.js` et `moteur/ecoute.js` (`image-parasite`, `saut-image`, `image-figee`, `image-vide`, `voix-couverte`), et `term_in()` dans la règle `terme-cle`. Le calage d'un bruitage sur son pic (« place by peak », `references/sound.md` § 4) est une idée, réécrite dans `plugins/pulse-motion/moteur/audio.js` (`bruitages.calage`, pics de `moteur/synthe/catalogue.js`). La formule centrée du flou de mouvement et le nombre adaptatif de sous-images (`references/craft.md` § 12 : `moteur/flou.js`), et les contrôles de boucle (`scripts/qa_video.py` : `loop`, `duplicate`, `speed_ratio` ; `check_timeline.py` : mesures entières ; `scripts/lib/boucle.js`, règles `boucle-jointure` et `boucle-mesure`) en traduisent de près les seuils. Aucun fichier n'est copié. Les impressions de `references/quality.md` § 5 et 6 (« Cheap », « Feels like a slideshow », « Too fast ») ont inspiré des lignes de `plugins/pulse-motion/references/remarques.md` (idées).

Les valeurs de l'export par usage (`plugins/pulse-motion/scripts/usages.json` : CRF 14 du master, son AAC à 256 kbit/s, brouillon en demi-définition, grain renouvelé environ 12 fois par seconde pour le courriel et le brouillon) reprennent les chiffres de `references/craft.md` § 12, sans code.

- Projet : https://github.com/win4r/video-director
- Auteur : win4r
- Licence : MIT

```
MIT License

Copyright (c) 2026 win4r

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Lemo-Opuscar

Portions adapted from Lemo-Opuscar, Copyright (c) 2026 LemoLab, MIT License. Les seuils chiffrés et les erreurs les plus vues de `DIRECTOR.md` sont réécrits en français dans `plugins/pulse-motion/references/realisation.md` (§§ 3, 5, 6 et 9). La réécoute du mixage par la transcription (`final_asr.py`, règle `voix-inaudible` de `scripts/lib/verification.js`) et la courbe d'activité (`rhythm_report.py`, règle `image-figee`) en sont des idées, comme la détection du rendu graphique logiciel (`browser.mjs`, `warnIfSoftwareGL` : `scripts/lib/carte-graphique.js`), comme l'arrêt de l'export sur une erreur de la page et le verrou avec le numéro du processus (`core/render/video.mjs` : `scripts/lib/capture-fidele.js`, `moteur/export.mjs`, `scripts/export-fidele.js`), et comme les crédits joints à chaque export (`DIRECTOR.md` § 11, `CREDITS` : `scripts/lib/livrables.js`). La table « ce que dit la personne → ce que ça veut souvent dire » et la règle « cinq changements au plus par tour » de `MY-STYLES.md` § 2 sont traduites et adaptées dans `plugins/pulse-motion/references/remarques.md` (options réécrites avec les réglages de Pulse Motion). Le format des fiches de style en 11 sections du gabarit `styles/_template/STYLE.md` (essence et « ce qu'il n'est pas », matières, logique de couleur, typographie, mouvement, caméra, son, gestes natifs, pièges, espace de variation) est traduit et adapté dans `plugins/pulse-motion/references/styles/*.md` et `scripts/lib/fiche-style.js`, avec les champs `uses` et `category_en` de `style.json` (usages et catégorie de `identite.json`) ; les gestes de `swiss-motion` (entrée par masque, suppression au couteau, exception linéaire, deux courbes seulement) sont décrits, sans changer le rendu, dans la fiche du style `minimal`. Les trois groupes de réglages d'un style personnel (sans risque, change son caractère, impossible), la planche de la base à gauche et du style à droite, le journal des changements (`CHANGES.md`) et la version de la bibliothèque notée avec la base (`library_version`) de `MY-STYLES.md` § 1 à § 4 sont adaptés dans `plugins/pulse-motion/references/style-personnel.md` et `scripts/style-perso.js` ; l'idée d'une galerie générée depuis les fiches, qui échoue si un média manque (`styleboard/build.py`), dans `outils/site/galerie.js`. La porte de publication (`outils/publication/porte.js` : aucun chemin de l'ordinateur du mainteneur ni secret dans les fichiers suivis, avant chaque envoi et à la publication du wiki) est une idée de `tools/release.py` (`LOCAL_PATH`, `SECRET`), réécrite. La passe `cathodique` (`plugins/pulse-motion/shaders/cathodique.wgsl`) traduit en une passe WGSL le compositeur de `core/post/crt.js` (signal vidéo à luminance nette et couleurs étalées, rouge décalé, lignes de balayage de 3 px plus fines dans les clairs, grille RVB, coins assombris, bruit du signal, bande de bruit de la cassette, allumage du tube), sans ses passes de halo ni son étalonnage, avec les valeurs de son jeu « A » comme réglages par défaut. La table « la donnée parle de… → graphique » et l'arrivée des axes avec le mot de `styles/dataviz/STYLE.md` en sont des idées, réécrites dans `plugins/pulse-motion/references/explication.md` (graphiques de données). Les cordes pincées par modèle physique (`core/audio/pluck.py` : Karplus-Strong étendu, excitation de bruit, amortissement) et la sélection tour à tour des variantes d'une note (`core/audio/sampler.py`, round-robin) sont réécrites en JavaScript dans `plugins/pulse-motion/moteur/synthe/corde.js` ; les chiffres du son de feutre de `styles/whiteboard/STYLE.md` § 7 (bande de 2 à 7,5 kHz, corps de 0,5 à 1,5 kHz, couinement de 1,5 à 2,6 kHz avec un vibrato de 7 à 13 Hz) et sa règle « toute action visible qui touche la matière a un son » sont repris dans `plugins/pulse-motion/moteur/synthe/bruitages.js` et `references/audio/bruitages.md`. Aucun fichier, film ni image n'est repris.

- Projet : https://github.com/lemomo-ai/lemo-opuscar
- Auteur : LemoLab
- Licence : MIT

```
MIT License

Copyright (c) 2026 LemoLab

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
