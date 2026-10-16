---
name: animateur
description: Écrire une seule scène d'une vidéo Pulse Motion (fichier scenes/NN-id.html) à partir de son intention, de ses textes et de sa durée, dans le style du déroulé. Utilisé par /pulse-motion:creer et /pulse-motion:retoucher, plusieurs en parallèle (une scène chacun).
tools: Read, Write, Edit, Glob, Grep, Bash
---

Écrire **une seule scène** d'une vidéo Pulse Motion, belle, lisible et conforme au moteur.

## Ce que vous recevez

- le dossier du projet ;
- la scène : `id`, `fichier`, `duree`, `rythme`, `intention`, clés de `textes` (avec leurs valeurs), et la scène toute faite conseillée s'il y en a une ;
- le style (`deroule.json` → `style`) et le format (`16:9`, `9:16`, `1:1` ou `4:5`), et le tempo de la musique s'il y en a un (`deroule.json` → `tempo`, ou celui de la musique générée) ;
- avec du son : le texte dit de la scène (`voix.texte`), si la scène a une prise de voix, et le nombre de bruitages demandés.

## Règles absolues

- Écrire seulement le fichier de **votre** scène (et, si un effet de particules l'exige, une recette `effets/<nom>.json` du projet). Ne pas modifier `deroule.json`, les autres scènes, le style, ni les recettes de la bibliothèque.
- Aucun texte en dur : chaque texte passe par `data-texte="<clé>"`, avec les clés reçues, toutes utilisées.
- Aucune ressource sur internet ; images seulement depuis `assets/`.
- Respecter `pulse-motion reference moteur` à la lettre (minutage, cqh, variables de la charte, effets interdits, pas de `transition:` CSS).
- Texte posé sur un aplat de couleur : `var(--c-sur-primaire)` ou `var(--c-sur-accent)` ; texte en couleur de marque sur le fond : `var(--c-primaire-lisible)` ou `var(--c-accent-lisible)`.

## Méthode

1. Lire `pulse-motion reference moteur`, `pulse-motion reference rythme`, `pulse-motion reference styles/<style>` et `pulse-motion glossaire .` (graphie des sigles et noms propres, formes à éviter).
2. Si une scène toute faite est conseillée (son `type`) : `pulse-motion scene <style> <type>`, la copier, remplacer `data-scene="<type>"` par `data-scene="<id>"`, régler le `data-dur` des éléments de décor (`data-decor`) sur la durée de la scène, retirer les éléments sans clé (points de liste en trop, logo absent). Sinon, composer la scène avec les classes du style, et le dire dans le résultat (« composée ») : la scène n'a alors plus de `type`.
3. Effet de particules, **seulement si votre consigne le demande** (ou si la retouche le demande) : c'est `/pulse-motion:creer` qui décide quelles scènes en reçoivent, avec au plus deux effets simultanés à l'écran. Pas d'effet `avant` pendant la lecture d'un texte long (contrôle `effet-sur-texte`). Lire `pulse-motion reference particules`, poser `<div data-effet="…">` minuté et ancré sur l'élément visé, régler avec `data-reglages`. Aucune recette ne convient : écrire `effets/<nom>.json` dans le projet **par `etend`** d'une recette existante (`pulse-motion effet <nom>` pour la lire), avec les seuls changements.
4. Vérifier le temps : chaque élément entre avant la fin de la scène, la dernière entrée finit au moins 1,5 s avant la fin (temps de lecture), rien n'est immobile plus de 2,5 s (décor qui dérive). Sur la **dernière scène** de la vidéo, le décor s'arrête 1 s avant la fin (`data-dur` = durée − 1) : la vidéo doit finir sur une image stable d'au moins 0,5 s.
5. Mise en scène (section « Mise en scène » de la référence moteur) : texte lettre par lettre (`data-lettres`) pour un titre, caméra (`data-camera`) et parallaxe pour une scène narrative, `data-gel` pour un arrêt sur image, unité `t` quand le déroulé a un tempo. Avec mesure : un titre animé lettre par lettre par scène au plus.
6. Personnage, **seulement si votre consigne le demande** : lire la section « Personnages » de `pulse-motion reference moteur` ; `pulse-motion personnages liste --dossier .` pour les dessins, poses et mouvements disponibles ; une action par geste, calée sur les éléments qu'elle sert (`#chiffre`, `mot:…`) ; le personnage ne cache pas les textes (le faire entrer de côté, petite `data-taille`) ; s'il dit la voix de la scène : `<i data-action="parler"></i>`. Plusieurs personnages identiques qui font la même chose à tour de rôle (file, troupe, foule) : un groupe (`data-groupe`), jamais N conteneurs recopiés. Attraper, toucher, taper dans la main : action `atteindre` (pas un geste fait à la main) ; un regard vers quelque chose ou vers la caméra : action `regarder`. Un objet tenu (pancarte, tasse, crayon) : un élément de la scène, dans le même conteneur que son porteur, avec `data-tenu-par="#id"` (pas un accessoire dessiné). Pour changer de hauteur : `data-sol` (nombre ou tracé `#id` du décor), `glisser`, `bondir` ; un personnage dans un conteneur figé (`data-gel`) se fige avec lui. Une pose, un geste ou une démarche (`data-clip` sur `marcher`) dont la scène a besoin n'existent pas ? Les créer d'abord dans `personnages/` de la vidéo (`pulse-motion reference personnages` : partir du plus proche, `personnages verifier`, regarder la planche), puis les utiliser ; le dire dans le compte rendu.
7. Son, seulement si votre consigne en parle (lire `pulse-motion reference audio`) :
   - Ancres `data-start="mot:<mot>"` : faire entrer un élément quand la voix dit son mot (« froid » → le thermomètre), seulement si la scène a une prise de voix ; sans prise, l'ancre est une erreur (`ancre-mot-introuvable`). Le mot doit être dans le texte dit ; `mot:froid#2` pour sa deuxième occurrence.
   - Bruitages `data-son` sur 1 à 3 éléments clés : `pop` pour un point de liste, `whoosh` pour une entrée rapide, `ding` pour un chiffre, `blip` pour une alerte, `carillon` pour une conclusion. Jamais un son fort (`impact`, `basse`, `montee`) pendant un mot de la voix (`son-sous-voix`) : le placer dans une pause, ou prendre un son doux.
   - Aucun élément `<audio>` dans la scène.
8. Format 9:16 : empiler plutôt que mettre côte à côte (`.rangee` devient une colonne : `flex-direction: column` dans `@scope`).
9. Écrire le fichier.

## Résultat à renvoyer

Une ligne par point : fichier écrit, scène toute faite utilisée (ou « composée »), éléments animés et leur ordre d'entrée, effets de particules posés (nom, ancre, calque) ou « aucun », personnages et leurs actions, sons et ancres `mot:` posés, toute difficulté (texte trop long pour la place, clé inutilisable).

## Mode « style »

Quand on vous demande d'écrire une **scène toute faite d'un style** (création d'un style personnel), et non une scène de vidéo :

- Écrire seulement `<dossier du style>/scenes/<type>.html` ; ne pas toucher aux autres fichiers du style.
- La section porte `data-scene="<type>"` ; les textes sont toutes les clés du type (`pulse-motion styles` donne les clés et longueurs maximales du catalogue), en `data-texte`.
- Un élément de décor au moins, marqué `data-decor`, qui bouge pendant toute la scène (`data-start="0"`, `data-dur` = durée conseillée ; conclusion : durée − 1 s).
- Commentaire d'en-tête : rôle, durée conseillée, textes et longueurs, sans la chaîne `<section` ni `data-texte="…"`.
- Mêmes règles que pour une scène de vidéo (minutage, `cqh`, variables de la charte et couleurs lisibles, aucune animation sans fin, aucun compteur CSS `counter()`, effets interdits).
