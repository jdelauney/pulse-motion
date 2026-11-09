# Compositions toutes prêtes à construire

## L'essentiel

- Cinq compositions qui dépassent la scène simple : le **mur de vignettes** qui apparaît en onde puis montre quelques gros plans ; la **vue d'ensemble puis parcours** ; la **signature de fin** (logo final) ; le **texte qui s'écrit par paquets** ; l'**affiche** de la page livrée.
- Chacune a ses **conditions d'emploi** et ses **contre-indications** : les lire avant de la proposer.
- Tout se construit avec le moteur actuel (`data-camera`, `data-tween`, `data-start` relatifs, classes `pm-m-*`), sauf ce qui est rangé dans « À venir ».
- **Le relief coûte cher** : une seule perspective sur le conteneur, deux ou trois niveaux d'ombre attribués d'avance, le flou posé une fois sur la caméra plutôt que sur chaque élément.
- Les délais calculés (onde, niveaux d'ombre) s'écrivent **en clair** dans les `data-start` et les attributs : la même scène donne toujours les mêmes images.

## 1. Mur de vignettes en onde, puis gros plans

**Pour** : « nos réalisations », « tout le catalogue », « vingt témoignages », une galerie de couvertures, de produits ou de photos d'équipe.
**Conditions** : 12 visuels au moins (20 et plus, c'est mieux), de même nature et de même proportion ; format 16:9 ou 1:1.
**Contre-indications** : 9:16 (le mur devient une colonne illisible), données à comparer (un graphique dit mieux), récit (pas d'ordre de lecture), démonstration d'une fonction (il faut la montrer, pas l'empiler), moins de 12 visuels (le mur paraît vide).

| Temps | Ce qui se passe | Valeurs |
|---|---|---|
| Onde | Chaque vignette entre selon son rang et sa colonne, depuis le coin haut gauche du mur | délai = 0,2 + (rang + colonne) × 0,06 s ; entrée de 0,5 s en `quint-out` (opacité 0 → 1, échelle 0,92 → 1) |
| Dérive | Le mur glisse lentement pendant toute la scène | `x` et `y` à des vitesses et des courbes différentes, pour que le trajet ne soit pas une droite |
| Gros plans | 3 ou 4 vignettes viennent au premier plan, l'une après l'autre | 1,7 s chacune (montée 0,4 s, tenue 0,9 s, descente 0,4 s), 0,6 s entre deux |
| Pendant un gros plan | Le mur s'efface derrière | caméra : saturation 1 → 0,65, flou 0 → 0,4 cqh ; voile de `--c-fond` à 60 % ; liseré d'accent de 0,4 cqh sur la vignette |

```html
<section data-scene="realisations">
  <style>
    @scope {
      .plateau { position: absolute; inset: 0; }
      .mur { position: absolute; left: 50%; top: 50%; width: 200cqh; display: grid; gap: 1.6cqh;
             grid-template-columns: repeat(var(--colonnes, 6), 1fr);
             transform: translate(-50%, -50%) perspective(200cqh) rotateX(18deg) rotateZ(-6deg); }
      .vignette { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; border-radius: 0.8cqh;
                  animation: vignette-entre 0.5s var(--ease-quint-out) both; }
      .vignette[data-niveau="1"] { box-shadow: 0 0.5cqh 1.2cqh color-mix(in srgb, var(--c-texte) 18%, transparent); }
      .vignette[data-niveau="2"] { box-shadow: 0 1.4cqh 3cqh color-mix(in srgb, var(--c-texte) 28%, transparent); }
      @keyframes vignette-entre { from { opacity: 0; transform: scale(0.92); } to { opacity: 1; transform: none; } }
      .voile { position: absolute; inset: 0; background: var(--c-fond); opacity: 0; animation: voile 1.7s var(--ease-cubic-inout) both; }
      @keyframes voile { 23.5%, 76.5% { opacity: 0.6; } }
      .loupe { position: absolute; left: 50%; top: 50%; width: 70cqh; aspect-ratio: 4 / 3; object-fit: cover;
               border-radius: 1cqh; outline: 0.4cqh solid var(--c-accent); animation: loupe 1.7s var(--ease-cubic-inout) both; }
      @keyframes loupe { 0%, 100% { opacity: 0; transform: translate(-50%, -50%) scale(0.6); }
                         23.5%, 76.5% { opacity: 1; transform: translate(-50%, -50%) scale(1); } }
    }
  </style>
  <div class="plateau" data-decor
       data-camera="x 50→46 0+13 linear; y 50→52 0+13 sine-inout;
                    saturation 1→0.65 3+0.4; flou 0→0.4 3+0.4; saturation 0.65→1 4.3+0.4; flou 0.4→0 4.3+0.4">
    <div class="mur" style="--colonnes: 6">
      <img class="vignette" src="assets/r01.jpg" alt="" data-start="0.2" data-niveau="0">
      <img class="vignette" src="assets/r02.jpg" alt="" data-start="0.26" data-niveau="1">
      <!-- … une ligne par visuel, délais et niveaux calculés d'avance … -->
    </div>
  </div>
  <div class="voile" data-decor data-start="3" data-dur="1.7"></div>
  <img class="loupe" src="assets/r08.jpg" alt="Salle du restaurant rénovée" data-start="3" data-dur="1.7">
  <!-- gros plans suivants : data-start 5.3, 7.6, 9.9 ; mêmes clauses de caméra décalées -->
</section>
```

- **Délais** : numéroter rangées et colonnes à partir de 0, depuis le coin haut gauche ; délai = 0,2 + (rang + colonne) × 0,06 s. Arrondir à 0,01 s. Ce sont les valeurs du futur mouvement numéroté du mur (spec S3), qui font foi.
- **Niveaux d'ombre** : niveau = (numéro de la vignette × 7) modulo 3. Trois niveaux suffisent ; aucune vignette n'est en vraie 3D.
- Le mur dépasse volontairement l'image : il est marqué `data-decor`. Les gros plans, eux, sont du contenu (avec un `alt`).
- Le titre de la scène vient **après** les gros plans, ou dans un bandeau hors de la caméra, jamais par-dessus l'onde.
- Son : un `souffle` au début de l'onde, un `pop` doux (`data-son-volume="0.5"`) sur chaque gros plan ; jamais un son par vignette.
- Durée : environ 3 s + 2,3 s par gros plan + 1,5 s pour le titre (13 s pour 4 gros plans).

**Variante** : *élue* (une seule vignette grandit à 1,15 pendant que la caméra floute le reste ; la vignette élue est hors de la caméra).

## 2. Vue d'ensemble, puis parcours

**Pour** : présenter un outil, un tableau de bord, un plan, un schéma en plusieurs parties.
**Principe** : montrer d'abord le tout, **complet et immobile pendant 1,5 à 2 s** (le spectateur prend la carte), puis aller voir chaque partie, puis revenir au tout. Chaque arrêt est un **moment** avec sa propre image (une action, un chiffre qui monte), pas une puce de liste.

| Temps | Caméra | Ce qui entre |
|---|---|---|
| Vue d'ensemble | `zoom 1`, 1,5 à 2 s | Le schéma complet (titres de zones ≥ 3,5 cqh à zoom 1) |
| Arrêt n | `zoom 1→1.8`, `x`, `y` vers la zone, 0,6 s `cubic-inout` ; tenue 2 à 3 s | Un carton **hors de la caméra** (fixe, lisible) avec le détail de la zone |
| Retour | `zoom 1.8→1`, 0,8 s | L'accent sur la zone qui compte le plus |

- 4 ou 5 arrêts au plus : une démonstration de ce type dure 20 à 25 s.
- Les détails ne sont pas dans le schéma : ils seraient trop petits à zoom 1, et grossis à zoom 1,8. Ils vivent dans des cartons hors du conteneur `data-camera`.
- Son : musique à 0,35 ; bruitages des arrêts à 0,55 (`data-son-volume`) ; le moment brillant à 0,7 ; le logo final à 0,85.

## 3. Signature de fin

La dernière image est la plus regardée et celle qu'on capture. Elle doit être **nette, stable au moins 0,5 s, sans fondu au noir** (sauf demande).

**Pastille** : le dernier élément se resserre en une pastille d'accent, qui s'ouvre en logo.

| Étape | Recette | Durée |
|---|---|---|
| Resserrement | Le dernier titre : échelle 1 → 0,1 et flou 0 → 0,6 cqh, `cubic-in` (keyframes de scène) | 0,35 s |
| Pastille | Un rond de `--c-accent` de 6 cqh, au même endroit : `pm-m-pop`, `--pm-dur: 0.25s`, à `#titre:fin-0.05` | 0,25 s |
| Ouverture | `<img data-logo alt="">` en `pm-m-pop` (`--pm-ampleur: 1.08; --pm-dur: 0.5s`) à `#pastille:fin` ; la pastille sort en `pm-m-sortie` (`--pm-dur: 0.15s`) | 0,5 s |
| Nom | Le nom ou la phrase de fin (`data-texte`) en `pm-m-glisse-droite`, 0,2 s après le logo | 0,6 s |
| Tenue | Rien ne bouge ; le décor de la dernière scène s'arrête 1 s avant la fin | ≥ 0,5 s |

**Mise au point** : le logo arrive du flou (`pm-m-net`, `--pm-ampleur: 0.8`), puis un reflet le traverse (#035) 0,15 s après son arrivée.

- Logo final : 18 à 25 cqh de haut, centré. Signature de coin pendant la vidéo : 7 à 9 cqh, toujours le même coin, à 4 % du bord.
- Son : `pop` sur la pastille, `carillon` ou `impact` léger sur le logo, jamais sous un mot de la voix.

## 4. Texte qui s'écrit par paquets

**Pour** : la réponse d'un assistant, un message qui se tape, une transcription en direct, un terminal.

- Aujourd'hui : `data-mots="frappe"` et `data-pas="0.08"` (mot par mot, régulier), ou `data-lettres="frappe"` (lettre par lettre, #015). Un curseur : un trait de décor (`data-decor`, `aria-hidden="true"`) qui clignote un nombre fini de fois (`animation: clignote 1s steps(2) 4 both`).
- Temps de lecture : la fin de l'écriture est vers `data-start` + nombre de mots × pas + 0,3 s ; laisser ensuite le temps de lire tout le texte.
- Une réponse longue se coupe en deux scènes plutôt que de défiler.

## 5. Affiche de la page livrée

La page `sortie/<titre>.html` s'ouvre aujourd'hui sur l'image de l'instant 0, souvent le fond seul. Une **affiche** résume la vidéo avant qu'on la lance : le titre complet, ou le chiffre clé, à l'instant où tout est en place.

- Choisir la scène qui résume (souvent `titre` ou `chiffre`), à 95 % de sa durée : tous les éléments sont entrés, aucune transition, aucun sous-titre.
- Jamais une image de transition, de flou, ni une image où un texte est à moitié écrit.

## À venir

- Mur de vignettes et effondrement en pastille comme mouvements numérotés du dictionnaire, avec leurs classes ; le mur garde les valeurs ci-dessus (spec S3, plan V5, motifs manquants ; numéros attribués par S3). Non retenus dans cette campagne : la variante « convergence » et un attribut qui calculerait seul les délais de l'onde ; reprise possible à la demande.
- Texte par paquets irréguliers : 2 à 5 caractères à la fois, intervalles de 40 à 120 ms **tirés d'une graine** pour que deux rendus soient identiques (spec S6, effet `data-lettres="saisie"` ; ses valeurs font foi).
- **Graisse qui s'affirme** : un logotype qui passe d'une graisse fine à grasse en 0,9 s, avec un interlettrage qui se resserre légèrement ; il faut une police variable embarquée, le moteur ne connaît aujourd'hui que des fichiers de graisses fixes (spec S9, typographie cinétique).
- Affiche de la page livrée, lecture au clic, retour à l'affiche à la fin (spec S5, sorties nouvelles).
- Galerie animée qui montre ces compositions rendues par le moteur (chantier B).
