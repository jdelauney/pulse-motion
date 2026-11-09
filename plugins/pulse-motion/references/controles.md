# Les contrôles de `pulse-motion controler`

## L'essentiel

- `pulse-motion controler <dossier>` fait d'abord les **contrôles rapides** (déroulé, minutage, textes, CSS), puis contrôle la **vidéo rendue** dans Chrome ou Edge sans fenêtre (mise en page, pixels). Il écrit aussi la page `sortie/<titre>.html` : pas besoin d'assembler avant.
- Après une retouche, seules les scènes qui ont changé sont remesurées (`"rendu": "partiel"`, `scenesMesurees`) ; les autres gardent leurs résultats. `--complet` remesure toute la vidéo : toujours avant l'export.
- Les cas sûrs sont **corrigés seuls** dans `deroule.json`, après une copie d'historique ; chaque correction est listée dans `corrections` de `sortie/controle.json` : les dire à la personne en une phrase. « annule » défait toutes les corrections d'un passage.
- Dans les tableaux ci-dessous, la colonne « Corrigé seul ? » dit ce que le contrôle a corrigé seul, et dans quelle limite.
- Ce qui reste est dans `problemes` : corriger les erreurs, traiter les alertes (deux tours au plus), dire le reste à la personne.
- `--sans-correction` : signaler seulement (les problèmes de texte et de durée portent leur `correction` proposée ; un débordement reste une erreur). `--sans-rendu` : contrôles rapides seulement.
- `renduVerifie: false` avec `rendu-non-verifie` ou `rendu-impossible` : la vidéo rendue n'a pas été contrôlée ; le dire à la personne.
- Avant de montrer la vidéo, Claude en regarde les planches (`pulse-motion planche . --regard`, dans `sortie/regard/`) : l'ouverture de 0 à 3 s (`accrocheMax`), une image toutes les 0,5 s (`regardPas`) ; une image 0,3 s (`regardDecalage`) après la fin des entrées importantes de chaque scène, 24 images (`regardVignettesMax`) au plus ; chaque scène vue sur un téléphone, à 360 px (`telephoneLargeur`) de large ; des bandes autour des transitions, pour le relecteur. Ce sont des réglages du regard, pas des règles.
- Chaque seuil est écrit « valeur unité (`clé`) » : la clé est celle de `scripts/seuils.json`, où vit le nombre (une vérification automatique garde les deux égaux).

## Minutage et lecture

| Règle | Ce qui la déclenche | Gravité | Corrigé seul ? | Que faire |
|---|---|---|---|---|
| `temps-mort` | Rien ne bouge pendant plus de 2,5 s (`tempsMort`) | alerte | oui, en fin de scène (durée raccourcie, sans passer sous le temps de lecture) | Au milieu d'une scène : décor qui dérive, entrée échelonnée |
| `pause-finale` | Moins de 0,5 s (`pauseFinale`) d'image stable à la fin, ou mouvement (effet de particules) qui continue après la fin de la vidéo et serait coupé | alerte | oui (dernière scène allongée de 1 s au plus (`pauseFinaleMaxAjout`)) | — |
| `lecture` | Scène plus courte que 1,5 s (`lectureBase`) + 0,3 s par mot (`lectureParMot`) | alerte | oui (durée allongée jusqu'à 1,5 fois (`lectureMaxAllonge`) la durée écrite) | Au-delà : raccourcir le texte ou couper la scène |
| `trop-d-animations` | Plus de 4 éléments (`animationsSimultanees`) qui bougent vite au même instant : animations de moins de 3 s (`animationLongue`), fonds et auras par shader exclus | alerte | non | Décaler les départs (`data-start`) |
| `texte-fugace` | Texte visible moins de 0,8 s (`texteFugaceBase`) + 0,2 s par mot (`texteFugaceParMot`) ; carton de sous-titres affiché moins de 1,25 s (`sousTitreMin`) | alerte | non | Le laisser plus longtemps à l'écran |
| `mouvement-rapide` | Grand élément (plus de 25 % (`grandElement`) de l'image) qui traverse plus de 1 largeur d'image par seconde (`vitesseMax`) | alerte | non | Ralentir le mouvement |

Avec un `tempo` dans le déroulé, aucune durée n'est corrigée seule (la musique se décalerait).

## Texte en français

| Règle | Ce qui la déclenche | Gravité | Corrigé seul ? | Que faire |
|---|---|---|---|---|
| `typographie` | Espace fine avant ; ! ?, insécable avant : et dans « », guillemets « », apostrophe ’, points de suspension …, espace entre un nombre et son unité | alerte | oui (textes du déroulé) | Texte écrit dans une scène : le corriger dans le fichier |
| `majuscule-accentuee` | « Etape », « Equipe », « Ecole »… en début de phrase | alerte | oui | — |
| `mot-double` | Le même mot deux fois de suite (« le le ») | alerte | non | Appliquer la proposition du message |
| `terme-variable` | Un mot écrit de deux façons (« e-mail » / « email ») | alerte | non | Choisir une graphie ; la noter au glossaire si c'est un mot du métier |
| `texte-petit` | Texte de moins de 3,5 cqh (`texteMinCqh`) | alerte | non | Agrandir |
| `contraste` | Couleur de la charte sur le fond de la charte : moins de 4,5:1 (`contrasteTexte`), titres moins de 3:1 (`contrasteTitres`) | alerte | non | Changer la couleur de la charte. Les couleurs lisibles (`--c-primaire-lisible`, `--c-accent-lisible`) sont ajustées avec une marge de 0,5 (`margeLisible`) au-dessus du seuil |

## Mise en page rendue

| Règle | Ce qui la déclenche | Gravité | Corrigé seul ? | Que faire |
|---|---|---|---|---|
| `debordement` | Texte qui déborde de son cadre ou sort de l'image | erreur | oui : taille réduite de 5 % en 5 %, jusqu'à 80 %, jamais sous 3,5 cqh (`ajustements` du déroulé) | Au-delà : raccourcir le texte |
| `chevauchement` | Deux éléments de contenu qui se recouvrent sur plus de 10 % (`chevauchementMax`) | alerte | non | Les écarter, ou `data-superpose` sur celui qui passe par-dessus |
| `hors-cadre` | Image, logo ou SVG qui sort de l'image | alerte | non | Le recadrer, ou le marquer comme décor |
| `marge` | Texte à moins de 4 % (`margeMin`) du bord | alerte | non | L'éloigner du bord |
| `zone-sure` | En 9:16 : texte dans les 7 % (`zoneHaut`) du haut, les 20 % (`zoneBas`) du bas, ou les 11 % (`zoneDroite`) de droite entre 40 % (`zoneDroiteDebut`) et 85 % (`zoneDroiteFin`) de la hauteur (boutons des réseaux) | alerte | non | Raccourcir les textes ou retirer un point, sinon rapprocher du centre |
| `logo-masque` | Logo recouvert à plus de 20 % (`logoMasqueMax`), ou hors de l'image | alerte | non | Le dégager |
| `sous-titre-cache-texte` | Un sous-titre recouvre plus de 10 % (`chevauchementMax`) d'un texte de la scène | alerte | non | Sous-titres en haut (`"position": "haut"`), ou remonter le texte |
| `obstacle-forme-vide` | Élément `data-obstacle="forme"` invisible à la fin de son minutage : les particules ne s'y arrêtent pas (aussi signalé dans l'aperçu, sur l'effet) | alerte | non | Le laisser visible à la fin de son minutage, ou retirer `data-obstacle="forme"` |

Les sous-titres sont aussi contrôlés pour le contraste (`contraste-reel`, élément « sous-titres ») et, en 9:16, pour les zones des réseaux (`zone-sure`).

La vidéo est relevée toutes les 0,2 s (`pasMesure`) ; un élément est immobile quand il bouge de moins de 0,5 % (`immobile`) de l'image entre deux relevés.

## Pixels

| Règle | Ce qui la déclenche | Gravité | Corrigé seul ? | Que faire |
|---|---|---|---|---|
| `contraste-reel` | Texte qui ne se détache pas de ce qu'il y a derrière ses lettres : moins de 4,5:1 (`contrasteTexte`), ou 3:1 (`contrasteGrandTexte`) à partir de 4,5 cqh (`grandTexteCqh`) | alerte | non | Aplat ou voile sous le texte, autre couleur, fond déplacé |
| `flash` | Plus de 3 flashs par seconde (`flashMax`) sur 25 % (`flashAire`) de l'image | **erreur** | non | Ralentir ou adoucir le clignotement (risque de crise d'épilepsie) |

Comment ils se mesurent : les lettres sont les pixels qui changent de plus de 60 (`ecartLettre`) entre un rendu du texte en noir et un en blanc ; un fond est uni quand sa luminance varie de moins de 0,05 (`fondUniEcart`) sous le texte (le contrôle de la charte en juge alors). Les flashs se cherchent sur environ 12 images par seconde (`flashIps`), réduites à 64 px (`largeurFlash`) de large, en 4 cases (`flashCases`) de côté : un flash est un écart de luminance de 0,1 (`flashVariation`) au moins, dont la valeur la plus basse reste sous 0,8 (`flashSombre`).

## Rendu

| Règle | Ce qui la déclenche | Gravité | Corrigé seul ? | Que faire |
|---|---|---|---|---|
| `rendu-non-verifie` | Ni Chrome ni Edge | alerte | non | Installer l'un des deux, ou indiquer son chemin avec `PM_NAVIGATEUR` |
| `rendu-impossible` | Page en erreur, délai dépassé, navigateur introuvable à l'adresse donnée | alerte | non | Lire la cause dans le message |

## Voix et sons

| Règle | Ce qui la déclenche | Gravité | Corrigé seul ? | Que faire |
|---|---|---|---|---|
| `voix-allonge` | La voix dure plus que la scène : la scène est allongée | info | — (la scène suit sa voix) | Rien ; pour figer la durée, l'écrire dans le déroulé |
| `ancre-mot-introuvable` | `data-start="mot:…"` sur un mot que la voix ne dit pas, ou une scène sans voix | erreur | non | Prendre un mot de la liste du message |
| `voix-illisible` | Prise de voix abîmée ou introuvable | erreur | non | Réimporter ou réenregistrer la scène |
| `voix-provisoire` | La scène joue encore la voix du système | alerte | non | Enregistrer la vraie voix ; l'export la refuse sans `--avec-provisoire` |
| `mots-perimes` | La prise ou son texte ont changé depuis la transcription | alerte | non | `pulse-motion voix transcrire` |
| `calage-approche` | Mots calés sans transcription | info | — | `pulse-motion whisper` : installer la transcription, puis `pulse-motion voix transcrire` |
| `page-lourde` | Plus de 20 Mo de sons dans la page | alerte | non | Installer ffmpeg (voix en Opus) |
| `son-inconnu` | `data-son` qui n'est ni un son de la bibliothèque ni un fichier | erreur | non | Prendre un son de la liste du message |
| `son-sous-voix` | Son fort (`impact`, `basse`, `montee`) pendant un mot de la voix | alerte | non | Le placer dans une pause |
| `trop-de-sons` | Plus de 3 sons dans la même seconde | alerte | non | En retirer ou les espacer |
| `partition-invalide` | Partition mal formée (la piste et la note fautives sont nommées) | erreur | non | Corriger la partition |

À l'import d'un enregistrement de toute la vidéo, `pulse-motion voix importer` signale (`avertissement`) une scène dont moins de la moitié des mots ont été reconnus : l'écouter, et la réenregistrer seule si besoin.

« info » : rien à corriger, la personne est prévenue. Avec une voix, la durée de la scène n'est jamais corrigée seule.

## Autres règles

Le contrôle signale aussi, avec un message qui dit quoi faire : un texte du déroulé absent (`texte-manquant`), une scène mal formée (`scene-invalide`), un fichier ou une ressource introuvable ou hors du projet (`fichier-introuvable`, `ressource-distante`), une police non embarquée (`police-non-embarquee`), un effet de particules invalide, trop chargé ou posé sur un texte (`effet-invalide` ; `budget-particules` au-delà de 300 000 particules (`budgetParticules`) à la fois dans une scène ; `effet-sur-texte`, effet devant un texte de plus de 8 mots (`effetSurTexteMots`)), des particules qui interagissent mal déclarées ou trop nombreuses (`interactions-invalides`, alerte `budget-interactions` au-delà de 100 000 particules par émetteur en essaim, 60 000 en fluide ou en grains, ou de 48 en moyenne par cellule de voisinage), des cordes et des tissus mal déclarés ou trop nombreux (`structure-invalide`, `attache-introuvable`, alerte `budget-structures` au-delà de 16 par scène ou de 64 × 64 sommets par tissu), des milieux fluides mal déclarés ou trop fins (`milieu-invalide`, `deux-milieux`, `couplage-sans-milieu`, alerte `budget-milieu` au-delà de 512 cellules sur le grand côté), une scène qui ne commence pas sur un temps alors que la musique ne se recale pas sur les scènes (`hors-tempo` : musique en fichier avec `tempo`, ou partition à grille continue), un effet, un shader ou des variables CSS qui suivent une piste absente de la vidéo ou inconnue (`son-sans-piste`, alerte pour des variables CSS ; `piste-inconnue` — voir `pulse-motion reference audio/son-reactif`), un ton absent du style (`ton-indisponible`), un découpage en lettres inconnu (`lettres-invalide`), un shader introuvable, mal déclaré ou mal écrit (`shader-inconnu`, `usage-incompatible`, `fonction-absente`, `liaison-reservee`, `shader-trop-gros`, `shader-invalide`, `nom-reserve`, `reglage-inconnu` ; avec `--gpu`, un shader qui ne compile pas : `shader-ne-compile-pas`, ou `shaders-non-compiles` sans WebGPU — voir `pulse-motion reference shaders`), une correction impossible à écrire (`correction-impossible`).

| Règle | Ce qui la déclenche | Gravité | Corrigé seul ? | Que faire |
|---|---|---|---|---|
| `deroule-invalide` | Le déroulé est mal formé (champ manquant, valeur hors de la liste) | erreur | non | Corriger le champ nommé par le message |
| `style-inconnu` | Le style du déroulé n'est ni livré ni personnel | erreur | non | Prendre un style de `pulse-motion styles` |
| `charte-invalide` | `charte/charte.json` mal formé (couleur, police, logo) | erreur | non | Corriger la valeur nommée |
| `assemblage-impossible` | L'aperçu n'a pas pu réassembler la page (fichier verrouillé, erreur imprévue) | erreur | non | Lire la cause ; l'aperçu garde la dernière page juste et réessaie au prochain changement |
| `chemin-hors-projet` | Un fichier cité sort du dossier du projet | erreur | non | Copier le fichier dans le projet (`assets/`, `charte/`) |
| `fichier-non-pris-en-charge` | Fichier illisible ou d'un type que la page ne sait pas embarquer | erreur | non | Le remplacer par un format courant (image PNG, JPEG, WebP, AVIF ou SVG ; son WAV, MP3, M4A ou Opus) |
| `glossaire` | Un texte emploie une forme que le glossaire dit d'éviter | alerte | non | Écrire le terme comme le glossaire |
| `transcription-echouee` | La transcription d'une prise a échoué : ses mots sont calés au mieux | alerte | non | `pulse-motion voix transcrire` après avoir vérifié la prise |
| `start-invalide`, `dur-invalide` | `data-start` ou `data-dur` illisible | erreur | non | Prendre une forme du message (0.4, #titre+0.3, #titre:fin-0.2) |
| `reference-inconnue`, `reference-circulaire` | `data-start` vise un élément absent de la scène (ou non minuté), ou deux éléments se visent l'un l'autre | erreur | non | Viser un élément minuté de la même scène, sans boucle |
| `tempo-absent` | Une durée ou un départ en temps musicaux (`2t`) sans `tempo` dans le déroulé | erreur | non | Écrire le tempo, ou passer en secondes |
| `tween-invalide` | `data-tween` illisible | erreur | non | Suivre la forme `--var a→b courbe` (`pulse-motion reference moteur`) |
| `camera-invalide`, `temps-invalide`, `profondeur-invalide` | `data-camera`, `data-gel` ou `data-vitesse`, `data-profondeur` illisibles, ou caméra posée sur la `<section>` | erreur | non | `pulse-motion reference moteur/camera` ; la caméra va sur un conteneur dans la scène |
| `image-non-decodee` | Des images n'étaient pas prêtes après trois essais pendant le rendu | alerte | non | Vérifier le fichier (taille, format) ; relancer le contrôle |
| `effet-export` | Un effet CSS (`filter: url()`, `mix-blend-mode`, `backdrop-filter`) que l'export dans le navigateur ne rend pas | alerte | non | L'export fidèle le rend ; sinon prendre la solution du message |
| `ancre-introuvable`, `cible-introuvable` | `data-ancre` ou `data-cible` d'un effet ne désigne aucun élément de la scène | erreur | non | `#id` d'un élément de la même scène |
| `ancre-vide`, `metamorphose-sans-cible` | Un effet qui photographie son ancre sans `data-ancre`, ou qui la transforme sans `data-cible` | erreur | non | Ajouter l'attribut manquant |
| `effet-inconnu` | Un `data-effet` (ou un `etend`) nomme un effet ni dans `effets/` du projet, ni dans la bibliothèque | erreur | non | Prendre un effet de la bibliothèque (`pulse-motion effet <nom>`) |
| `collisions-invalides` | Les collisions d'une recette d'effet sont mal écrites | erreur | non | `pulse-motion reference particules/collisions` |
| `reglage-invalide` | Un réglage d'effet ou de shader hors de sa plage | erreur | non | Prendre une valeur de la plage du message |
| `obstacle-introuvable`, `obstacles-video`, `trop-d-obstacles` | Obstacle de particules mal désigné, obstacles de vidéo mal écrits, ou trop d'obstacles (les premiers sont gardés) | erreur ; alerte pour le nombre | non | `pulse-motion reference particules/collisions` |
| `personnage-invalide` | Personnage, groupe ou action mal écrits, ou bouche sans voix | erreur ou alerte | non | `pulse-motion reference moteur/personnages` |

## Dire ce qui est voulu

| Cas | Marqueur |
|---|---|
| Forme, image ou calque de pur décor | `data-decor`, ou dans `<div class="decor">` |
| Image décorative | `alt=""` |
| Icône SVG décorative | `aria-hidden="true"` |
| Élément posé volontairement sur un autre | `data-superpose` sur celui qui passe par-dessus |

Les seuils sont dans `scripts/seuils.json`.
