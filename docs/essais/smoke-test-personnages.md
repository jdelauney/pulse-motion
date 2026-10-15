# Smoke test : personnages (jalon 1)

> Essai manuel, **comme le ferait une personne qui ne code pas**, entièrement par des demandes dans Claude Code : bibliothèque de mouvements, pose écrite par Claude, planche, atelier. Durée : environ 40 min.
> Prérequis : le plugin installé **et à jour** (voir [smoke-test-complet.md](smoke-test-complet.md), partie 0.2 : « vérifie mon ordinateur » doit annoncer la version du dépôt, 0.13.0 ou plus) et une vidéo d'essai déjà créée (dossier ouvert dans Claude Code).

## Comment lire ce document

Chaque étape donne **Vous dites**, **Attendu**, **À vérifier**, **À noter** (comme le smoke test complet). Les trois règles du smoke test complet valent ici : langage simple, sans jargon ni commande montrée ; choix cliquables ; mots de l'outil expliqués la première fois.

## 1. Ce qui existe (5 min)

**Vous dites** : « Quels mouvements de personnage sont disponibles ? »

**Attendu** : Claude liste les mouvements (marche, course, saut, s'accroupir, se relever, coucou, peur, repos) et les poses (debout, montrer, bras levés, mains sur les hanches, assis, penché), en mots simples.

**À vérifier** : aucun nom de fichier ni « JSON » ; les calques « respiration » et « clignement » expliqués comme des détails qui s'ajoutent à un mouvement.

## 2. Voir un mouvement (5 min)

**Vous dites** : « Montre-moi la course de face et de profil. »

**Attendu** : Claude produit la planche et vous la montre (ou l'ouvre) : deux lignes (profil, face), huit vignettes.

**À vérifier** : pieds sur la ligne de sol ; bras en opposition des jambes ; de face, les yeux restent lisibles ; la touffe suit la course.

## 3. Une pose écrite par Claude (10 min)

**Vous dites** : « Fais une pose où il se gratte la tête, l'air perplexe. »

**Attendu** : Claude crée la pose dans la vidéo, la vérifie, montre la planche, et ajuste s'il le faut (au plus deux tours) avant de vous la présenter.

**À vérifier** : la main est bien près du haut de la tête sous les trois angles ; le coude ne plie pas à l'envers ; Claude dit où il l'a rangée en mots simples (« dans les personnages de votre vidéo »).

**Vous dites** ensuite : « Il marche trop vite. »

**Attendu** : une copie de la marche, plus lente, dans la vidéo ; la planche ou une phrase le confirme ; la marche de la bibliothèque n'est pas modifiée.

## 4. L'atelier (15 min)

**Vous dites** : « Je veux régler sa pose moi-même. »

**Attendu** : l'atelier des personnages s'ouvre dans le navigateur sur la pose « gratte-tête ».

**À vérifier** :

- glisser le genou fait tourner la cuisse ; Maj + glisser la main l'amène sous la souris ; une articulation au bout de sa course devient orange ;
- les boutons de vue (profil, 3/4, face, dos) et « Tourner » ;
- « Enregistrer » : le message « Enregistré » ; enregistrer une deuxième fois sous le même nom demande avant de remplacer ;
- ouvrir « coucou » dans la bibliothèque : la frise montre les clés, ▶ joue le geste, `,` et `.` avancent image par image, les silhouettes pâles des clés voisines sont visibles ; déplacer une clé, changer sa courbe en « rebondit », Ctrl+Z annule.

**Vous dites** dans Claude Code : « Annule. »

**Attendu** : le dernier enregistrement de l'atelier est défait.

## 5. Bibliothèque du plugin (5 min, mainteneur seulement)

**Vous dites** : « Ouvre l'atelier en mode bibliothèque sur la marche. »

**Attendu** : l'atelier dit « les enregistrements vont dans la bibliothèque du plugin » ; un mouvement enregistré apparaît dans `plugins/pulse-motion/personnages/clips/` et `pulse-motion personnages verifier` reste sans erreur.

## 6. Personnages dessinés (20 min)

**Vous dites** : « Dessine-moi un cuisinier rondouillard avec une toque blanche. »

**Attendu** : Claude crée le dessin dans la vidéo, vérifie, montre le cuisinier qui marche (plusieurs angles) et la grille de ses expressions, après au plus trois tours de corrections.

**À vérifier** : aucune articulation ne laisse de trou ni de pointe ; la toque reste sur la tête quand il marche et quand il se tourne ; de face, les deux yeux et la bouche sont centrés ; de dos, pas de visage ; Claude ne parle ni de SVG ni de fichier.

**Vous dites** : « Change sa tenue en rouge. » puis « Fais-lui une tête surprise quand il salue. »

**Attendu** : la tenue change sans que le dessin soit refait ; le salut (une copie du coucou dans la vidéo) passe par la surprise.

**Vous dites** : « Je veux régler son salut moi-même. »

**Attendu** : l'atelier s'ouvre sur le salut avec le cuisinier ; la liste « Habillage » permet de revenir aux bâtonnets ; les listes « Expression » et « Bouche » changent le visage à l'instant courant ; les curseurs des sourcils marchent ; « Enregistrer » garde le choix.

## À me rapporter

- Chaque entorse aux trois règles.
- Les poses ou mouvements qui ne ressemblent pas à la demande, avec la planche.
- Tout geste de l'atelier qui ne fait pas ce qu'on attend (et la vue utilisée).
