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
- Le relecteur (agent `critique`, `pulse-motion reference realisation`, section « 13. La relecture indépendante ») note la vidéo sur huit axes et écrit `sortie/regard/critique.json` : prête si chaque axe noté vaut 8 (`critiqueBarre`) ou plus ; on ne corrige que ses défauts « à corriger », sur 3 scènes (`critiqueScenesMax`) au plus, sur place si possible, jamais une scène notée 9 (`critiqueIntouche`) ou plus. Ce n'est pas une règle du contrôle.
- Chaque seuil est écrit « valeur unité (`clé`) » : la clé est celle de `scripts/seuils.json`, où vit le nombre (une vérification automatique garde les deux égaux).
- `sortie/verification.json` : la vérification de l'export (section « Vérification de l'export »), à dire après chaque export.
- Le son est mesuré (`son` de `controle.json`), jamais écouté ; il n'est rendu de nouveau que si la musique, les voix, les bruitages ou leurs réglages ont changé.

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

## Réalisation

`accroche` et `image-zero` ne valent que pour le genre `social`. Les « que faire » renvoient à `pulse-motion reference realisation`.

| Règle | Ce qui la déclenche | Gravité | Corrigé seul ? | Que faire |
|---|---|---|---|---|
| `rien-de-nouveau` | Aucun élément de contenu (hors décor) n'entre pendant plus de 8 s (`nouveauteMax`), 12 s (`nouveauteMaxVoix`) si la voix parle la moitié du temps, 4 s (`nouveauteMaxSocial`) en social, ni sous le temps de lecture de la scène ; pause finale exclue | alerte | non | Échelonner les entrées (`data-start`), en caler une sur un mot dit (`mot:`), ou couper la scène en deux |
| `comparaison-courte` | Scène `comparaison` : ses éléments sont visibles ensemble moins de 2,5 s (`comparaisonTenue`) avant la fin de la scène | alerte | oui, comme `lecture` (ni sous une voix, ni sur une grille fixe) | Allonger la scène, ou faire entrer la seconde colonne plus tôt |
| `camera-repetee` | Deux scènes voisines ont le même mouvement de caméra (zoom avant, travelling à gauche…) d'au moins 5 % (`cameraAmpleurMin`) | alerte | non | En changer un ou le retirer (`realisation` § 6) |
| `accroche` | Social : aucun texte complet d'au moins 7,8 % (`accrocheTaille`) du petit côté lisible avant 3 s (`accrocheMax`) | alerte | non | Première scène courte, titre sans délai, en grand |
| `image-zero` | Social : rien du contenu n'est visible à 0 s (la vignette) | alerte | non | `data-start="0"` sans entrée sur le titre de la première scène, ou première transition `aucune` |
| `sujet-petit` | À l'instant stable de chaque scène (dernière entrée + 0,3 s (`regardDecalage`)), le contenu occupe moins de 33 % (`sujetMin`) de la hauteur et de la largeur | alerte | non | Tailles du style, `data-camera` zoom |
| `transition-vide` | Pendant une transition, aucun élément de contenu des deux scènes n'est visible à plus de 10 % (`transitionOpacite`) | alerte | non | `data-start="0"` sur le premier élément, ou transition `coupe` |
| `texte-epingle` | Un petit texte (moins de 4,5 cqh (`grandTexteCqh`)) reste dans un coin (15 % (`epingleCoin`) de la largeur et de la hauteur) plus de 6 s (`epingleDuree`) au total ; sous-titres, logo et `data-repere` exclus | alerte | non | Le retirer, ou le marquer `data-repere` s'il est voulu |

## Vérité des chiffres et termes

Un chiffre donné avec sa source va dans `faits` du déroulé (`pulse-motion reference realisation`, section « 3. Avant d'écrire le déroulé ») :
`"faits": [{ "chiffre": "4 °C", "scene": "seuil", "source": "Règlement (CE) n° 852/2004" }]` ; un chiffre inventé pour l'exemple :
`{ "chiffre": "1 250", "scene": "chiffre", "exemple": true }`, et la scène affiche « Exemple ».

| Règle | Ce qui la déclenche | Gravité | Corrigé seul ? | Que faire |
|---|---|---|---|---|
| `chiffre-invente` | Un nombre affiché (valeur finale d'un compteur, nombre écrit dans la scène) n'est ni dans les textes, ni dans l'intention, ni dans le texte dit (« quatre » compte pour 4), ni dans `faits` | alerte | non | Écrire le chiffre dans l'intention ou dans `faits`, ou corriger la scène |
| `chiffre-sans-source` | Le déroulé a des `faits`, et un nombre affiché de la scène (numéro d'étape exclu) n'y est pas | alerte | non | Ajouter `{ chiffre, scene, source }` ou `exemple: true` |
| `exemple-non-signale` | Un fait `exemple: true`, et aucun texte de sa scène ne dit « exemple », « fictif » ou « illustratif » | alerte | non | Un texte « Exemple » près du chiffre |
| `cause-affirmee` | Un texte qui contient un nombre dit « grâce à » | info | — | « Après » si l'on ne sait que l'ordre des faits |
| `terme-cle` | Un terme « clé » du glossaire est dit sans être écrit dans une scène où il est dit, écrit sans jamais être dit (vidéo avec voix), ou absent | alerte | non | Ancre `mot:<terme>` sur le texte qui l'affiche ; `pulse-motion glossaire noter . "<terme>" "<sens>" --cle` |

## Texte en français

| Règle | Ce qui la déclenche | Gravité | Corrigé seul ? | Que faire |
|---|---|---|---|---|
| `typographie` | Espace fine avant ; ! ?, insécable avant : et dans « », guillemets « », apostrophe ’, points de suspension …, espace entre un nombre et son unité | alerte | oui (textes du déroulé) | Texte écrit dans une scène : le corriger dans le fichier |
| `majuscule-accentuee` | « Etape », « Equipe », « Ecole »… en début de phrase | alerte | oui | — |
| `mot-double` | Le même mot deux fois de suite (« le le ») | alerte | non | Appliquer la proposition du message |
| `terme-variable` | Un mot écrit de deux façons (« e-mail » / « email ») | alerte | non | Choisir une graphie ; la noter au glossaire si c'est un mot du métier |
| `texte-petit` | Texte de moins de 3,5 cqh (`texteMinCqh`) | alerte | non | Agrandir |
| `contraste` | Couleur de la charte sur le fond de la charte : moins de 4,5:1 (`contrasteTexte`), titres moins de 3:1 (`contrasteTitres`) | alerte | non : une couleur lisible est proposée (`correction`, jamais appliquée seule : la charte est celle de la personne) | Changer la couleur de la charte. Les couleurs lisibles (`--c-primaire-lisible`, `--c-accent-lisible`) sont ajustées avec une marge de 0,5 (`margeLisible`) au-dessus du seuil |
| `texte-casse` | Un texte ou un compteur affiche « NaN », « undefined », « Infinity », « null » ou « [object Object] » | **erreur** | non | Corriger le `data-tween` ou le code de la scène |
| `glyphe-absent` | Un caractère d'un texte n'existe dans aucune police embarquée de la vidéo | alerte | non | Remplacer le caractère, ou choisir une police qui l'a |
| `emoji` | Un texte contient un emoji | alerte | non | Le retirer, ou une icône SVG dans la scène |

## Mise en page rendue

| Règle | Ce qui la déclenche | Gravité | Corrigé seul ? | Que faire |
|---|---|---|---|---|
| `debordement` | Texte qui déborde de son cadre ou sort de l'image | erreur | oui : taille réduite de 5 % en 5 %, jusqu'à 80 %, jamais sous 3,5 cqh (`ajustements` du déroulé) | Au-delà : raccourcir le texte |
| `chevauchement` | Deux éléments de contenu qui se recouvrent sur plus de 10 % (`chevauchementMax`) | alerte | non | Les écarter, ou `data-superpose` sur celui qui passe par-dessus |
| `hors-cadre` | Image, logo ou SVG qui sort de l'image | alerte | non | Le recadrer, ou le marquer comme décor |
| `marge` | Texte, image, logo ou SVG de contenu immobile à moins de 4 % (`margeMin`) du bord ; une image qui couvre plus de 90 % de l'image (photo pleine page) n'est pas jugée | alerte | non | L'éloigner du bord |
| `zone-sure` | En 9:16 : texte dans les 7 % (`zoneHaut`) du haut, les 20 % (`zoneBas`) du bas, ou les 11 % (`zoneDroite`) de droite entre 40 % (`zoneDroiteDebut`) et 85 % (`zoneDroiteFin`) de la hauteur (boutons des réseaux) | alerte | non | Raccourcir les textes ou retirer un point, sinon rapprocher du centre |
| `logo-masque` | Logo recouvert à plus de 20 % (`logoMasqueMax`), ou hors de l'image | alerte | non | Le dégager |
| `sous-titre-cache-texte` | Un sous-titre recouvre plus de 10 % (`chevauchementMax`) d'un texte de la scène | alerte | non | Sous-titres en haut (`"position": "haut"`), ou remonter le texte |
| `obstacle-forme-vide` | Élément `data-obstacle="forme"` invisible à la fin de son minutage : les particules ne s'y arrêtent pas (aussi signalé dans l'aperçu, sur l'effet) | alerte | non | Le laisser visible à la fin de son minutage, ou retirer `data-obstacle="forme"` |
| `texte-petit-lecteur` | Taille rendue d'un texte (zooms et échelles compris), ramenée à un petit lecteur : en 16:9, à 854 px (`lecteurLargeur`) de large, sous 16 px (`lecteurTexteMin`) ; en 9:16, 1:1 et 4:5, à 360 px (`telephoneLargeur`), sous 9 px (`telephoneTexteMin`) ; sous-titres compris | alerte | non | Agrandir ou raccourcir ; complète `texte-petit`, qui ne voit ni zoom ni échelle |
| `sous-titre-cache-sujet` | Un sous-titre recouvre plus de 10 % (`chevauchementMax`) d'une image, d'un SVG de contenu ou d'un personnage | alerte | non | Sous-titres en haut (`"sousTitres": { "position": "haut" }`), ou remonter l'élément |

Un effet de particules posé sur un élément que la caméra déplace le suit : sa zone est remesurée 30 fois par seconde (aucune règle n'est nécessaire).

Les sous-titres sont aussi contrôlés pour le contraste (`contraste-reel`, élément « sous-titres ») et, en 9:16, pour les zones des réseaux (`zone-sure`).

La vidéo est relevée toutes les 0,2 s (`pasMesure`) ; un élément est immobile quand il bouge de moins de 0,5 % (`immobile`) de l'image entre deux relevés.

## Images

| Règle | Ce qui la déclenche | Gravité | Corrigé seul ? | Que faire |
|---|---|---|---|---|
| `image-agrandie` | Une image tramée (png, jpg, gif, webp, avif ; pas le SVG) affichée plus de 1,12 fois (`agrandissementMax`) sa taille réelle, zoom de caméra compris, rapporté à l'export en 1080p | alerte | non | Une image plus grande (le message donne la largeur), ou l'afficher plus petite |
| `image-repetee` | Le même fichier d'`assets/` est une image de contenu (ni logo, ni `alt=""`, ni décor) dans au moins 3 scènes (`imageRepeteeScenes`) | alerte | non | En varier, ou n'en garder qu'une |

## Pixels

| Règle | Ce qui la déclenche | Gravité | Corrigé seul ? | Que faire |
|---|---|---|---|---|
| `contraste-reel` | Texte qui ne se détache pas de ce qu'il y a derrière ses lettres : moins de 4,5:1 (`contrasteTexte`), ou 3:1 (`contrasteGrandTexte`) à partir de 4,5 cqh (`grandTexteCqh`) | alerte | non : le message propose une couleur lisible sur ce fond (de la charte d'abord, sinon la même teinte plus sombre ou plus claire) | Aplat ou voile sous le texte, autre couleur, fond déplacé |
| `image-figee` | Moins de 0,5 % (`figeeSurface`) de l'image change (de plus de 2 niveaux (`figeeNiveau`) sur 255) pendant plus de 2,5 s (`tempsMort`), alors qu'un élément du contenu est minuté pour bouger pendant au moins `tempsMort` de ce passage ; décors exclus (sur la vignette, une trame fine qui glisse ne se voit pas), comme les scènes à effets, shaders ou temps figé, et la pause finale | alerte | non | Ampleur du décor (`data-tween`), une entrée de plus |
| `image-vide` | Une image unie (écart-type sous 6 (`imageVideEcart`) niveaux sur 255) pendant 1 s (`imageVideDuree`) au moins ; entrée de la première scène, dernière demi-seconde et scènes à effets exclues ; une par scène | alerte | non | Minutage des entrées ; voir aussi `transition-vide` |
| `flash` | Plus de 3 flashs par seconde (`flashMax`) sur 25 % (`flashAire`) de l'image | **erreur** | non | Ralentir ou adoucir le clignotement (risque de crise d'épilepsie) |

Comment ils se mesurent : les lettres sont les pixels qui changent de plus de 60 (`ecartLettre`) entre un rendu du texte en noir et un en blanc ; un fond est uni quand sa luminance varie de moins de 0,05 (`fondUniEcart`) sous le texte (le contrôle de la charte en juge alors). Les flashs se cherchent sur environ 12 images par seconde (`flashIps`), réduites à 64 px (`largeurFlash`) de large, en 4 cases (`flashCases`) de côté : un flash est un écart de luminance de 0,1 (`flashVariation`) au moins, dont la valeur la plus basse reste sous 0,8 (`flashSombre`). Les images figées et vides se lisent sur ces mêmes captures, en gris : aucune capture de plus.

## Rendu

| Règle | Ce qui la déclenche | Gravité | Corrigé seul ? | Que faire |
|---|---|---|---|---|
| `rendu-non-verifie` | Ni Chrome ni Edge | alerte | non | Installer l'un des deux, ou indiquer son chemin avec `PM_NAVIGATEUR` |
| `rendu-impossible` | Page en erreur, délai dépassé, navigateur introuvable à l'adresse donnée | alerte | non | Lire la cause dans le message |
| `script-interdit` | Le code d'une scène s'exécute hors de `M.chaqueImage`, ou utilise `setTimeout`, `setInterval`, `requestAnimationFrame`, `Date`, `performance.now`, `fetch`, `localStorage` | **erreur** | non | Tout calculer depuis `p` et `t` de `M.chaqueImage` (`pulse-motion reference moteur`) |
| `erreur-de-scene` | Pendant la mesure, le code d'une scène s'arrête sur une erreur (écrite dans la console) | **erreur** | non | Corriger le code de `M.chaqueImage` |
| `rendu-hasard` | Une même image d'une scène à code, à particules ou à personnage diffère d'une page neuve à l'autre (PSNR de 45 dB (`determinismePsnr`) ou moins) | **erreur** | non | Hasard seulement dans `M.chaqueImage` (il y est tiré d'une graine), rien au chargement ; ni heure ni hasard du navigateur |
| `rendu-ordre` | L'image à t change selon qu'on a d'abord montré l'image à u | **erreur** | non | Tout recalculer depuis `t` ; pas de variable gardée entre deux images |
| `preuve-non-faite` | Scène à particules à prouver, et Chrome n'a pas WebGPU sans fenêtre | info | non | — |

La preuve du déterminisme (contrôle complet) : 12 instants (`determinismeInstants`) en tout, à 10, 50 et 90 % des scènes à code (`M.chaqueImage`), à particules ou à personnage, hors transitions, capturés à 640 px (`determinismeLargeur`) dans une page neuve, dans l'ordre, puis dans une page déjà passée par le milieu et la fin, à l'envers. Elle ne se refait que pour une scène dont le code, les effets ou les personnages ont changé (empreinte gardée dans `sortie/controle.json`).

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
| `voix-couverte` | Par scène avec voix : parmi les fenêtres de 100 ms où la voix parle (au-dessus de −45 dBFS (`voixActive`)), moins de 80 % (`voixPart`) où elle dépasse de 3 dB (`voixEmergence`) la musique et les bruitages, entre 500 Hz (`voixBasse`) et 4 000 Hz (`voixHaute`) | alerte | non | `musique.volume`, `scenes[].musique: "calme"`, `data-son-volume` |
| `silence-imprevu` | Le mixage reste sous −50 dBFS (`silenceNiveau`) pendant 2,5 s (`silenceDuree`) au moins là où la musique doit jouer (humeur autre que `silence`) ; dernière demi-seconde exclue | alerte | non | Fichier de musique, partition, humeur de la scène |

À l'import d'un enregistrement de toute la vidéo, `pulse-motion voix importer` signale (`avertissement`) une scène dont moins de la moitié des mots ont été reconnus : l'écouter, et la réenregistrer seule si besoin.

« info » : rien à corriger, la personne est prévenue. Avec une voix, la durée de la scène n'est jamais corrigée seule.

## Vérification de l'export

Chaque export relit le fichier livré et écrit `sortie/verification.json` : `faites` (images, noirs, silences, sonie, crête, réécoute), `nonFaites` avec la raison, `mesures`, `problemes`. Le résumé `verification: { erreurs, alertes, fichier }` est dans le résultat de `pulse-motion exporter`. Les images viennent de statistiques prises pendant la capture (vignettes en gris de 192 px), sans seconde capture ; le fichier n'est décodé qu'une fois. Sans ffmpeg (export dans le navigateur), noirs, silences, sonie et crête sont « non faits » ; sans la transcription, la réécoute l'est aussi.

| Règle | Ce qui la déclenche | Gravité | Effet | Que faire |
|---|---|---|---|---|
| `image-parasite` | Une image isolée : `d(n)` et `d(n+1)` au-dessus de 2 niveaux (`parasitePlancher`) et de 4 fois (`parasiteFacteur`) la médiane locale, et l'image suivante revient à la précédente (saut sous 0,35 (`parasiteRetour`) fois la plus petite des deux) | alerte | — | Minutage des éléments voisins de cet instant |
| `saut-image` | L'image change d'un coup : `d(n)` plus de 3 fois (`sautFacteur`) la médiane de ses 6 voisines (`sautVoisines`) et au-dessus de `parasitePlancher` ; hors coupes, fins de transition, cartons de sous-titres, mouvements brusques du dictionnaire et séquences | alerte | — | Donner une entrée ou une sortie à l'élément |
| `noir-export` | Des images noires du fichier, sur 0,4 s (`noirDuree`) au moins (pixels sous 0,08 (`noirSeuil`)), qui ne sont pas noires dans la page | **erreur** | l'export échoue, le segment est retiré | Relancer l'export |
| `silence-export` | Un silence du fichier (`silenceNiveau`, `silenceDuree`) absent du mixage de la page | **erreur** | l'export échoue | Relancer l'export |
| `crete-export` | Crête vraie au-dessus de −1 dBTP (`creteMax`) | alerte | — | Baisser les bruitages forts ou la musique |
| `voix-inaudible` | Réécoute des scènes signalées par `voix-couverte` : moins de 85 % (`motsConfirmes`) des mots dits reconnus dans le mixage, alors que la prise seule en avait au moins autant | alerte | — | Comme `voix-couverte` |

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
| Repère voulu, affiché longtemps dans un coin (nom du module, pagination demandée) | `data-repere` |

Les seuils sont dans `scripts/seuils.json`.
