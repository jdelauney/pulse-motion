# Écrire une scène pour le moteur Pulse Motion

## L'essentiel

- Une scène = un fichier `scenes/NN-nom.html` qui contient **une seule** `<section data-scene="<id>">`, avec l'`id` de la scène dans `deroule.json`.
- Les textes ne s'écrivent **jamais** dans le HTML : `<h1 data-texte="titre"></h1>` est rempli avec `scenes[].textes.titre` du déroulé. Chaque clé `data-texte` doit exister dans le déroulé.
- Les temps sont **relatifs au début de la scène**, en secondes : `data-start="0.4"`, `data-start="#titre+0.3"` (début de `#titre` + 0,3 s), `data-start="#titre:fin+0.2"` (fin de `#titre` + 0,2 s). `data-dur` vaut 1 s par défaut.
- Tout ce qui bouge est **calé sur le temps** : animations CSS (`@keyframes`), `--p` (progression 0→1 de l'élément), `data-tween`. Jamais de `transition:` CSS (neutralisée), jamais de `setTimeout`.
- Tailles en `cqh` (1 cqh = 1 % de la hauteur de l'image), couleurs et polices **uniquement** par les variables de la charte : `--c-primaire`, `--c-accent`, `--c-fond`, `--c-texte`, `--f-titres`, `--f-texte`.
- Couleurs **prêtes à lire**, calculées par l'assemblage : `--c-primaire-lisible` et `--c-accent-lisible` (la couleur de la marque, foncée ou éclaircie juste assez pour se lire sur `--c-fond`), `--c-sur-primaire` et `--c-sur-accent` (noir ou blanc, pour un texte posé sur un aplat de cette couleur). Le ton (`clair` ou `sombre`) est posé sur `#pm-scene` : `#pm-scene[data-ton="sombre"]`.
- Interdits (export rapide) : `filter: url(…)`, `mix-blend-mode`, `backdrop-filter`. Interdites aussi : les ressources sur internet (images, polices, CDN).
- Après écriture : `pulse-motion assembler <dossier>` puis `pulse-motion controler <dossier>`, et corriger chaque erreur.
- Effets de particules (étincelles, confettis, fumée…) : une balise `<div data-effet="…">` minutée ; tout est dans `pulse-motion reference particules`.

## Structure d'une scène

```html
<section data-scene="chaine">
  <style>
    @scope {
      .carte { padding: 4cqh; border-radius: 2cqh; background: var(--c-fond); }
    }
  </style>
  <h2 id="titre" class="titre-moyen entre-bas" data-texte="titre" data-start="0.2" data-dur="0.7"></h2>
  <p id="detail" class="texte entre-bas" data-texte="detail" data-start="#titre:fin+0.3" data-dur="0.7"></p>
</section>
```

- Le CSS propre à la scène va dans un `<style>` avec `@scope { … }` : il ne touche pas les autres scènes.
- La section occupe toute l'image (16:9, 9:16, 1:1 ou 4:5 selon le déroulé) ; le style fournit la mise en page de base.
- Images : fichiers copiés dans `assets/` et référencés en relatif (`<img src="assets/photo.jpg" alt="…">`, `url('assets/fond.svg')`). Elles sont embarquées dans la page.
- Logo de la charte : `<img data-logo alt="">` (le moteur pose la source).

## Minutage

| Attribut | Valeur | Effet |
|---|---|---|
| `data-start` | `0.4`, `#id+0.3`, `#id-0.2`, `#id:fin+0.2` | Début de l'élément, relatif à la scène ou à un autre élément **de la même scène** (minuté, avec un `id`) |
| `data-start` | `mot:froid`, `mot:froid#2`, `mot:froid:fin`, `mot:froid+0.2` | Quand la voix de la scène dit « froid » (accents, majuscules et ponctuation ignorés ; `#2` deuxième fois, `:fin` fin du mot). Une nouvelle prise recale tout seul |
| `data-dur` | `1.2` | Durée en secondes (1 par défaut) |
| `data-tween` | `opacity 0→1 back-out; --x -10cqh→0cqh` | Interpole des valeurs pendant `[début, fin]` |

Le moteur pose sur chaque élément minuté :
- `--p` : progression de 0 (avant le début) à 1 (après la fin) ;
- `data-etat` : `avant`, `pendant` ou `apres`.

Le `rythme` du déroulé étire tous les temps d'une scène : « ralentis la scène 3 » se règle dans le déroulé, pas dans le HTML.

Une voix (`scenes[].voix`) allonge sa scène jusqu'à sa fin + 0,4 s (elle commence 0,3 s après le début de la scène, `voix.debut` pour changer) ; elle joue toujours en temps réel, même avec un `rythme`.

## Faire bouger

1. **Animation CSS** (le plus courant) : une classe avec `animation: nom durée courbe both;`. Le moteur cale l'animation sur le `data-start` de l'élément (ou de son ancêtre minuté le plus proche). Avec `both`, l'élément montre l'état de départ avant de commencer.
2. **`--p` dans le CSS** : `transform: translateX(calc((1 - var(--p)) * 20cqh));`, `stroke-dashoffset: calc(100 * (1 - var(--p)));` (tracé d'un chemin SVG avec `pathLength="100"`).
3. **`data-tween`** : `propriété départ→arrivée [courbe]`, clauses séparées par `;`. Unités identiques des deux côtés (un `0` sans unité prend celle de l'autre borne). Propriété spéciale `nombre` : affiche la valeur en français (`nombre 0→1250` → « 1 250 » ; `nombre 0→3.5` → « 3,5 »).
4. **`M.chaqueImage`** (rare) : `<script>M.chaqueImage('id-scene', function (p, t) { … });</script>` reçoit la progression `p` de la scène et son temps `t`. Seul JavaScript permis ; `Math.random()` y donne la même valeur pour la même image.

## Courbes

Nom = `<type>-<mode>` (ex. `cubic-out`, `back-inout`, `bounce-out`, `quad-spike`).

- Types : `linear`, `quad`, `cubic`, `quart`, `quint`, `expo`, `sine`, `circle`, `elastic`, `back`, `bounce`, `bell`, `power`, `step`, `swing`, `jitter`, `wave`, `tardis`, `cubic-bezier`, `ressort`.
- Modes : `in`, `out`, `inout`, `outin` ; aller-retour : `spike` (monte puis redescend, pour mettre en valeur), `arch`, `spike-arch`, `arch-spike` ; inverses : `in-inv`, `out-inv`, `spike-inv`, `arch-inv`, `spike-arch-inv`.
- Dans le CSS : `animation-timing-function: var(--ease-<type>-<mode>)` pour les types `quad` à `bounce` et les modes `in`, `out`, `inout` (ex. `var(--ease-back-out)`).

## Mise en scène

### Mouvements nommés

Le dictionnaire de mouvements (`pulse-motion reference mouvements`, fiche : `pulse-motion mouvements afficher <n° ou nom>`) donne pour chaque nom du métier (pop-in, mask reveal, whip pan…) un numéro stable et la recette exacte. Classes communes à tous les styles, sur un élément minuté : `pm-m-pop`, `pm-m-monte`, `pm-m-glisse-gauche`, `pm-m-glisse-droite`, `pm-m-zoom-entree`, `pm-m-net`, `pm-m-masque`, `pm-m-chute`, `pm-m-anticipe`, `pm-m-ecrase`, `pm-m-saccade`, `pm-m-sortie`, `pm-m-pulse`, `pm-m-tremblote`, `pm-m-va-vient`, `pm-m-surligne`, `pm-m-souligne`, `pm-m-reflet`, `pm-m-epaule` ; réglages par variables : `--pm-dur`, `--pm-courbe`, `--pm-ampleur`, `--pm-fois` (répétitions, jamais sans fin). Une scène qui a des `mouvements` dans le déroulé applique leurs recettes telles quelles.

### Tempo (caler sur la musique)

Avec `"tempo": { "bpm": 120 }` dans le déroulé (`"decalage"` : instant du premier temps, en s), toute durée peut s'écrire en **temps musicaux** avec le suffixe `t` : `data-start="4t"`, `data-dur="2t"`, `data-start="#titre:fin+1t"`, et de même dans `data-pas`, `data-camera`, `data-gel`, `data-vitesse`. Une boucle CSS se cale avec `var(--pm-temps)` (durée d'un temps) : `animation: pas var(--pm-temps) steps(2) infinite;`. Une musique composée, ou une partition dont toutes les pistes sont calées sur une scène, se cale sur les scènes : sa grille repart au vrai début de chaque scène, donc les durées de scène sont libres et les temps `t` d'une scène tombent sur la musique. Le tempo vient alors de la musique (`musique.tempo`, ou le `tempo` de la partition) : pas de `tempo` dans le déroulé. Avec une musique en fichier (`tempo.bpm`, `decalage` : instant du premier temps du fichier) ou une partition à grille continue, la musique ne bouge pas : chaque scène doit commencer sur un temps (contrôle `hors-tempo`), et une scène allongée par la voix finit sur un temps.

### Texte lettre par lettre

```html
<h1 class="titre" data-texte="titre" data-start="0.3" data-lettres="onde"></h1>
<p class="texte" data-texte="detail" data-start="#titre:fin+0.2" data-mots="monte"></p>
```

- `data-lettres` (par lettre) ou `data-mots` (par mot) : `monte` (monte de 0,5 em), `flou` (net en 0,5 s), `frappe` (machine à écrire), `onde` (saut puis petit rebond), `chute` (tombe du haut et rebondit) ; par lettre seulement : `brouille` (signes au hasard puis la vraie lettre, `--pm-lettre-dur` 0,3 s).
- `data-pas` : écart entre deux lettres ou deux mots (par défaut `frappe` 0,04 s, `onde` 0,02 s, autres 0,05 s ; mots 0,12 s). Durée d'une lettre : `--pm-lettre-dur` (ex. `style="--pm-lettre-dur: 0.3s"`).
- Le départ est le `data-start` de l'élément (ou de son ancêtre minuté). Fin de l'animation ≈ `data-start` + nombre de lettres × pas + durée d'une lettre : en tenir compte pour le temps de lecture.
- Les mots ne sont jamais coupés, les retours à la ligne du texte sont gardés ; les lecteurs d'écran lisent le texte entier. Une balise à l'intérieur du texte (`<em>`) est aplatie.

### Dégradé et contour

- `class="pm-degrade"` : texte rempli d'un dégradé, `--pm-degrade` (par défaut primaire → accent de la charte). Ex. `style="--pm-degrade: linear-gradient(90deg, var(--c-primaire), var(--c-accent))"`. Se combine avec `data-lettres`.
- `class="pm-contour"` : contour du texte, `--pm-contour` (épaisseur, 0,2 cqh) et `--pm-contour-couleur` (`var(--c-texte)`).

### Caméra et parallaxe

```html
<div data-camera="zoom 1→1.06 0+4; x 50→44 3+0.3 cubic-out; y 50→70 3+0.3 cubic-out; secousse 1.2 6+0.2">
  <div class="ciel" data-profondeur="0.2"></div>
  <div class="collines" data-profondeur="0.6"></div>
  <div class="sol"></div>
</div>
<h2 class="titre-moyen" data-texte="carton" data-start="1"></h2>
```

- `data-camera` sur un conteneur **dans** la scène (jamais sur la `<section>`), qui couvre l'image ; ce qui est **hors** du conteneur (cartons, titres) reste fixe.
- Clauses `propriété départ→arrivée début+durée [courbe]` (courbe par défaut `sine-inout`) :
  - `zoom` (1 = cadre normal, 2 = gros plan) ;
  - `x`, `y` : le point visé, en % de l'image (50 = centre) — pour un travelling, déplacer `x` ; pour un gros plan sur un personnage en (44 %, 70 %), `zoom 1→3` avec `x 50→44; y 50→70` sur la même plage ;
  - `rotation` (deg), `saturation` (1 normal, 0 gris), `flou` (cqh) ;
  - `secousse <amplitude cqh> début+durée` : tremblement amorti (impact).
- Hors de toute clause, une propriété garde sa valeur de départ (avant) ou d'arrivée (après).
- `data-profondeur` sur un enfant de la caméra : 1 suit la caméra (défaut), 0 reste fixe, 0,3 = plan lointain. Utilise la propriété CSS `translate` : ne pas l'animer soi-même sur ces plans (`transform` reste libre).
- Le décor peut dépasser l'image (`left: 150%`) : la caméra va le chercher.

### Personnages

Un personnage (bâtonnets, dessin ou illustration découpée) se pose dans la scène par un conteneur et des actions minutées comme tout élément (`data-start`, `data-dur`, références `#id:fin`, `mot:…`, temps `t`) :

```html
<div id="chef" data-personnage="cuisinier" data-x="-10" data-sol="90" data-taille="45">
  <i id="entree" data-action="marcher" data-vers="30" data-start="0.2" data-dur="1.5"></i>
  <i id="montre" data-action="pose" data-pose="montrer" data-start="#chiffre" data-dur="1.5"></i>
  <i data-action="expression" data-expression="joie" data-start="#montre"></i>
  <i id="salut" data-action="jouer" data-clip="coucou" data-start="#montre:fin"></i>
  <i data-action="courir" data-vers="115" data-start="#salut:fin+0.2" data-dur="0.8"></i>
</div>
```

- Conteneur : `data-personnage` = un dessin (`pulse-motion personnages liste --dossier .`) ou `batonnets` ; `data-x` (% de la largeur, hors cadre permis : -10, 110), `data-sol` (ligne des pieds, % de la hauteur, 90 ; ou `#id` d'un tracé : sol courbe), `data-taille` (% de la hauteur, 40), `data-vue` (0 = profil vers la droite, 90 = face), `data-calme="non"` (sans respiration ni clignement). Il couvre toute la scène ; le contrôle ne le juge pas.
- Actions (`<i>` vides, enfants du conteneur) : `marcher` / `courir` (`data-vers`, `data-dur` obligatoire ; pas de glissement, se tourne dans le sens du trajet ; `data-clip="marche-fiere"` : démarche à soi, un mouvement en boucle à la place de la marche ou de la course) ; `pose` (`data-pose`, tenue pendant `data-dur`) ; `jouer` (`data-clip` : saut, coucou… ; sa durée propre si `data-dur` manque) ; `tourner` (`data-vue`, `data-dur`) ; `expression` (`data-expression` : joie, peur… jusqu'à la suivante) ; `bouche` (`data-bouche`, `aucune` pour revenir) ; `parler` (la bouche suit les mots de la voix de la scène, depuis `data-start`, jusqu'à la fin de la scène sans `data-dur` ; la scène doit avoir une voix ; pour deux personnages, une fenêtre chacun : `data-start="mot:Bonjour" data-dur="2"`).
- **Hauteur** : `data-sol` sur `marcher` / `courir` = ligne des pieds à l'arrivée (il monte ou descend en marchant) ; nombre (% de la hauteur) ou `#id` d'un `<path>` du décor (sol courbe : colline, marches dessinées ; il le suit à chaque pas ; mettre le tracé dans le même plan de caméra et de parallaxe que le personnage, sinon ils se décalent quand la caméra bouge ; les transformations propres au décor comptent, pas celles de la caméra). `glisser` (`data-vers` et/ou `data-sol`, `data-dur`, `data-courbe` : défaut `sine-inout`) déplace sans marcher et garde la pose ou le geste en cours : surgir du bas (`data-sol="110"` sur le conteneur, puis `glisser` `data-sol="92"`), être emporté, flotter. `bondir` (`data-vers` et/ou `data-sol`, `data-dur`, `data-hauteur` : arc en % de la hauteur, 15) : un saut jusqu'à un point (corps : le mouvement `saut`, ou `data-clip`), sur une corniche, de côté. Chaque trajet part de la position et du sol atteints.
- **Groupes** : `data-groupe="6"` sur le conteneur : 6 membres (2 à 20) dépliés à l'assemblage, ids `<id>-1` (tête) à `<id>-6` ; `data-ecart` (% de la largeur entre deux membres, 5 ; positif : les suivants à gauche), `data-decalage` (retard de chaque membre sur le précédent, secondes ou `0.5t`), `data-depart="commun"` (tous partent du même x, espacés à l'arrivée), `data-variation` (0 à 0,9 : tailles légèrement différentes, toujours les mêmes). Ses actions valent pour tous, retardées (départ, `#id:fin`, `mot:…`, temps) et décalées (`data-vers − (i − 1) × écart`) ; `data-membre="4"` : seulement le 4e, sans retard. Viser un membre : `#file-4` (atteindre, regarder, objet tenu, data-start). Pas d'effet de particules dans le conteneur d'un groupe : le poser à côté, calé sur un membre.
- **Atteindre** : `<i data-action="atteindre" data-cible="#lettre" data-point="50% 0%" data-main="avant" data-start="…" data-dur="1">` : la main (`avant`, `arriere`, `deux`) va sur la cible et y reste (fondu de 0,25 s à l'entrée et à la sortie) ; le reste du corps garde sa pose ou son geste ; cible = un élément de la scène (`data-point` : point en % de l'élément, centre par défaut), un point `x% y%` de l'image, ou un personnage (sa main). **Rencontre** : deux personnages qui s'atteignent l'un l'autre au même moment se rejoignent entre leurs épaules, à `data-niveau` (`haut` : tape dans la main, `epaule` par défaut : poignée de main, `bas`) ; les placer assez près (environ deux longueurs de bras). Cible hors de portée : le bras se tend vers elle. Pas d'IK vue de face (l'effet s'estompe en approchant de la face). `atteindre` ne déplace pas l'autre personnage : pour « baisser le bras du voisin », arrêter son geste au même instant.
- **Regarder** : `<i data-action="regarder" data-cible="#pancarte" data-start="…">` : pupilles et tête vers la cible (élément, point, personnage : sa tête, `camera`), jusqu'au prochain `regarder` (ou pendant `data-dur`) ; `data-cible="aucune"` : regard libre.
- **Objets tenus** : un élément de la scène, **dans le même conteneur que le personnage**, suit sa main pendant sa fenêtre : `data-tenu-par="#chef"`, `data-start`, `data-dur` (obligatoire), `data-main` (`avant`, `arriere`, `deux` : entre les deux mains), `data-prise` (point de l'objet posé sur la main, `x% y%`, défaut `50% 100%` : milieu du bas, un manche), `data-orientation` (`droit` par défaut, ou `main` : tourne avec l'avant-bras, crayon, flèche), `data-lacher` (`reste` par défaut, `cache`, `tombe` : jusqu'au sol du porteur), `data-devant` (au-dessus du personnage) ou `data-derriere` (derrière lui). L'objet est en position absolue, et son conteneur (celui du personnage) couvre l'image. Avant la prise, il est à sa place écrite ; pendant et après, ses styles de placement (`left`, `top`, `transform`…) sont pris par la prise, même sous une animation : animer (pivoter, onduler, fumer) **un enfant** de l'objet. Passer l'objet à un autre personnage : `data-relais="#n2 à 1.5"` (à 1,5 s dans la prise, la même main — `data-main` — de `#n2` le tient jusqu'à la fin ; même conteneur), de préférence pendant une rencontre. Pour changer de main chez un même personnage : deux objets (l'un caché au lâcher, l'autre pris au même instant). Pour poser un crayon dans la main, un objet tenu vaut mieux qu'un accessoire dessiné : il peut être lâché.
- **Temps** : un personnage vit au temps de ses conteneurs : un `data-gel` sur un conteneur qui l'englobe le fige (corps, position, visage), un `data-vitesse` l'accélère. Pour qu'il bouge pendant un arrêt sur image, le placer hors du conteneur figé. Une action qui commence pendant le gel de son conteneur est retardée jusqu'à sa fin (alerte) ; après un accéléré ×2 de 2 s, ses actions arrivent 2 s plus tôt dans son temps : en tenir compte face aux éléments hors du conteneur.
- Entre deux actions : le personnage respire au repos ; chaque changement est fondu (0,25 s). Une pose ou un geste pendant une marche le fait glisser : les placer après la fin du trajet (`#entree:fin`). Une action sans `data-start` part du début de la scène.
- Placer les textes hors du chemin du personnage, ou lui faire traverser la scène quand le texte n'est pas encore là. Vérifier à la planche (`pulse-motion planche . <id>`).
- **Une pose, un geste ou une démarche manquent ?** Les créer avant de les utiliser, dans `personnages/` de la vidéo (`pulse-motion reference personnages`) : partir du plus proche (`pulse-motion personnages afficher <nom>`), `pulse-motion personnages verifier --dossier .`, regarder la planche (`pulse-motion personnages planche <nom> --dossier .`), puis l'utiliser dans la scène. Un nom inconnu est une erreur d'assemblage.

### Figer et accélérer le temps

- `data-gel="1.2+1.5"` sur un conteneur : à 1,2 s, tout son contenu s'arrête 1,5 s (image figée), puis reprend où il en était. Les éléments après le gel arrivent donc 1,5 s plus tard.
- `data-vitesse="3+2 x2"` : de 3 s à 5 s, le contenu va deux fois plus vite (`x0.5` : ralenti).
- Plusieurs plages séparées par `;`, sans chevauchement, en secondes de la scène. Sur la `<section>` elle-même, elles s'appliquent à toute la scène. S'applique aux éléments minutés, animations CSS et SVG animés du conteneur ; pas à `M.chaqueImage` ni aux effets de particules.
- Une caméra posée **sur le même élément** n'est pas figée : on gèle le décor, la caméra continue (zoom sur l'image figée). Pour désaturer pendant le gel : `saturation 1→0.4 1.2+0.3` dans la caméra.

### Son

Le son de la vidéo est **un seul mixage**, fait par le moteur dans la page (`M.rendreSon`) : musique (fondus d'entrée 0,5 s et de sortie 1,5 s, baissée de 10 dB sous la voix), voix ; le mélange à plein volume est ramené à −16 LUFS (crête sous −1,5 dBFS), puis les volumes du déroulé s'appliquent (« baisse la musique » : `musique.volume` plus bas). La lecture, l'export dans le navigateur et l'export fidèle utilisent le même : ce qu'on entend dans l'aperçu est ce qui sort dans le MP4. Voix : une prise par scène (`scenes[].voix.fichier`, `pulse-motion voix importer`), ou la voix provisoire du système (`pulse-motion voix provisoire`, refusée à l'export sauf `--avec-provisoire`). Avec la transcription (`pulse-motion whisper installer`, une fois), les mots de chaque prise prennent leurs vrais temps (`pulse-motion voix transcrire` pour les prises déjà là) ; un enregistrement de toute la vidéo se découpe seul : `pulse-motion voix importer <fichier>` sans `--scene`. Dans l'aperçu, le bouton « Voix » (ou `pulse-motion voix studio <scène>`) ouvre le studio : prompteur, compte à rebours, enregistrement au micro, réécoute, garder ou refaire. Ne pas ajouter d'élément `<audio>` dans une scène : le son passe par le déroulé. Détail (champs, ambiances, partition, sons, sous-titres, commandes) : `pulse-motion reference audio`.

### Musique générée et bruitages

- Musique générée sur l'ordinateur : `"musique": { "generee": "inspirant", "tempo": 100, "tonalite": "re", "intensite": 0.6, "graine": 7, "volume": 0.5 }`. Ambiances : `calme`, `entrainant`, `inspirant`, `corporate`, `suspense`, `tech` ; une autre `graine` donne une variante ; `intensite` ajoute des couches (basse, mélodie, percussions). Son tempo devient celui du déroulé (`data-start="2t"`). Structure calée sur les scènes : introduction sans percussion, montée avant la dernière scène, accord final.
- Partition écrite pour la vidéo : `"musique": { "partition": "assets/partition.json" }`, au format `{ "tempo": 90, "mesures": 16, "pistes": [{ "instrument": "pad", "motif": ["re3+fa3+la3 1"], "de": 0, "a": 16, "volume": 0.5 }] }`. Note : `do ré mi fa sol la si` (ou `c d e f g a b`), `#` ou `b`, octave (`re4`) ; `+` pour un accord ; `-` silence ; `x` frappe ; durée en fraction de ronde (`1`, `1/4`, `3/8`) ; vélocité facultative (`re4 1/4 0.7`). Instruments : `pluck`, `pad`, `basse`, `sub`, `kick`, `caisse`, `charleston`, `cloche`, `nappe-bruit`, `riser`.
- Bruitages : `data-son="pop"` sur un élément (le son part à son début, ancres `mot:` comprises) ; `data-son-volume="0.6"` ; un fichier du projet : `data-son="assets/sons/porte.wav"`. Sons : `whoosh`, `swoosh-inverse`, `pop`, `clic`, `tic`, `impact`, `basse`, `montee`, `carillon`, `ding`, `blip`, `souffle`. `"bruitages": { "transitions": true, "volume": 0.8 }` ajoute un son à chaque transition. Pas de son fort (`impact`, `basse`, `montee`) pendant un mot : le placer dans une pause.
- `pulse-motion musique ecouter` rend la musique seule dans `sortie/musique.wav`, pour la faire écouter.

### Sous-titres

`"sousTitres": {}` dans le déroulé : les textes dits (`scenes[].voix.texte`) deviennent des sous-titres, calés sur la voix (ou répartis sur la scène), dessinés dans la vidéo et livrés en `sortie/<titre>.srt` et `.vtt` pour les plateformes. `mode` : `ligne` (défaut) ou `mot` (le mot dit en couleur d'accent) ; `position` : `bas` (défaut) ou `haut` ; `incrustes: false` : fichiers seulement. Habillage par le style : `--pm-st-police`, `--pm-st-taille`, `--pm-st-texte`, `--pm-st-fond`, `--pm-st-accent`, `--pm-st-marge`, `--pm-st-position`.

## Ce que le contrôle regarde dans la vidéo rendue

`pulse-motion controler` rend la vidéo dans Chrome sans fenêtre et juge les **éléments de contenu** : textes (`data-texte`), images, logo (`data-logo`), SVG. Ils ne doivent pas se chevaucher, sortir de l'image, coller au bord (4 %), passer sous les boutons des réseaux en 9:16, ni masquer le logo. Pour dire ce qui est voulu :

| Cas | Marqueur |
|---|---|
| Forme, image ou calque de pur décor (fond, parallaxe, motif) | `data-decor` sur l'élément, ou dans `<div class="decor">` |
| Image décorative | `alt=""` |
| Icône SVG décorative | `aria-hidden="true"` |
| Élément posé volontairement sur un autre (texte sur une carte image, badge) | `data-superpose` sur celui qui passe par-dessus |

Il mesure aussi les pixels : le **contraste réel** de chaque texte avec ce qu'il y a derrière ses lettres (image, dégradé, décor ; au moins 4,5:1, 3:1 pour un texte de 4,5 cqh et plus) et les **flashs** : plus de 3 flashs par seconde sur un quart de l'image est une erreur (risque de crise d'épilepsie). Un texte posé sur une image a besoin d'un aplat ou d'un voile.

## Signaux d'alerte

| Vous écrivez… | Problème | À la place |
|---|---|---|
| Du texte dans le HTML | La retouche « change le titre » ne marche plus | `data-texte="clé"` + texte dans le déroulé |
| `transition: opacity .5s` | Neutralisé : l'image dépendrait du chemin | `@keyframes` + classe, ou `--p` |
| `font-size: 24px` | Ne suit pas le format de l'image | `cqh` (texte ≥ 3,5 cqh) |
| `color: #1d4ed8` | Ignore la charte de la personne | `var(--c-primaire)` |
| `data-start="#titre+1"` sur un `#titre` sans `data-start` ni `data-dur` | Référence inconnue | Minuter `#titre`, ou partir de `0` |
| `<img src="https://…">` | La vidéo ne marche plus hors ligne | Copier le fichier dans `assets/` |
| `transform: translateX(…)` animé sur toute une scène pour la parcourir | Pas de parallaxe, pas de cadrage | `data-camera="x 20→80 0+6"` |
| `data-start` calculés à la main sur la musique (1,875 s…) | Décalage dès que le tempo change | `tempo` dans le déroulé et `data-start="4t"` |
| Une scène où rien ne bouge pendant 3 s | Temps mort signalé | Décor qui dérive (`.decor .rond`) ou entrée échelonnée |
