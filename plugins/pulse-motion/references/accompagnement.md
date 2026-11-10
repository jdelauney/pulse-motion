# Textes d'accompagnement : publication, courriel, description

## L'essentiel

- Après un export pour les réseaux ou le courriel, proposer en une ligne : « Voulez-vous un texte pour accompagner la vidéo ? ». Pour les autres usages, seulement sur demande.
- Lire d'abord : `deroule.json` (titre, textes des scènes, `voix.texte`, `faits`), `sortie/<titre>-chapitres.txt` s'il existe, et le résultat de l'export (durée, taille, sous-titres joints).
- Écrire un seul fichier, `sortie/<titre>-textes.md`, avec les modèles demandés (un titre `##` par modèle). Rien n'est publié ni envoyé : la personne copie le texte elle-même.
- **Honnêteté** : un chiffre n'apparaît que s'il est dans la vidéo, écrit de la même façon ; un chiffre marqué « exemple » dans `faits` garde la mention « Exemple ». Aucune promesse, aucun résultat, aucun client que la vidéo ne montre pas.
- Ton de la personne et de sa charte ; tutoiement ou vouvoiement comme dans la vidéo.

## Publication LinkedIn

| Règle | Détail |
|---|---|
| Accroche | Une phrase de **15 mots au plus** ; le **sujet apparaît dans les 3 premiers mots** (« La chaîne du froid se rompt… », pas « Aujourd'hui, je voulais vous parler de… ») |
| Corps | **3 à 5 lignes** courtes, une idée par ligne |
| Faits | Un **fait concret** de la vidéo plutôt qu'un adjectif (« 4 °C au plus » plutôt que « une règle essentielle ») |
| Chiffres | Seulement ceux **présents dans la vidéo**, avec « Exemple » s'ils le sont dans `faits` |
| Interdits | Superlatifs creux (« incroyable », « révolutionnaire », « le meilleur »), points d'exclamation en série, émoticônes en rafale |
| Mots-dièse | **0 à 3**, à la fin, tirés du sujet |
| Sous-titres | Une ligne le dit si la vidéo en a (« sous-titrée : regardable sans le son ») |

## Courriel

| Règle | Détail |
|---|---|
| Objet | **60 caractères au plus**, le sujet d'abord |
| Corps | **3 phrases** : pourquoi la vidéo, ce qu'elle montre, ce qu'on attend du destinataire (la regarder, la diffuser, répondre) |
| Durée | Dite dans le corps (« une vidéo de 1 min 20 ») |
| Fichier | « en pièce jointe » si l'export courriel tient dans la taille ; sinon « [lien à coller] », que la personne remplace par son lien |

## Description YouTube

| Règle | Détail |
|---|---|
| Début | **2 phrases** : le sujet, puis ce que la personne saura après la vidéo |
| Chapitres | Le contenu de `sortie/<titre>-chapitres.txt` tel quel (YouTube les reconnaît à partir de 3, de 10 s au moins chacun) |
| Crédits | Une ligne courte tirée de `sortie/<titre>-credits.txt` quand une mention est due (musique ou image importée sous licence qui la demande) ; rien pour la musique composée par Pulse Motion |

## Avant de rendre le texte

- Relire chaque chiffre contre `deroule.json` : absent de la vidéo, il disparaît.
- Compter les mots de l'accroche (15 au plus) et les caractères de l'objet (60 au plus).
- Dire à la personne où est le fichier (`sortie/<titre>-textes.md`) et qu'elle peut demander une autre version, plus courte ou dans un autre ton.
