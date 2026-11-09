# Cadres d'appareils et pointeur de souris

## L'essentiel

- Quatre cadres **génériques, sans marque** : téléphone, tablette, fenêtre d'ordinateur, navigateur. Ils servent à poser une capture ou une démonstration de logiciel de la personne. Jamais de logo, de nom ni de forme qui imite un appareil précis.
- Les dimensions sont des **proportions** (en % du cadre) : le cadre se règle par sa seule hauteur, en `cqh`.
- Le cadre est du **décor** (`data-decor`) ; ce qu'il montre (la capture) est du **contenu**, avec un `alt`.
- Le pointeur se déplace en **arc**, accélère puis freine, **tremble à peine** pendant le trajet (bruit calculé à partir du temps, donc identique à chaque rendu), **s'arrête un instant** avant de cliquer, puis clique avec un enfoncement, une onde et le son `clic`.
- Aucun texte écrit en dur dans un cadre : l'adresse, le titre d'onglet passent par `data-texte` ; la barre d'état n'a que des pictogrammes.

## Les cadres

### Téléphone

| Partie | Proportion | Remarque |
|---|---|---|
| Écran | 9 : 19,5 (les écrans courants mesurent environ 390 × 844 points) | La capture se pose en `object-fit: cover`, calée en haut |
| Bordure | 2,5 % de la largeur | `--c-texte` |
| Coins extérieurs | rayon de 14 % de la largeur ; écran : 11 % | |
| Encoche en pilule | 30 % de la largeur × 3,5 % de la hauteur, centrée, à 1,4 % du haut | Noire ou `--c-texte` |
| Barre d'état | 5,5 % de la hauteur | Pictogrammes neutres à droite (réseau, batterie), aucun chiffre |
| Barre d'accueil | 35 % de la largeur × 0,6 % de la hauteur, à 1 % du bas | |
| Taille dans l'image | 16:9 : 80 à 88 cqh de haut ; 9:16 : 70 % de la hauteur, ou pas de cadre du tout | |

### Tablette

Écran 3 : 4 en portrait ou 4 : 3 en paysage (tailles courantes autour de 768 × 1024 points) ; bordure 4 % du petit côté ; rayon 5 % ; pas d'encoche.

### Fenêtre d'ordinateur

| Partie | Proportion |
|---|---|
| Barre de titre | 4 % de la hauteur de la fenêtre, 3 cqh au moins |
| Pastilles | trois ronds de 1,2 cqh à gauche, en `--c-texte` à 25 % (pas de couleurs qui rappellent un système précis) |
| Coins | rayon de 1 cqh |
| Contenu | 16 : 10 ou 16 : 9, selon la capture |
| Ombre | deux niveaux fixes, pas de flou d'arrière-plan |

### Navigateur

Fenêtre d'ordinateur, plus un en-tête de 9 % de la hauteur : un onglet (son titre en `data-texte="onglet"`), une barre d'adresse arrondie (son texte en `data-texte="adresse"`), deux pictogrammes de navigation.

```html
<div class="navigateur" data-decor>
  <div class="entete"><span class="onglet" data-texte="onglet" data-superpose></span><span class="adresse" data-texte="adresse" data-superpose></span></div>
  <img class="ecran" src="assets/capture-accueil.png" alt="Page d'accueil du logiciel" data-superpose>
</div>
```

- Les couleurs viennent de la charte (`--c-fond`, `--c-texte` et leurs mélanges par `color-mix`) : le cadre suit le ton clair ou sombre.
- Une capture se fait à la taille réelle de l'écran imité (environ 1280 à 1440 px de large pour un ordinateur, la taille native pour un téléphone) ; une capture plus petite sera floue une fois agrandie.

## Le pointeur

### Forme

Une flèche SVG simple de 3,2 cqh de haut, remplie de `--c-texte`, contour de 0,2 cqh en `--c-fond` (lisible sur tout fond). Sa pointe est son point d'accroche : elle se place **sur** la cible, au bord du texte, jamais dessus.

### Trajet

| Réglage | Valeur |
|---|---|
| Forme du trajet | Un arc : la flèche s'écarte de la droite d'environ 12 à 20 % de la distance, toujours du même côté pour une même vidéo |
| Vitesse | Accélère puis freine (`cubic-inout`) |
| Durée | 0,35 s + 0,25 s × log₂(1 + distance ÷ 10 cqh), entre 0,4 et 1,2 s |
| Tremblement | ±0,2 cqh au plus, seulement pendant le trajet, nul au départ et à l'arrivée |
| Arrêt avant le clic | 0,15 à 0,25 s sur la cible |
| Enfoncement | échelle 0,88 en 0,06 s, retour en 0,1 s |
| Onde | cercle de `--c-accent`, de 0,2 à 4 cqh, opacité 0,6 → 0, 0,4 s `cubic-out` |
| Réaction de la cible | 0,05 s après le contact (le bouton s'enfonce, le champ s'allume) |
| Son | `clic` à l'instant du contact |

Aujourd'hui, l'arc s'écrit comme la trajectoire courbe (#030) : `--x` et `--y` vont de A à B, un troisième réglage `--arc` monte puis redescend (`sine-arch`).

```html
<svg id="pointeur" class="pointeur" viewBox="0 0 14 21" aria-hidden="true"
     data-start="1.2" data-dur="0.8"
     data-tween="--x 40cqh→95cqh cubic-inout; --y 60cqh→38cqh cubic-inout; --arc 0cqh→-4cqh sine-arch"
     style="transform: translate(var(--x), calc(var(--y) + var(--arc)) ) translate(var(--tx, 0cqh), var(--ty, 0cqh))">
  <path d="M0 0 L0 17 L4.5 13 L7.5 20 L10 19 L7 12 L13 12 Z"/>
</svg>
<i class="onde" data-start="2.2" data-dur="0.4" data-son="clic" aria-hidden="true"></i>
<script>
M.chaqueImage('demo', function (p, t) {
  // Tremblement : somme de sinus du temps (même image, même valeur), nul aux deux bouts du trajet.
  var q = Math.min(1, Math.max(0, (t - 1.2) / 0.8)), force = Math.sin(Math.PI * q);
  var dx = force * (0.12 * Math.sin(t * 7.3 + 1.1) + 0.08 * Math.sin(t * 12.9 + 2.3));
  var dy = force * (0.12 * Math.sin(t * 6.1 + 0.4) + 0.08 * Math.sin(t * 11.3 + 3.7));
  var el = document.getElementById('pointeur');
  el.style.setProperty('--tx', dx.toFixed(3) + 'cqh');
  el.style.setProperty('--ty', dy.toFixed(3) + 'cqh');
});
</script>
```

- Ne pas utiliser `Math.random()` pour le tremblement : il change à chaque image et donne un grésillement, pas une main.
- Le clic (2,2 s) vient après la fin du trajet (2,0 s) et l'arrêt de 0,2 s.

### Règles

- Un seul pointeur à l'écran.
- Il ne cache jamais le texte qu'on doit lire ; il reste visible 0,5 s après le dernier clic, puis sort ou s'efface.
- Après un clic dans un champ, le texte tapé arrive par mots (`pulse-motion reference compositions`, texte qui s'écrit).
- Un clic important mérite un zoom (#037) une fois le clic fait, pas pendant le trajet.

## À venir

- Classes communes des quatre cadres et pointeur prêt à l'emploi, avec un attribut qui décrit les étapes (« aller sur #bouton, cliquer, taper dans #champ ») et calcule seul arc, durée, tremblement et onde à partir d'une graine ; projecteur et anneau autour d'un élément ; positions des clics reprises d'une application filmée puis figée (spec S6, tutoriels logiciels).
- Cadre de téléphone autour d'une vidéo 9:16 à l'export (spec S5, sorties nouvelles).
