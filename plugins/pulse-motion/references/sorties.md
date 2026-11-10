# Après l'export : réponses toutes prêtes et sorties de présentation

## L'essentiel

- L'export se règle par **usage** (`web`, `reseaux`, `presentation`, `master`, `courriel`, `brouillon` : `pulse-motion reference usages`), jamais par un chiffre technique.
- Après un export, la personne dit souvent ce qui ne va pas en une phrase (« trop lourd », « c'est flou », « en vertical »). Chaque phrase a une réponse : **un réglage d'export**, **une retouche** de la vidéo, ou **« pas encore possible »**, dit franchement.
- Un changement de **format d'image** (vertical, carré) n'est pas un réglage d'export : c'est une retouche, les scènes se recomposent.
- Une vidéo **légère** se prépare dans l'image : moins de grain, de particules fines et de dégradés qui bougent, car ce sont eux qui alourdissent le fichier.
- **Première et dernière images** : la première n'est jamais vide ni noire (au moins le fond et le décor de la charte), la dernière est nette et stable, sans fondu au noir sauf demande.
- Pour un support imprimé ou une relecture, les **planches** (trois images par scène) font foi ; le PDF des planches viendra avec les extraits (spec S5).

## La personne dit… on fait…

| Elle dit | Ce qu'on fait aujourd'hui | Quand ce sera possible |
|---|---|---|
| « Trop lourd », « je ne peux pas l'envoyer par courriel » | Usage `courriel` (`--pour courriel`, 10 Mo ; « moins de 25 Mo » : `--taille-max 25`), en 720p ou 540p selon la durée ; trop long : retirer le grain et les particules fines, raccourcir | — |
| « C'est flou », « pixelisé » | Export fidèle (avec ffmpeg) plutôt que dans le navigateur, usage `master` ; vérifier que les images de `assets/` sont assez grandes | — |
| « Ça saccade » | Chercher d'abord un mouvement trop rapide (contrôle `mouvement-rapide`) ; sinon export à 60 images par seconde | — |
| « En vertical », « pour les stories » | Retouche : format 9:16 dans le déroulé, scènes recomposées (empilées) | Déclinaison automatique : décision de la spec S9 |
| « En carré », « pour le fil LinkedIn » | Retouche : format 1:1 ou 4:5 | Idem |
| « Fond transparent », « pour l'incruster dans mon montage » | Pas encore possible ; le dire | Vidéo à couche transparente (spec S5) |
| « Pour mon monteur », « sans perte » | Usage `master` (`--pour master`) : la meilleure qualité, fichier lourd | — |
| « Un GIF » | Pas encore possible ; proposer un MP4 court et muet, que la plupart des messageries lisent en boucle | GIF (spec S5) |
| « Une image pour la miniature » | Planche de la scène qui résume ; choisir l'image où tout est en place | Couverture sans sous-titres (spec S5) |
| « Juste la scène 3 » | Pas encore possible en export ; une planche de la scène | Extraction d'une scène (spec S5) |
| « Pour le projeter en réunion », « dans PowerPoint » | Usage `presentation` (`--pour presentation`, lu par PowerPoint et Keynote) ; la page `sortie/<titre>.html` s'ouvre aussi sans connexion | — |
| « Les sous-titres à part » | Déjà fait : `sortie/<titre>.srt` et `.vtt` | — |
| « Sans le son » | Retouche : retirer musique et bruitages (la voix reste si elle est voulue) | — |
| « Un support à imprimer », « le PDF des scènes » | Planches des scènes en images | PDF des planches (spec S5) |

## Une vidéo légère

| Ce qui alourdit | Pourquoi | À la place, pour un envoi |
|---|---|---|
| Grain ou bruit qui change à chaque image | Rien ne se répète d'une image à l'autre : le compresseur ne peut rien économiser | Pas de grain, ou une texture fixe |
| Particules fines nombreuses (neige, poussière) | Même raison | Moins de particules, plus grosses |
| Dégradés de fond qui bougent | Bandes et détails à chaque image | Fond uni ou dégradé fixe |
| Flou animé sur une grande surface | Chaque image diffère partout | Flou court, sur une petite zone |
| Scènes longues sans changement | Peu de poids, mais du temps inutile | Raccourcir |

Un GIF n'est **pas** plus léger qu'un MP4 : à durée égale, il est souvent plusieurs fois plus lourd.

## Première et dernière images

- **Première image** : les plateformes et les logiciels la montrent souvent avant la lecture. Elle doit au moins montrer le fond et le décor du style. Le titre peut entrer très tôt (avant 0,5 s) pour qu'une image fixe dise déjà le sujet.
- **Dernière image** : le contrôle demande déjà 0,5 s d'image stable (`pause-finale`). Pas de fondu au noir, pas de retour à la première image (la vidéo n'est pas une boucle, sauf demande).

## Planches pour une présentation ou un imprimé

Une planche par scène, trois images (à 35 %, 65 % et 95 % de la partie visible de la scène) : `pulse-motion planche . <ids>`.

Mise en page conseillée pour un document de relecture :

| Élément | Règle |
|---|---|
| Page de garde | Titre de la vidéo, durée, date, logo de la charte |
| Une page par scène | L'image à 95 % en grand (70 % de la largeur), les deux autres en petit ; le numéro, le nom et la durée de la scène ; en dessous, le texte dit (`voix.texte`) |
| Marges | 6 % de la page |
| Textes | Polices de la charte ; corps de 11 points au moins à l'impression |
| Interdits | Aucun élément du lecteur (barre, boutons) ; aucune image de transition |

Pour une présentation de plusieurs pages, faire valider deux pages d'abord (la page de garde et une page de scène), puis produire le reste (`pulse-motion reference scenes-temoins`).

## À venir

- GIF (15 images par seconde, 640 px pour le courriel, 960 ou 1280 px de large, palette calculée sur toute la vidéo en deux passes, ffmpeg requis) ; vidéo à couche transparente ; couverture ; extraction d'une scène ; chapitres ; cadre de téléphone autour d'un 9:16 ; **PDF des planches** par l'impression du navigateur, piloté par le CDP maison, sans dépendance ; affiche de la page livrée (spec S5).
- Fichier de présentation modifiable (une image ou une vidéo par diapositive) : à étudier plus tard, après le PDF (spec S5).
