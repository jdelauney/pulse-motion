# Pièges d'animation dans une scène Pulse Motion

## L'essentiel

- Le moteur écarte d'office la plupart des pièges des animations faites à la main (horloge, enregistrement, polices, ressources) : **ne pas les recoder**.
- Il en reste une dizaine qui dépendent de la scène elle-même : conteneur non positionné, caractère absent de la police, mise en page figée sur un nombre d'éléments, trou entre deux éléments, `M.chaqueImage` qui garde une mémoire, fausse interface, fondu au noir final, couleur écrite en dur, animation sans fin.
- Chaque piège a un **symptôme** visible dans l'aperçu ou la planche : le reconnaître avant de chercher ailleurs.

## Les pièges qui restent

| Piège | Symptôme | Correction |
|---|---|---|
| Élément en `position: absolute` dans un conteneur qui n'est pas positionné | L'élément se place par rapport à toute la scène, loin de sa carte ; ou un titre passe derrière la caméra | `position: relative` sur le conteneur ; un titre placé après un conteneur `data-camera` prend `position: relative` |
| Caractère absent de la police du style (⌘, ⏎, ␣, coches, emoji) | Carré vide, ou un signe dans une autre police | Écrire en mots, ou icône SVG `aria-hidden="true"` (`pulse-motion reference anti-cliches`) |
| Grille écrite pour un nombre fixe d'éléments | « Ajoute un point » ou « retire une photo » casse la mise en page | Nombre de colonnes en variable (`--colonnes`), ou `grid-template-columns: repeat(auto-fit, minmax(…))` ; dans une scène toute faite, retirer les éléments sans clé |
| Un élément sort avant que le suivant entre | Image vide au milieu d'une scène : ça ressemble à une panne | Faire entrer le suivant avant la fin de la sortie : `data-start="#ancien:fin-0.2"` ; un vide de plus de 0,3 s doit être voulu |
| `M.chaqueImage` qui garde une mémoire d'une image à l'autre (`x += vitesse`) | L'aperçu et l'export diffèrent ; un saut dans la barre de lecture donne une autre image | Calculer **tout** à partir de `t` ou `p` à chaque appel ; aucune variable modifiée hors de la fonction |
| `Math.random()` pour un mouvement continu | Grésillement : la valeur change à chaque image (le moteur la tire de nouveau à chaque image pour qu'elle soit reproductible) | Une somme de sinus de `t` pour un tremblement doux ; `Math.random()` seulement pour une valeur tirée une fois et figée |
| Mesure d'un texte au chargement du script | Position fausse si la mesure précède la mise en page | Mesurer dans le rappel de `M.chaqueImage`, jamais au chargement ; mieux, placer en CSS |
| Barre de progression, minuteur, « 3/6 » dessinés dans l'image | Doublon du lecteur ; faux dès qu'on coupe la vidéo | Les retirer, sauf demande (`pulse-motion reference anti-cliches`) |
| Fondu au noir en fin de vidéo | La dernière image, celle qu'on retient et qu'on capture, est vide | Finir sur l'image stable ; pas de sortie sur la dernière scène |
| Couleur écrite en dur sur un élément présent partout (logo de coin, numéro, mention) | Invisible sur le fond sombre d'une scène, ou après « passe en sombre » | Variables de la charte et couleurs lisibles (`--c-texte`, `--c-accent-lisible`) |
| Animation sans fin (`infinite`) | Rien n'est stable à la fin ; contrôle `pause-finale` | Un nombre de répétitions (`--pm-fois`, `animation-iteration-count: 3`) |
| Numéros produits par un compteur CSS (`counter()`) | Numéros absents des contrôles de texte, faux après une retouche | Numéros écrits dans le déroulé (`"numero": "2"`) |

## Ce que le moteur rend impossible

Ces pièges, fréquents ailleurs, n'existent pas dans une scène Pulse Motion. Inutile de s'en prémunir ; ne pas recoder ce que le moteur fait.

| Piège ailleurs | Pourquoi il ne se pose pas ici |
|---|---|
| Animation menée par l'horloge réelle (`requestAnimationFrame`, `setTimeout`, `transition:` CSS) | Le temps est celui du moteur, image par image ; `transition:` est neutralisée, `setTimeout` interdit (`pulse-motion reference moteur`) |
| Images sautées quand l'ordinateur rame à l'enregistrement | L'export calcule chaque image l'une après l'autre ; 60 images par seconde sont 60 vraies images, pas des doublons |
| Signal « la page est prête », fonction pour sauter à un instant | Le moteur les fournit (`M.pret`, saut dans la barre de lecture) |
| Polices pas encore chargées au début de l'enregistrement | Polices embarquées dans la page ; le moteur attend qu'elles soient prêtes avant la première image |
| Boutons et barre de lecture enregistrés dans la vidéo | L'export ne capture que la scène, jamais le lecteur |
| Script ou feuille de style externe refusé par le navigateur en fichier local | L'assemblage embarque tout dans une seule page |
| Ressources sur internet (polices en ligne, bibliothèques, images) | Interdites ; le contrôle les refuse (`ressource-distante`) |
| Dossiers temporaires qui se mélangent entre deux exports | Affaire de l'export, pas de la scène |
| Effets mal rendus à l'export (`filter: url(…)`, `mix-blend-mode`, `backdrop-filter`) | Interdits dans les scènes et signalés par `pulse-motion style verifier` dans les styles |

## À venir

- Alertes du contrôle pour les caractères absents de la police et pour les fausses interfaces (spec S2).
- Détection, sur le rendu, des images vides au milieu d'une scène, des gels et des sauts (spec S2).
