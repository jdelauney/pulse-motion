# Après l'export : réponses toutes prêtes et sorties de présentation

## L'essentiel

- L'export se règle par **usage** (`web`, `reseaux`, `presentation`, `master`, `courriel`, `brouillon` : `pulse-motion reference usages`), jamais par un chiffre technique.
- Après un export, la personne dit souvent ce qui ne va pas en une phrase (« trop lourd », « c'est flou », « en vertical »). Chaque phrase a une réponse : **un réglage d'export**, **une retouche** de la vidéo, ou **« pas encore possible »**, dit franchement.
- Un changement de **format d'image** (vertical, carré) n'est pas un réglage d'export : c'est une retouche, les scènes se recomposent.
- Une vidéo **légère** se prépare dans l'image : moins de grain, de particules fines et de dégradés qui bougent, car ce sont eux qui alourdissent le fichier.
- **Première et dernière images** : la première n'est jamais vide ni noire (au moins le fond et le décor de la charte), la dernière est nette et stable, sans fondu au noir sauf demande.
- Chaque export joint ses **fichiers de diffusion** selon l'usage : couverture (image de la miniature, sans sous-titres), chapitres (texte à coller sur YouTube), crédits (polices, musique, images, à vérifier avant de publier). La page `sortie/<titre>.html` s'ouvre sur la couverture, avec un bouton ▶.

## Les sorties en plus du MP4

| La personne dit | Option de `pulse-motion exporter .` | Ce qu'on obtient |
|---|---|---|
| « juste la scène 3 », « la scène du chiffre » | `--scene <id>` (plusieurs : `--scene a,b`, un fichier par scène) | `sortie/<titre>-<id>.mp4` : la scène sans ses transitions, son compris (fondu de 0,1 s aux bords) |
| « de 12 à 18 secondes », « juste ce passage » | `--plage 12-18` (« 12,5-18 » accepté) | `sortie/<titre>-de-12s-a-18s.mp4`, pour revoir vite un passage retouché |
| « en GIF » | `--gif`, avec `--scene` ou `--plage` (la vidéo entière seulement si elle dure 20 s au plus) ; « plus grand » : `--largeur 1280` ; pour le courriel : `--pour courriel` (640 px) | `sortie/<titre>-<id>.gif`, en boucle, **sans son** (le dire) ; 20 s au plus ; ffmpeg requis |
| « dans un téléphone », « une maquette pour la présentation » | `--cadre telephone` (vidéo 9:16 seulement ; `--cadre-format 1:1` pour du carré) | `sortie/<titre>-telephone.mp4` : la vidéo dans un téléphone générique, au fond de la charte |
| « un PDF des scènes pour le client », « à imprimer » | `pulse-motion planche . --pdf` (ou `planche . <ids> --pdf`) | `sortie/<titre>-planches.pdf` : A4 paysage, deux scènes par page, trois images et le texte dit ; jamais ffmpeg ; proposé après un export `presentation` |
| « à incruster dans mon montage », « fond transparent » | `--transparent` (pour le montage) ; « pour le web » : `--transparent webm` ; avec `--scene` ou `--plage` si besoin. Pas pour le courriel, une taille visée, le GIF ni le cadre | `sortie/<titre>-transparent.mov` (Premiere, DaVinci Resolve, Final Cut ; fichier lourd, le dire) ou `.webm` ; ffmpeg requis pour le montage. Une scène au fond plein est refusée avec son nom : proposer de retirer son fond (retouche, sélecteur `.pm-transparent` du style) |
| « sans flou », « plus net » (master) ; « avec du flou de mouvement » | `--flou non` ; `--flou oui` (jamais en GIF, version de travail ni fond transparent) | Le master a par défaut un flou sur les passages rapides seulement (textes à lire jamais floutés) ; l'aperçu reste net |
| « un texte pour LinkedIn », « le message pour l'envoyer » | Aucune option : écrire `sortie/<titre>-textes.md` d'après `pulse-motion reference accompagnement` | Publication, courriel ou description YouTube, sans chiffre absent de la vidéo |
| « la musique vient de Pixabay », « le logo est à nous » | `pulse-motion credits . noter <fichier> "<source>" "<licence>" ["<auteur>"]` (fichier de `assets/`) | Crédits complétés au prochain export ; `creditsAPreciser` du résultat liste ce qui manque |

L'usage s'applique aux extraits (`--pour courriel --scene 3` : la scène sous 10 Mo). Un extrait, un passage ou un GIF reprennent les images déjà faites (aucune nouvelle capture des scènes déjà exportées) et ne touchent jamais au fichier complet.

## Ce qui change la vidéo (une retouche)

| La personne dit | Champ du déroulé |
|---|---|
| « ajoute des chapitres » | `scenes[].chapitre` (60 caractères au plus) : proposer un chapitre par scène titrée, faire valider ; sans chapitre sur la première scène, le titre de la vidéo ouvre la liste à 0:00. YouTube les montre à partir de 3 chapitres, de 10 s au moins chacun ; intégrés au MP4 seulement avec ffmpeg |
| « pour TikTok », « pour les Shorts », « pour les Reels » | `format.plateforme` (`tiktok`, `shorts`, `reels`, `toutes`), en 9:16 seulement : le contrôle vérifie les zones de l'application, les sous-titres passent au-dessus de sa bande du bas, et `pm-dans-zone` met un bloc dans la zone sûre ; touche Z de l'aperçu pour la voir |
| « fais-la tourner en boucle », « en boucle parfaite » | `boucle: true` : le lecteur reprend au début, la musique perd ses fondus et sa fin rejoint son début ; récrire la dernière scène pour qu'elle finisse sur l'image de départ (`pulse-motion reference rythme`, « Finir sur l'image de départ ») ; alertes `boucle-jointure` et `boucle-mesure` |
| « prends cette image pour la miniature », « la couverture à 2 s de la scène 3 » | `couverture` : `{ "scene": "<id>", "instant": 2 }` (secondes depuis le début de la scène) ; sinon la première scène à 95 % |

## La personne dit… on fait…

| Elle dit | Ce qu'on fait aujourd'hui | Quand ce sera possible |
|---|---|---|
| « Trop lourd », « je ne peux pas l'envoyer par courriel » | Usage `courriel` (`--pour courriel`, 10 Mo ; « moins de 25 Mo » : `--taille-max 25`), en 720p ou 540p selon la durée ; trop long : une seule scène (`--scene`), ou retirer le grain et les particules fines, raccourcir | — |
| « C'est flou », « pixelisé » | Export fidèle (avec ffmpeg) plutôt que dans le navigateur, usage `master` ; vérifier que les images de `assets/` sont assez grandes | — |
| « Ça saccade » | Chercher d'abord un mouvement trop rapide (contrôle `mouvement-rapide`) ; sinon export à 60 images par seconde | — |
| « En vertical », « pour les stories » | Retouche : format 9:16 dans le déroulé, scènes recomposées (empilées) ; en gardant l'original (« fais-en une version verticale ») : une déclinaison, `pulse-motion reference langues` | — |
| « En carré », « pour le fil LinkedIn » | Retouche : format 1:1 ou 4:5 ; ou une déclinaison, comme ci-dessus | — |
| « Fond transparent », « pour l'incruster dans mon montage » | `--transparent` (ou `--transparent webm` pour le web) ; ffmpeg requis pour le montage | — |
| « Pour mon monteur », « sans perte » | Usage `master` (`--pour master`) : la meilleure qualité | — |
| « Un GIF » | `--gif` avec une scène ou un passage de 20 s au plus (ffmpeg requis) ; sans ffmpeg : proposer de l'installer, ou un MP4 court et muet que la plupart des messageries lisent en boucle | GIF sans ffmpeg (spec S5) |
| « Une image pour la miniature » | La couverture jointe à l'export (`sortie/<titre>-couverture.jpg`) ; une autre image : retouche du champ `couverture` | — |
| « Juste la scène 3 » | `--scene <id>` | — |
| « Pour le projeter en réunion », « dans PowerPoint » | Usage `presentation` (`--pour presentation`, lu par PowerPoint et Keynote) ; la page `sortie/<titre>.html` s'ouvre aussi sans connexion | Fichier de présentation modifiable (spec S5) |
| « Les sous-titres à part » | Déjà fait : `sortie/<titre>.srt` et `.vtt` | — |
| « Sans le son » | Retouche : retirer musique et bruitages (la voix reste si elle est voulue) | — |
| « Un support à imprimer », « le PDF des scènes » | `pulse-motion planche . --pdf` | — |

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
- **Dernière image** : le contrôle demande déjà 0,5 s d'image stable (`pause-finale`). Pas de fondu au noir, pas de retour à la première image (la vidéo n'est pas une boucle, sauf demande : `boucle: true`).

## Planches pour une présentation ou un imprimé

Une planche par scène, trois images (à 35 %, 65 % et 95 % de la partie visible de la scène) : `pulse-motion planche . <ids>` (images), ou `pulse-motion planche . --pdf` (le document prêt à envoyer).

Mise en page conseillée pour un document de relecture fait à la main :

| Élément | Règle |
|---|---|
| Page de garde | Titre de la vidéo, durée, date, logo de la charte |
| Une page par scène | L'image à 95 % en grand (70 % de la largeur), les deux autres en petit ; le numéro, le nom et la durée de la scène ; en dessous, le texte dit (`voix.texte`) |
| Marges | 6 % de la page |
| Textes | Polices de la charte ; corps de 11 points au moins à l'impression |
| Interdits | Aucun élément du lecteur (barre, boutons) ; aucune image de transition |

Pour une présentation de plusieurs pages, faire valider deux pages d'abord (la page de garde et une page de scène), puis produire le reste (`pulse-motion reference scenes-temoins`).

## À venir

- GIF sans ffmpeg, dans le navigateur (spec S5).
- Fichier de présentation modifiable (une image ou une vidéo par diapositive) : à étudier plus tard, après le PDF (spec S5).
