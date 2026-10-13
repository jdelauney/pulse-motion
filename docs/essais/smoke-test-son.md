# Smoke test : le son de Pulse Motion avec une vraie voix

> Essai manuel de bout en bout de la brique audio, **entièrement par des demandes dans Claude Code** : musique générée, bruitages, voix provisoire, studio d'enregistrement, transcription, ancres sur les mots, sous-titres, exports.
> Durée : environ 1 h 30, dont 10 à 20 min de téléchargement si la transcription n'est pas encore installée.
> Le parcours complet de création (charte, styles, retouches, style personnel) est dans [smoke-test-complet.md](smoke-test-complet.md).

Chaque étape donne :

- **Vous dites** : la phrase à taper dans Claude Code ;
- **Attendu** : ce que Claude doit faire et ce qu'on doit obtenir ;
- **À vérifier** et **À noter** : ce qu'il faut me rapporter.

Rien ne se tape dans un terminal. Pour regarder un fichier ou un résultat, demandez-le à Claude (« montre-moi le rapport du contrôle », « quels fichiers sont dans sortie ? »).

Le plus important à rapporter, ce sont les points d'écoute et de lecture (« ça sonne bien ? », « ça se lit ? ») : aucun test automatique ne peut les juger.

---

## 0. Préparation (10 min)

### 0.1 Matériel

- Un casque ou des écouteurs, pour éviter que les haut-parleurs repassent dans le micro.
- Un micro qui marche sous Windows : Paramètres → Système → Son → Entrée. Parlez : la barre doit bouger.
- Une pièce calme.

### 0.2 Plugin et dossier d'essai

1. Dans Claude Code, si le plugin n'est pas installé :
   ```
   /plugin marketplace add E:\IA-PULSE\pulse-motion
   /plugin install pulse-motion@pulse-motion
   ```
2. Créez un dossier vide `E:\IA-PULSE\essais\son-1` (avec l'explorateur de fichiers) et ouvrez Claude Code dedans.

### 0.3 L'ordinateur est-il prêt ?

**Vous dites** : `vérifie mon ordinateur`

**Attendu**
- Claude lance de lui-même la vérification des outils, sans slash commande.
- Il répond par un tableau en mots simples : Chrome ou Edge, ffmpeg, Python, transcription, voix de l'ordinateur. Pour chacun : prêt ou non, et à quoi il sert.
- Il précise que le micro se teste dans le studio.

**À noter** : les outils marqués ❌. Si la transcription est déjà prête, l'étape 6 se limitera à constater qu'elle l'est.

---

## 1. Créer la vidéo d'essai (15 min)

**Vous dites** : `/pulse-motion:creer Garder les aliments au froid : la chaîne du froid à la maison`

**Vous répondez**
- **Première ronde** : 1 min · grand public · **Rapide** · rien pour l'instant.
- **Le son** : **musique composée** · **je l'enregistre** · **sous-titres oui**.
- **Transcription** : si Claude propose de l'installer, répondez **Plus tard** (elle viendra en partie 6).
- **Déroulé** : « Je valide, avec le style … (Recommandé) ».

**Attendu**
- Le déroulé présenté a une colonne « Texte dit ».
- La voix provisoire est générée avant les scènes.
- Les scènes sont écrites, puis contrôlées.
- L'aperçu s'ouvre dans le navigateur, avec un bouton **« Voix »** dans la barre de lecture.

**Vous dites** : `montre-moi le rapport du contrôle`

**Attendu**
- Aucune erreur.
- Des alertes « voix provisoire », une par scène : c'est normal.
- Éventuellement des informations « calage approché » ou « scène allongée par sa voix ».

---

## 2. Musique générée seule (5 min)

**Vous dites** : `fais-moi écouter la musique`

**Attendu** : la musique seule est fabriquée, puis s'ouvre dans le lecteur audio de Windows.

**À vérifier à l'oreille** (au casque, en entier)

| Moment | Attendu |
|---|---|
| Première scène | Introduction sans percussion ; entrée en douceur (fondu d'entrée) |
| Ensuite | Le corps de la musique, au caractère annoncé par Claude |
| Une seconde avant la dernière scène | Une **montée** (souffle qui grimpe) |
| Dernière scène | Accord final tenu jusqu'au bout, puis **fondu de sortie**, sans coupure sèche |
| Partout | Aucun clic, craquement ni saturation ; tempo régulier |

**Variantes**
- **Vous dites** `une autre variante de la musique`, puis `fais-moi écouter la musique`. **Attendu** : même ambiance, autre enchaînement d'accords.
- **Vous dites** `plus d'intensité dans la musique`, puis réécoutez. **Attendu** : plus de couches (mélodie, batterie).
- **Vous dites** `annule` deux fois pour revenir à la musique d'origine.

**À noter** : votre ressenti (agréable ? trop vide ? trop répétitif ?), et tout défaut audible avec l'instant.

---

## 3. Voix provisoire, bruitages et sous-titres dans l'aperçu (10 min)

Dans l'aperçu, cliquez sur ▶ et regardez toute la vidéo au casque.

| Point | Attendu |
|---|---|
| Voix | La voix de l'ordinateur lit le texte de chaque scène |
| Ducking | La musique **baisse nettement** pendant la voix et remonte dans les silences |
| Bruitages | Quelques sons discrets sur les éléments clés ; un son à chaque transition, s'il y en a ; aucun son fort pendant un mot |
| Sous-titres | En bas, en 2 lignes au plus, synchronisés avec la voix ; jamais de coupure entre « 4 » et « °C » ; ils ne cachent ni texte ni logo |
| Durées | Une scène dont la voix est plus longue que prévu est allongée |
| Fin | Fondu de la musique, image stable |

**Export refusé**

**Vous dites** : `exporte ma vidéo`

**Attendu**
- Claude contrôle la vidéo, puis signale que des scènes ont encore la voix de l'ordinateur.
- Il propose : « Enregistrer ma voix d'abord (Recommandé) » · « Exporter une version de travail… ».

**Vous répondez** : « Enregistrer ma voix d'abord ». **Attendu** : Claude explique comment ouvrir le studio et **s'arrête sans exporter**.

**À noter**
- L'équilibre entre voix, musique et bruitages : un des trois est-il trop fort ou trop faible ?
- La lisibilité des sous-titres.
- Tout décalage, avec l'instant.

---

## 4. Rechargement de l'aperçu et son bloqué (3 min)

1. Lancez la lecture dans l'aperçu.
2. **Vous dites** : `change le titre de la première scène en « Le froid, c'est la santé »`.
3. L'aperçu se recharge seul, à la même position, et la lecture reprend.

**Attendu**
- Si Chrome bloque le son, la barre affiche « son bloqué par le navigateur : cliquez pour l'entendre ».
- Cliquez **une fois** sur la vidéo : le son revient et la vidéo **continue**, sans se mettre en pause.

**Vous dites** ensuite : `annule`

---

## 5. Studio : première prise réelle (10 min)

### 5.1 Ouvrir le studio

**Vous dites** : `j'enregistre la scène 1`

**Attendu**
- Claude ouvre le studio dans l'aperçu, sur la scène 1, et explique en deux phrases comment faire.
- Le panneau montre :
  - la liste des scènes ;
  - le texte en grand (prompteur) ;
  - un vumètre ;
  - les boutons Enregistrer, Arrêter, Réécouter, Garder, Refaire et Fermer, dont seuls les utiles sont actifs.

### 5.2 Prise vide (cas d'erreur)

Cliquez sur **● Enregistrer** et, au premier essai, autorisez le micro. Après le compte à rebours, **ne dites rien** pendant 3 s, puis cliquez sur **■ Arrêter**.

**Attendu** : « La prise semble vide (silence, souffle ou clic) : vérifier le micro, puis recommencer en parlant. » Rien n'est gardé.

### 5.3 Vraie prise

1. **● Enregistrer**. Après le compte à rebours, la scène se rejoue sans son.
2. Lisez le prompteur à voix naturelle, puis **■ Arrêter**.
3. **▶ Réécouter**.
4. **Garder**.

**Attendu**
- Le message dit « Prise gardée », avec « mots calés approximativement » si la transcription n'est pas installée.
- L'aperçu se recharge, et la liste indique la scène comme « (enregistrée) ».

**Vous dites** : `quels fichiers de voix ont été créés ?`

**Attendu** : une prise pour la scène 1, avec ses mots calés (et une version compressée si ffmpeg est là). Les voix provisoires des autres scènes restent à part.

### 5.4 Écoute

Relancez la lecture depuis le début.

**À vérifier**
- Votre voix est propre : pas de souffle grave et pas de saturation.
- Votre voix et la voix de l'ordinateur sont à un niveau voisin.
- La musique baisse sous votre voix.
- Les sous-titres suivent votre débit.

### 5.5 Refaire

Rouvrez le studio sur la scène 1 (« j'enregistre la scène 1 »). Enregistrez une prise **plus lente**, puis cliquez sur **Refaire** et enfin **Fermer**.

**Attendu** : la prise de l'étape 5.3 est toujours celle qu'on entend.

---

## 6. Transcription (10 à 20 min si elle n'est pas installée)

**Vous dites** : `installe la transcription`

**Attendu**
- Si elle est déjà prête : Claude le dit.
- Sinon, il explique en une phrase à quoi elle sert et sa taille (environ 800 Mo), puis demande votre accord, avec la version légère en option.
- Il installe en arrière-plan, prévient que cela prend quelques minutes, puis confirme.
- Comme la vidéo a déjà une prise, il propose de **recaler les mots**.

**Vous dites** : `recale les mots`

**Attendu** : la transcription de la prise de la scène 1 ; les sous-titres de cette scène tombent maintenant exactement sur vos mots.

**À noter** : la durée de l'installation et celle de la transcription.

---

## 7. Ancre sur un mot, recalage (15 min)

### 7.1 Ancre

Choisissez une scène dont le texte dit contient un mot à mettre en valeur (un chiffre, un mot clé). Appelons-la scène N et ce mot M.

**Vous dites** : `j'enregistre la scène N`. Enregistrez et gardez la prise.

**Vous dites** : `dans la scène N, fais apparaître <l'élément> au moment où je dis « M »`

**Attendu** : à la lecture, l'élément arrive **exactement sur votre mot**.

### 7.2 Recalage

**Vous dites** : `j'enregistre la scène N`. Enregistrez avec **une pause d'une seconde avant M**, puis gardez.

**Attendu** : sans autre retouche, l'élément attend votre mot ; les sous-titres et la durée de la scène suivent.

### 7.3 Contrôle

**Vous dites** : `montre-moi le rapport du contrôle`

**Attendu**
- « Voix provisoire » seulement pour les scènes non enregistrées.
- Aucune erreur.

---

## 8. Retouches du son (10 min)

Chaque phrase se dit telle quelle ; l'aperçu se recharge seul.

| Vous dites | Attendu à l'écoute |
|---|---|
| `baisse la musique` | Musique nettement en retrait, voix inchangée |
| `baisse ma voix` | Voix plus basse |
| `bruitages plus discrets` | Bruitages plus doux |
| `enlève les sons de transition` | Plus de souffle ni de whoosh aux transitions ; les autres sons restent |
| `sous-titres mot par mot` | Le mot dit passe en couleur d'accent, les mots à venir sont atténués |
| `sous-titres en haut` | Cartons en haut de l'image |
| `enlève les sous-titres de l'image` | Plus de sous-titres à l'image ; les fichiers de sous-titres restent livrés |
| `annule` (plusieurs fois) | Retour aux réglages d'origine |

**À noter** : le réglage que vous préférez pour le volume de la musique sous la voix.

---

## 9. Exports (15 min)

### 9.1 Enregistrer le reste

Enregistrez toutes les scènes restantes (« j'enregistre la scène 2 », etc.), ou passez directement à l'export avec une version de travail.

### 9.2 Export fidèle

**Vous dites** : `exporte ma vidéo`

Si des scènes ont encore la voix de l'ordinateur, répondez « Exporter une version de travail… ».

**Attendu**
- L'export se fait en mode fidèle (ffmpeg), en arrière-plan.
- Le résumé donne la durée, le son et le mode.
- Le bloc de fin cite le MP4, la page animée, et les fichiers de sous-titres `.srt` et `.vtt`.

**À vérifier**
- Le MP4 se lit dans VLC ou Films et TV, avec un son identique à celui de l'aperçu.
- Le `.srt` se charge dans VLC (Sous-titres → Ajouter un fichier) et s'affiche en même temps que les sous-titres incrustés.

La sonie n'est pas à mesurer ici : l'export fidèle vérifie lui-même que le son du MP4 a celle de la page (à ±1 LU), et échoue sinon. Un export réussi suffit donc.

### 9.3 Export léger

**Vous dites** : `fais-moi une version légère pour l'envoyer par courriel`

**Attendu** : un export en 720p, plus petit.

### 9.4 Reprise d'un export (facultatif)

**Vous dites** : `baisse un peu la musique`, puis `exporte ma vidéo`.

**Attendu** : l'export est nettement plus rapide, car les images déjà capturées sont reprises ; seul le son est refait.

---

## 10. Import d'un enregistrement de toute la vidéo (facultatif, 10 min)

1. Avec l'enregistreur de Windows ou votre téléphone, enregistrez **tous les textes dits d'affilée**, avec une petite pause entre les scènes. Pour les lire : « donne-moi tous les textes dits, dans l'ordre ».
2. **Vous dites** : `j'ai un fichier de ma voix pour toute la vidéo`, puis donnez le fichier (chemin ou glisser-déposer).

**Attendu**
- Claude lit le fichier où il est (sans le copier), puis l'importe en le découpant par scène.
- Une scène mal reconnue est signalée en une phrase.
- À la lecture, chaque scène commence sur sa phrase.

**À noter** : la découpe tombe-t-elle bien entre les phrases ?

---

## 11. Fiche de résultats à me renvoyer

| # | Étape | OK / KO | Remarque (instant, message, ressenti) |
|---|---|---|---|
| 0.3 | « vérifie mon ordinateur » (sans slash) | | |
| 1 | Création avec le son | | |
| 2 | Musique (agréable ? défauts ?) | | |
| 3 | Voix provisoire, ducking, bruitages, sous-titres ; export refusé | | |
| 4 | Son bloqué : un clic le débloque sans pause | | |
| 5.2 | Prise vide refusée | | |
| 5.3 | Vraie prise gardée | | |
| 5.4 | Qualité de votre voix dans le mixage | | |
| 6 | Installation de la transcription et recalage (durées ?) | | |
| 7 | Ancre sur un mot, recalage | | |
| 8 | Retouches du son (réglage préféré ?) | | |
| 9 | Exports : son identique, sous-titres en fichiers, version légère | | |
| 10 | Import d'un enregistrement entier (facultatif) | | |
| — | Une demande qui n'a pas déclenché la bonne action (noter la phrase exacte) | | |

Joignez :
- les messages d'erreur en entier ;
- vos impressions d'écoute, même vagues : ce sont elles qui feront les prochains réglages.

## En cas de problème

| Symptôme | Que dire ou faire |
|---|---|
| Pas de son à la lecture | Cliquer une fois sur la vidéo ; vérifier le volume du navigateur |
| « Le micro est refusé » | Cliquer sur l'icône à gauche de l'adresse → Micro → Autoriser, puis recharger |
| « Aucun micro n'est branché » | Vérifier le micro par défaut dans Windows (Paramètres → Son → Entrée) |
| L'aperçu n'est plus ouvert | « ouvre l'aperçu » |
| Une demande ne déclenche rien de Pulse Motion | La reformuler avec la commande correspondante, par exemple `/pulse-motion:voix j'enregistre la scène 2`, et noter la phrase d'origine |
| Revenir en arrière | « annule » |
