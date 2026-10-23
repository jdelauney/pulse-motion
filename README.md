# Pulse Motion

Créez, sur votre ordinateur et sans cloud, des vidéos dynamiques en motion design : décrivez votre idée en mots simples, validez le déroulé, regardez la vidéo dans votre navigateur.

[![La vidéo obtenue avec la phrase « Expliquer la chaîne du froid en une minute »](docs/assets/captures/chaine-du-froid-affiche.jpg)](https://jdelauney.github.io/pulse-motion/medias/chaine-du-froid.mp4)

*Cliquez sur l'image pour voir la vidéo obtenue avec une seule phrase : « Expliquer la chaîne du froid en une minute ».*

## En 5 minutes

1. **Installer** le plugin (voir ci-dessous), puis ouvrir un dossier vide dans Claude Code.
2. **Créer** : `/pulse-motion:creer Expliquer la chaîne du froid en une minute`, répondre aux questions, valider le déroulé.
3. **Regarder** : la vidéo s'ouvre dans votre navigateur. Une retouche se demande en une phrase (`/pulse-motion:retoucher ralentis la scène 3`).
4. **Exporter** : `/pulse-motion:exporter` fabrique le MP4 sur votre ordinateur.

Le pas à pas : [En 5 minutes](https://jdelauney.github.io/pulse-motion/demarrage-rapide.html), et tout le guide sur le [wiki](https://jdelauney.github.io/pulse-motion/).

Ce dépôt est un catalogue (marketplace) de plugins Claude Code. Il contient le plugin [`pulse-motion`](plugins/pulse-motion/).

## Installation

Dans Claude Code :

```
/plugin marketplace add jdelauney/pulse-motion
/plugin install pulse-motion@pulse-motion
```

Fermez puis relancez Claude Code. Prérequis : Node.js 20 ou plus, et Chrome ou Edge ([installation pas à pas](https://jdelauney.github.io/pulse-motion/prerequis.html)).

## Licence

MIT – voir [LICENSE](LICENSE).
