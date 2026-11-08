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
