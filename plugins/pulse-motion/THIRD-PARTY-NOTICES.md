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

## argo

L'export par usage (`plugins/pulse-motion/scripts/usages.json`, `scripts/lib/ffmpeg.js` : `argsVideo`, `VERS_BT709`) traduit de près les arguments d'encodage de `src/export.ts` : conversion et étiquettes BT.709, `aq-mode=3`, `-movflags +faststart`, réglages de qualité de la présentation (CRF 16, `slow`). La détection des encodeurs de la carte graphique du brouillon (`detecterEncodeurs` : ordre NVENC, Quick Sync, AMF, VideoToolbox, essai d'une image, repli logiciel) suit `src/gpu-encoder.ts`. Les livrables de diffusion reprennent de près la vignette intégrée en flux `attached_pic`, assemblée sans `-shortest` (`src/export.ts` ; `assemblerSegments`), le fichier `;FFMETADATA1` des chapitres (`src/chapters.ts` ; `ffmetadata` de `scripts/lib/livrables.js`) et la palette du GIF en deux passes (`palettegen=stats_mode=diff`, `paletteuse` à tramage de Bayer, `src/export.ts` et `src/clip.ts` ; `encoderGif`), ainsi que l'extraction par scène (`src/clip.ts`, idée). Le code est réécrit en JavaScript ; aucun fichier n'est copié.

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

La garde des serveurs locaux (`scripts/lib/garde-locale.js` : hôte et origine vérifiés, fichiers servis filtrés, liens symboliques refusés) et l'écriture atomique en fichier `.part` (`scripts/lib/fichiers.js`) suivent les principes du serveur local d'explainroo (`src/server.js`). La lisibilité sur un petit lecteur (`readability.js` : 854 px, 16 px ; règle `texte-petit-lecteur` de `moteur/mesures.js`), la couleur lisible proposée (`suggestColor`, adaptée à OKLCH : `suggererCouleur` de `scripts/lib/couleurs.js`) et les chiffres de la vérification du fichier (`verify` : `blackdetect`, `silencedetect` à −50 dB pendant 2,5 s ; `scripts/lib/ffmpeg.js`, `moteur/ecoute.js`) en sont des idées et des chiffres, comme les tests sur trois systèmes (`.github/workflows/tests.yml`). Les livrables de diffusion traduisent de près les chapitres de `src/chapters.js` (premier chapitre à 0:00, alertes YouTube à moins de 3 chapitres ou de 10 s, échappement ; `scripts/lib/livrables.js`) et les marges des plateformes de `src/project.js` (`FORMATS` « as of 2026 » : `zonesPlateformes` de `scripts/seuils.json`) ; la couverture sans sous-titres (`src/render.js`) et le GIF à 15 images par seconde et 960 px en sont des idées et des chiffres. Les noms proches proposés dans les messages (`moteur/proches.js` : « vouliez-vous dire … ? ») reprennent l'idée de `suggest` (`engine/util.js`), réécrite. Le code de Pulse Motion est écrit à neuf ; aucun fichier n'est copié.

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

## rossark-motion-skill

La méthode du mouvement vivant des personnages (spec « Mouvement vivant ») reprend la formule de `flow()` (interpolation d'Hermite cubique monotone de Fritsch–Butland, `templates/react-native/motion.ts`), traduite en JavaScript ES5 dans `plugins/pulse-motion/moteur/vivant.js`, avec une variante cyclique écrite à neuf. Les recettes chiffrées (clignement, repos vivant, retard des membres, ombre qui suit la hauteur, écrasement à l'atterrissage, durées des interfaces) et la liste « avant de dire que c'est vivant » sont réécrites en français (`references/mouvement-vivant.md`, `moteur/personnages/partition.js`, `moteur/personnages/scene.js`). Les gestes avancés reprennent aussi ses formules, réécrites : regard qui suit un mobile avec 50 et 140 ms de retard et `attention` (`ChefScene.swift`, `moteur/personnages/interactions.js`), vol pieds pendants (`drawMystery()`, `flotter` dans `partition.js`), lancer balistique calculé à l'arrivée, écrasement au contact et roulement `Δx / r` (`cakeState()`, `drawBall()`, `moteur/personnages/objets.js`). Les contrôles du mouvement (gestes trop brefs, personnages figés, boucles qui sautent, éléments en phase, à-coups de caméra : `moteur/mesures.js`) suivent sa liste des défauts d'un mouvement mécanique (`SKILL.md` § 1.6, § 1.12, § 5, § 7.10), avec nos propres seuils. Le cadre de téléphone autour d'une vidéo verticale (`moteur/cadres/telephone.js`) reprend l'idée de son mode « phone », avec un dessin générique et des dimensions écrites à neuf. Aucun dessin ni personnage des démos n'est repris.

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

Les principes de `scripts/life.js` (`blinkLid` : clignement en 110, 40 et 190 ms ; `eyesLead` : les yeux avant la tête ; `settle` : le retard d'un bout sur sa base) sont réécrits dans le moteur des personnages (`moteur/vivant.js`, `moteur/personnages/partition.js`, `moteur/personnages/interactions.js`). Les règles de `text-audit.mjs` (BROKEN, PINNED, SMALL) et de `plate-audit.mjs` (UPSCALE, REPEAT) sont adaptées au DOM dans `moteur/mesures.js` et `scripts/lib/realisation-regles.js` (`texte-casse`, `texte-epingle`, `texte-petit-lecteur`, `image-agrandie`, `image-repetee`, `glyphe-absent`). La règle de `references/motion-kit.md` qui proscrit un zoom avant suivi aussitôt d'un zoom arrière est reprise par le contrôle `a-coup-camera` (`moteur/mesures.js`). Les principes de `gate.mjs` (contrat du code des scènes, air mort de 0,5 %, sauts à 3 fois la médiane de 6 voisines) et de `audio-check.mjs` (masquage de la voix entre 500 Hz et 4 kHz, 3 dB, 80 %), ainsi que la preuve du déterminisme de `gate.mjs` (page froide dans l'ordre et page chauffée à l'envers, PSNR au-dessus de 45 dB, image fautive nommée ; `scripts/lib/determinisme.js`), sous licence Apache-2.0, sont seulement réécrits à partir de leur idée, sans lecture ni copie du code. Le master de l'export par usage (CRF 14, `slow` : `plugins/pulse-motion/scripts/usages.json`) reprend la valeur de `scripts/export.mjs`, sans code ; le passage seul (`--plage`, images de round(début × ips) à round(fin × ips) − 1 : `scripts/lib/livrables.js`) suit la convention `START/END` du même fichier. Aucun fichier n'est copié, et aucun fichier dérivé d'anidoodle n'est utilisé.

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

La comparaison d'images de la non-régression visuelle du moteur (`scripts/lib/images.js`, `comparerImages` : écart moyen et maximal par canal, carte de différence ; `tests/non-regression-visuelle.test.js` : plancher de bruit mesuré d'abord, seuils d'écart moyen et par image) suit les idées de `compare.ts` et de `references/verify.md`, réécrites sans pixelmatch. La conversion des images capturées en YUV BT.709 plage limitée de l'export (`out_color_matrix=bt709:out_range=tv`, `scripts/lib/ffmpeg.js`) reprend celle de `site/video/scripts/render.ts`. Aucun fichier n'est copié.

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

Portions adapted from video-director, Copyright (c) 2026 win4r, MIT License. La doctrine de réalisation (`plugins/pulse-motion/references/realisation.md` : posture, cadrans, symptôme → mécanisme → correction, clichés, vérité des chiffres) et la consigne du relecteur (`plugins/pulse-motion/agents/critique.md` : posture, grille, un seul tour) sont réécrites en français à partir de `SKILL.md` et de `references/quality.md` ; les seuils sont adaptés à des formations et à des vidéos de PME. Les analyses d'images et de son (`frame_stats`, `analyse_picture` : images isolées d'une seule image, sauts, images plates ; `analyse_audio` : fenêtres de 100 ms) sont réécrites dans `scripts/lib/series.js`, `scripts/lib/flashs.js` et `moteur/ecoute.js` (`image-parasite`, `saut-image`, `image-figee`, `image-vide`, `voix-couverte`), et `term_in()` dans la règle `terme-cle`. Aucun fichier n'est copié.

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

Portions adapted from Lemo-Opuscar, Copyright (c) 2026 LemoLab, MIT License. Les seuils chiffrés et les erreurs les plus vues de `DIRECTOR.md` sont réécrits en français dans `plugins/pulse-motion/references/realisation.md` (§§ 3, 5, 6 et 9). La réécoute du mixage par la transcription (`final_asr.py`, règle `voix-inaudible` de `scripts/lib/verification.js`) et la courbe d'activité (`rhythm_report.py`, règle `image-figee`) en sont des idées, comme la détection du rendu graphique logiciel (`browser.mjs`, `warnIfSoftwareGL` : `scripts/lib/carte-graphique.js`), comme l'arrêt de l'export sur une erreur de la page et le verrou avec le numéro du processus (`core/render/video.mjs` : `scripts/lib/capture-fidele.js`, `moteur/export.mjs`, `scripts/export-fidele.js`), et comme les crédits joints à chaque export (`DIRECTOR.md` § 11, `CREDITS` : `scripts/lib/livrables.js`). Aucun fichier, film ni style n'est repris.

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
