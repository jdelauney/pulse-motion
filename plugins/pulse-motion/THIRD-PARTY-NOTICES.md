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

L'export MP4 dans le navigateur utilise Mediabunny 1.61.3, repris sans modification dans `plugins/pulse-motion/vendor/mediabunny/` (provenance, empreinte et texte de la licence dans ce dossier). Il est servi par l'aperçu pour l'export et n'est jamais embarqué dans la page livrée.

- Projet : https://mediabunny.dev
- Licence : Mozilla Public License 2.0 (`plugins/pulse-motion/vendor/mediabunny/LICENSE`)

## explainroo

La garde des serveurs locaux (`scripts/lib/garde-locale.js` : hôte et origine vérifiés, fichiers servis filtrés, liens symboliques refusés) et l'écriture atomique en fichier `.part` (`scripts/lib/fichiers.js`) suivent les principes du serveur local d'explainroo (`src/server.js`). Le code de Pulse Motion est écrit à neuf ; aucun fichier n'est copié.

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

La méthode du mouvement vivant des personnages (spec « Mouvement vivant ») reprend la formule de `flow()` (interpolation d'Hermite cubique monotone de Fritsch–Butland, `templates/react-native/motion.ts`), traduite en JavaScript ES5 dans `plugins/pulse-motion/moteur/vivant.js`, avec une variante cyclique écrite à neuf. Les recettes chiffrées (clignement, repos vivant, retard des membres, ombre qui suit la hauteur, écrasement à l'atterrissage, durées des interfaces) et la liste « avant de dire que c'est vivant » sont réécrites en français (`references/mouvement-vivant.md`, `moteur/personnages/partition.js`, `moteur/personnages/scene.js`). Aucun dessin ni personnage des démos n'est repris.

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

Les principes de `scripts/life.js` (`blinkLid` : clignement en 110, 40 et 190 ms ; `eyesLead` : les yeux avant la tête ; `settle` : le retard d'un bout sur sa base) sont réécrits dans le moteur des personnages (`moteur/vivant.js`, `moteur/personnages/partition.js`, `moteur/personnages/interactions.js`). Aucun fichier n'est copié, et aucun fichier dérivé d'anidoodle n'est utilisé.

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

## video-director

Portions adapted from video-director, Copyright (c) 2026 win4r, MIT License. La doctrine de réalisation (`plugins/pulse-motion/references/realisation.md` : posture, cadrans, symptôme → mécanisme → correction, clichés, vérité des chiffres) et la consigne du relecteur (`plugins/pulse-motion/agents/critique.md` : posture, grille, un seul tour) sont réécrites en français à partir de `SKILL.md` et de `references/quality.md` ; les seuils sont adaptés à des formations et à des vidéos de PME. Aucun fichier n'est copié.

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

Portions adapted from Lemo-Opuscar, Copyright (c) 2026 LemoLab, MIT License. Les seuils chiffrés et les erreurs les plus vues de `DIRECTOR.md` sont réécrits en français dans `plugins/pulse-motion/references/realisation.md` (§§ 3, 5, 6 et 9). Aucun fichier, film ni style n'est repris.

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
