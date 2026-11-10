# Écran, pointeur et mise en valeur (tutoriels de logiciel)

## L'essentiel

- Un logiciel montré dans une scène passe par le composant commun `pm-ecran` (tous les styles) : une capture fournie (`<img src="assets/…" alt="…">`) ou une maquette en HTML, dans un cadre, avec un pointeur, des clics, un projecteur et des zooms dessinés par le moteur. Ne jamais dessiner le pointeur à la main.
- Une capture reste vraie : on la montre, on la désigne, on la zoome ; on ne la retouche pas. Une maquette reste une maquette.
- Les positions se donnent sur l'image : `#id` d'un élément de l'écran (maquette), `x%,y%` d'un point de l'image (capture) ou `x%,y%,l%,h%` d'une zone. Regarder la capture pour estimer les positions, puis vérifier sur une planche (`pulse-motion planche . <scène> --de <s> --duree <s>`).
- Le `data-start` d'un geste est l'instant du clic : toutes les ancres marchent (`mot:enregistrez`, `#titre:fin+0.5`). Le pointeur part 0,35 s plus son trajet (0,3 à 1,1 s) avant ; laisser au moins 1,5 s entre deux gestes (contrôle `etapes-trop-rapprochees`).
- Tout est une fonction du temps : même image à chaque rendu, aperçu et export identiques, `data-gel` et `data-vitesse` sur l'écran ralentissent ou figent aussi le pointeur.

## L'écran

```html
<div class="pm-ecran pm-m-monte" data-cadre="navigateur" data-adresse="https://app.exemple.fr/factures" data-start="0" style="--pm-ecran-l: 110cqh">
  <img src="assets/factures.png" alt="Liste des factures de l'application">
  <i class="pm-clic" data-cible="86%,12%" data-start="mot:nouvelle"></i>
  <i class="pm-projecteur" data-cible="60%,70%,32%,10%" data-start="3.2" data-dur="2.5"></i>
</div>
```

| Attribut ou variable | Valeurs | Effet |
|---|---|---|
| `data-cadre` | `navigateur` (défaut), `fenetre`, `telephone`, `tablette`, `presentation`, `aucun` | Cadre dessiné autour de l'image |
| `data-adresse` | adresse du site | Navigateur : seul le nom de domaine est montré (jamais le chemin ni les paramètres) |
| `data-titre` | texte court | Fenêtre : titre de la barre |
| `data-page` | `1280x800` (défaut ; téléphone `390x844`, tablette `820x1180`) | Taille de la page montrée, en pixels : règle la taille du pointeur, des cercles, des coins |
| `data-pointeur` | `fleche` (défaut), `main`, `doigt` (défaut sur téléphone et tablette), `aucun` | Forme du pointeur ; le doigt apparaît 0,15 s avant le toucher, sans trajet |
| `data-pointeur-depart` | `72%,78%` | Où attend le pointeur avant le premier geste |
| `data-pointeur-vitesse` | `1` | Facteur de la durée des trajets : `1.4` si « le pointeur va trop vite » |
| `data-film-camera` | `suivre` | Un zoom par geste, enchaînés, puis un recul ; un `data-camera` sur l'écran le désactive (`suivre-desactive`) |
| `--pm-ecran-l` | `min(120cqh, 88cqw)` ; téléphone `min(36cqh, 80cqw)`, tablette `min(54cqh, 80cqw)`, présentation `min(110cqh, 80cqw)` | Largeur de l'image de l'écran ; la hauteur suit `data-page` |
| `--pm-ecran-fond` | `#fff` | Fond sous une capture plus petite que l'écran |

- L'image garde ses proportions (`contain`). Une capture de la taille réelle de la page (1280 × 800 ou plus) reste nette une fois zoomée.
- Le cadre `telephone` est celui de l'export en téléphone (corps sombre, bord fin, pastille de caméra) ; une capture d'ordinateur ne va pas dans un téléphone : c'est une autre capture.
- `presentation` pose l'image sur un fond en dégradé de la charte, avec une marge de 3,7 cqh et une ombre.
- Format 9:16 : réduire `--pm-ecran-l` (le téléphone y tient tel quel).

## Les gestes

| Marque | Ce qu'elle fait |
|---|---|
| `<i class="pm-clic" data-cible="…" data-start="…">` | Trajet en arc (à graine), pause de 0,35 s, enfoncement du pointeur, cercle de localisation qui se resserre (0,7 s), bruitage `clic` (`data-son="aucun"` : sans), et l'élément visé s'enfonce comme #081 |
| `<i class="pm-double-clic" …>` | Deux clics à 0,15 s d'écart |
| `<i class="pm-survol" …>` | Le pointeur arrive et reste, sans clic |

Le pointeur vise le bas gauche du libellé (8 % de la largeur, 78 % de la hauteur de la cible) pour ne pas le cacher, ou le centre d'une petite cible (moins de 48 px).

## Les mises en valeur

| Marque | Ce qu'elle fait | Durée par défaut |
|---|---|---|
| `<i class="pm-projecteur" data-cible="…" data-start="…">` | Tout l'écran s'assombrit à 70 % (`--pm-projecteur`) sauf la cible (marge 12 px, coins 10 px, bord adouci) | 3 s, entrée et sortie de 0,4 s |
| `<i class="pm-anneau" …>` | Anneau d'accent de 3 px qui pulse toutes les 1,5 s | 3 s |
| `<i class="pm-assombrir" data-start="…">` | Le reste de la scène, hors de l'écran, pâlit à 30 % | 3 s |
| `<i class="pm-zoom" data-cible="…" data-start="…" data-dur="…">` | L'image se rapproche de la cible (40 % de la largeur, de 1,3 à 2,5 ; `data-echelle` pour imposer), entrée et sortie de 0,4 s | 2,4 s |

Deux zooms dont le second commence moins de 1,5 s après la fin du premier ne repassent pas au plan large : un panoramique d'au plus 1 s va d'une cible à l'autre. Au-delà, retour au plan large. Un clic important : un zoom une fois le pointeur arrivé, pas pendant son trajet.

## Le texte tapé

`data-lettres="saisie"` sur un champ ou une ligne : le texte se tape par paquets de 1 à 3 lettres, irréguliers mais les mêmes à chaque rendu (graine : le texte et la scène), plus lentement après une espace ou une ponctuation, avec un curseur qui clignote après la dernière lettre. Pour un rythme régulier : #015 (`frappe`).

## Les blocs « interface »

`pulse-motion bloc` les liste ; `pulse-motion bloc <nom>` donne le HTML à copier (textes en `data-texte`, icônes en `data-icone`, couleurs de la charte). Génériques : jamais l'aspect d'une marque ni d'un système.

| Bloc | Pour |
|---|---|
| `notification` | Un message qui glisse du coin (icône, appli, « maintenant », titre, texte) |
| `toast` | Une confirmation brève en bas (coche), ou une alerte (`data-variante="alerte"`) |
| `publication` | Une publication de réseau social générique (avatar, nom, @, texte, compteurs) |
| `carte-appli` | Une application : icône, nom, sous-titre, bouton |
| `bandeau-nom` | Le nom et la fonction d'une personne, en bas à gauche |
| `commande` | Une commande et son bouton « Copier » qui devient « Copié » à l'instant de `pm-bloc-copier` ; variante `data-variante="terminal"` : des lignes d'invite tapées (`saisie`) et leurs réponses, les anciennes montent |
| `consigne` | « 2. Cliquez sur Nouvelle facture » : pastille numérotée et phrase de l'étape |
| `revelation-3d` | Une capture qui se redresse de 35° à plat (classe `pm-3d`) |
| `liste` | Une liste déroulante ouverte, l'option choisie (`pm-bloc-choisie`) mise en valeur à son instant |
| `dialogue` | Une boîte de dialogue, le bouton choisi enfoncé à son instant |
| `carte-graphique` | Une carte de tableau de bord : titre, chiffre clé et graphique qui pousse (`data-graphique`, données dans le déroulé : `pulse-motion reference explication`) |
| `carte-organigramme` | Une carte d'organigramme : un responsable et trois équipes reliées par des flèches qui se tracent (`data-fleche`) |

## Un film

Une application filmée par `/pulse-motion:filmer` se montre dans le même écran, sans `<img>` : le moteur pose les images de la prise choisie, une par instant.

```html
<div class="pm-ecran pm-m-monte" data-film="factures" data-etapes="2-4" data-film-camera="suivre" data-start="0">
  <i class="pm-etape" data-etape="2" data-start="mot:nouvelle"></i>
  <i class="pm-zoom" data-cible="etape:3" data-start="4.2" data-dur="2.4"></i>
  <i class="pm-projecteur" data-cible="etape:4" data-start="7"></i>
</div>
```

| Attribut ou marque | Effet |
|---|---|
| `data-film` | Le nom du film (`films/<nom>/`, prise choisie) ; sa taille de page, ses couleurs de bords (cadre `presentation`) et son appareil (cadre `telephone` ou `tablette` par défaut) viennent du tournage |
| `data-etapes` | Les étapes montrées (`2-4`, `1,3`) ; sans lui, le `film.etapes` de la scène du déroulé, sinon toutes |
| `<i class="pm-etape" data-etape="N" data-start="…">` | L'instant de l'action de l'étape N (le clic, la première lettre tapée) ; toutes les ancres marchent (`mot:enregistrez`) |
| `data-cible="etape:N"` | La cible relevée au tournage, pour un zoom, un projecteur, un anneau |
| `<div class="pm-bloc pm-bloc-liste" data-film-etape="N" data-choix="1">` | Bloc `liste` rempli par les options relevées et l'option choisie (mise en valeur à `data-choix`) ; `pm-bloc-dialogue` : le message de la boîte de dialogue |

- Sans marque, une étape se place après la précédente et le temps libre de la scène se partage entre les états calmes. Deux actions sont séparées d'au moins la réaction de la première, 0,35 s, le trajet du pointeur et 0,2 s (`etapes-trop-rapprochees`) ; le déroulé vérifie que la scène dure assez.
- Le pointeur va seul vers chaque cible ; chaque étape de clic reçoit le bruitage `clic` (`data-son="aucun"` sur sa marque : sans).
- `data-vitesse` sur l'écran accélère la réaction (« accélère la saisie » : `data-vitesse="3.1+2 x2"`) ; `data-gel` la fige.

## À venir

Les sites en ligne, la connexion à un compte et le flou des données personnelles (spec S6, plan 3), l'import d'une vidéo de l'écran (plan 4).
