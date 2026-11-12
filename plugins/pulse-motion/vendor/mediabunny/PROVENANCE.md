# Mediabunny

- Bibliothèque : Mediabunny 1.61.3 (https://mediabunny.dev), assemblage de fichiers MP4 avec WebCodecs.
- Licence : Mozilla Public License 2.0 (fichier `LICENSE` ci-joint). Fichier repris **sans modification**.
- Source : https://cdn.jsdelivr.net/npm/mediabunny@1.61.3/dist/bundles/mediabunny.min.mjs
- Empreinte sha256 : `d7b3a90e82158a7022729cbd4f861daf73cbb4f69d23349d2aefc9c8281cf70c`
- Usage : servi par l'aperçu (`/_pm/vendor/mediabunny.min.mjs`) pour l'export MP4 ; et, sans ffmpeg, par la page d'aide de l'import d'une vidéo de l'écran (`scripts/lib/import.js`, servie sur 127.0.0.1 le temps de l'import), pour la décoder (`Input`, `BlobSource`, `CanvasSink`, `AudioBufferSink`). Jamais embarqué dans la page livrée, sauf dans la page facultative qui sait faire son MP4, demandée par la personne, qui porte l'avis MPL-2.0.
