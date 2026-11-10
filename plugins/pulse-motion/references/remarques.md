# Remarques de la personne

## L'essentiel

- La personne parle avec ses mots (« ça fait cheap », « plus premium »). Ce tableau traduit chaque impression en **2 à 4 options**, chacune un ensemble précis de réglages de Pulse Motion, avec ce qui change à l'écran en mots simples.
- **Jamais appliqué en silence** : les options passent par `AskUserQuestion`, la première « (Recommandé) », choisie selon le genre et le style de la vidéo. Rien n'est changé avant la réponse.
- **5 changements au plus par tour** ; la scène visée est demandée si la phrase ne la dit pas.
- Ce tableau est la seule source des phrases de la personne. Le diagnostic en symptômes d'image (ce que Claude voit ou mesure) est dans `pulse-motion reference realisation`, § 11 : il n'est pas répété ici.
- Les remarques laissées sur l'image dans l'aperçu se traitent une à une, avec l'image de chacune, et ne se marquent faites qu'après avoir regardé la nouvelle image (section « Remarques épinglées »).

## La personne dit → options

Les options d'une ligne sont séparées par « <br> » ; chacune donne les réglages, puis « → » et ce qui change à l'écran. « Va avec » : les réglages qui se suivent.

| La personne dit | Ce que ça veut souvent dire | Options (réglages → à l'écran) | Va avec |
|---|---|---|---|
| « ça fait cheap », « pas assez pro » | Des entrées par défaut, pas de hiérarchie, un style trop chargé | 1. entrées travaillées : #006 ou #017 au lieu d'un fondu, finition #027 → les textes arrivent avec plus de soin<br>2. hiérarchie : titre plus grand, un mot clé surligné #024 par scène → on sait tout de suite quoi lire<br>3. style plus sobre : `editorial` ou `minimal`, montrés côte à côte par `comparer` → une allure plus posée et plus nette | Un mot clé surligné par scène, pas plus |
| « trop rapide », « on n'a pas le temps de lire » | Texte resté moins que son temps de lecture | 1. `rythme` 0,8 sur les scènes citées → tout se déroule un peu plus lentement<br>2. `duree` + 1 s de tenue finale → chaque scène reste plus longtemps à l'écran une fois complète<br>3. un texte plus court, proposé → moins à lire, au même rythme | Avec une voix, la scène suit déjà la voix : raccourcir le texte d'abord |
| « trop lent », « ça traîne » | Scènes longues, transitions molles | 1. `rythme` 1,2 → tout va un peu plus vite<br>2. transitions franches : `coupe` ou `poussee` → on passe d'une scène à l'autre sans attendre<br>3. retirer une scène → une idée de moins, la vidéo raccourcit | Moins de bruitages longs |
| « plus premium », « haut de gamme » | Trop de couleurs, des mouvements trop vifs | 1. accent seul sur fond neutre, `ton` `sombre`, `rythme` 0,9, courbes douces #026 sans rebond → une image plus calme et plus chic<br>2. un élément de moins par scène, musique `corporate` avec une `intensite` plus basse → plus d'air, une ambiance retenue<br>3. style `editorial`, `minimal` ou `tech-sombre` → une autre allure, plus sobre | Palette plus sombre : vérifier le contraste |
| « plus calme », « plus doux » | Mouvements et son trop présents | 1. musique `calme`, `intensite` − 0,2 → une musique plus douce<br>2. transitions `fondu` #039 → les scènes se fondent l'une dans l'autre<br>3. retirer les secousses #036 et les particules, `rythme` 0,9 → l'image s'apaise | Bruitages moins forts |
| « plus vivant », « plus dynamique », « plus jeune » | Entrées sages, transitions lentes, musique en retrait | 1. entrées #001 ou #016 → les textes arrivent avec du ressort<br>2. transitions `poussee` ou `whip` (#041, #042) calées sur les temps → les scènes s'enchaînent avec élan<br>3. musique `entrainant`, `tempo` 120 à 128, 1 à 3 bruitages par scène → une énergie plus nette<br>4. style `energique` → une autre allure, plus vive | Mouvement plus vif et bruitages plus denses vont ensemble |
| « ça fait diaporama », « PowerPoint » | Tout entre d'un coup, puis rien ne bouge | 1. entrées échelonnées sur la voix (`mot:`) → chaque élément arrive quand on en parle<br>2. un mouvement de caméra lent #056 ou #063 → l'image vit pendant qu'on lit<br>3. transitions variées → chaque passage a son caractère | Rien d'immobile plus de 2,5 s |
| « trop chargé », « on ne sait pas où regarder » | Trop d'éléments au même instant | 1. un élément de moins par scène → l'essentiel ressort<br>2. départs décalés (`data-start`) → les éléments arrivent l'un après l'autre<br>3. retirer un effet de particules → l'image se dégage | Un seul accent par scène |
| « comme notre marque » | Couleurs, police ou logo absents | 1. couleur de la marque en accent, pas en fond → la marque se reconnaît sans écraser le texte<br>2. police de la marque pour les titres, logo à l'ouverture et à la fin → la vidéo signe comme la marque<br>3. charte depuis le logo (`charte depuis-logo`) → les couleurs viennent du logo | Vérifier le contraste de l'accent sur le fond |
| « ça manque de punch », « pas d'impact » | Le moment fort n'est pas préparé | 1. `scenes[].musique` `silence` juste avant, puis entrée #014 sur le chiffre clé → un court silence, puis le chiffre éclate<br>2. secousse #036 et bruitage d'impact → le chiffre frappe<br>3. zoom sur un détail #037 → l'œil va droit à l'essentiel | Un seul moment fort par vidéo |
| « trop enfantin » | Rebonds, couleurs vives, bruitages partout | 1. sans rebond ni élastique (#028, #029) → des mouvements plus adultes<br>2. couleurs moins saturées, bruitages réduits → une image plus posée<br>3. style `editorial` → une allure plus sérieuse | Courbes douces |
| « trop froid », « pas chaleureux » | Style ou palette distants | 1. style `chaleureux` → des couleurs et des formes plus douces<br>2. `ton` `clair`, musique `inspirant` → plus de lumière, une musique qui porte<br>3. courbes douces #026 → des mouvements plus ronds | Une voix plus proche, si la vidéo en a une |
| « fade », « terne » | Accent absent, peu de contraste | 1. accent plus présent : aplat derrière le mot clé #024 → le mot important saute aux yeux<br>2. contraste renforcé → l'image paraît plus nette<br>3. fond par shader léger (`degrade-vivant`) → le fond bouge doucement | Vérifier le contraste |
| « on ne lit pas », « c'est trop petit » | Texte trop petit, trop long ou trop court à l'écran | 1. texte plus grand, moins de mots → on lit d'un coup d'œil<br>2. tenue plus longue (`duree`) → plus de temps pour lire<br>3. vérification au format téléphone (planches de regard) → on voit ce que donne la vidéo sur un petit écran | Le mécanisme : `realisation` § 11, lignes 2 et 14 |

## Règles

1. Lire la ligne la plus proche ; plusieurs impressions dans la phrase : une question par impression, dans l'ordre où elle les dit.
2. `AskUserQuestion` avec les options de la ligne, la première « (Recommandé) » : celle qui va le mieux avec le genre (formation, produit, récit, réseaux) et le style de la vidéo. Dire chaque option par ce qui change à l'écran, jamais par ses réglages.
3. Appliquer l'option choisie comme une retouche ordinaire (sauvegarde, puis les lignes de `/pulse-motion:retoucher`), 5 changements au plus par tour ; s'il en faut plus, le dire et proposer un second tour.
4. La phrase ne dit pas la scène : la demander (« toute la vidéo » en premier si l'impression est générale).
5. Regarder le résultat (planches de regard, avant / après) avant de le montrer.

## Remarques épinglées

La personne laisse ses remarques dans l'aperçu (bouton « Remarque » ou touche N, puis un clic sur l'image), puis clique sur « Envoyer à Claude ». La boucle :

1. `pulse-motion remarques liste .` : les remarques ouvertes, ré-ancrées (si les durées ont changé, leur instant suit leur scène). Pour chacune : lire **son texte et son image** (`Read` sur `fichierImage`), et recopier sa phrase à la personne avant de rien changer (« Vous avez noté, à 0:18 : « le chiffre arrive trop tôt » »).
2. Une remarque floue passe par le tableau ci-dessus ; une remarque de goût ou de direction, ou incomprise : `pulse-motion remarques discuter <id> "<question>"`, et la question est posée à la personne.
3. Une sauvegarde d'historique par remarque (`--phrase` : la remarque), pour que « annule » défasse la dernière seulement ; appliquer comme une retouche ordinaire.
4. Après le contrôle : `pulse-motion planche . --instants <t>` (l'instant ré-ancré de la remarque, en secondes), et regarder l'image avec `Read`. Elle ne répond pas à la remarque : corriger, puis recommencer.
5. Seulement alors : `pulse-motion remarques faite <id> "<ce qui a été fait, en une phrase>"` (refusé sans cette image d'après). L'aperçu montre l'avant et l'après côte à côte.
6. Le bloc de fin liste les remarques faites et celles à discuter. Puis `pulse-motion remarques attendre .` en arrière-plan, et dire : « Laissez vos remarques sur l'image, puis cliquez sur « Envoyer à Claude » ». Son retour (nouvel envoi) relance la boucle.

Une remarque « scène retirée » (la scène a été supprimée) se discute : la recopier, demander où elle s'applique maintenant.

## À venir

- Retenir une remarque pour toutes les vidéos (mémoire des goûts : spec S4, R4).
