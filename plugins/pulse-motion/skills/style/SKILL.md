---
description: "Créer son propre style de vidéo, seulement sur demande expresse (« crée mon style », « un style à nos couleurs », « invente un style rétro »). Pour changer de style ou en essayer un : /pulse-motion:retoucher."
argument-hint: "[le style voulu en une phrase]"
allowed-tools: Bash(pulse-motion *) Read Glob Grep Write Edit Agent AskUserQuestion
---

# /pulse-motion:style – Créer un style personnel

Créer avec la personne un style à elle, rangé sur son ordinateur et proposé ensuite pour toutes ses vidéos, à côté des styles livrés.

## Règles

- Parler simplement, en français, sans jargon ; ne jamais montrer de commande.
- Questions avec `AskUserQuestion`, une à la fois, chacune avec des réponses proposées et une « (Recommandé) » en premier ; ne demander que ce qui ne se déduit pas de la description.
- Lexique : avant d'expliquer un mot de l'outil, lire `pulse-motion lexique` ; un mot expliqué pour la première fois se note avec `pulse-motion lexique noter "<terme>" "<phrase>" "<comme…>" "/pulse-motion:style"`.
- La commande échoue avec « Node.js introuvable » : proposer « Installer Node.js (Recommandé) » · « Je l'installe moi-même » (accord : `/pulse-motion:outils`, étape « Installer Node.js »), puis reprendre ; s'arrêter sinon.
- Seulement pour un style à soi (changer de style : `/pulse-motion:retoucher`). Rien n'est écrit avant la première réponse.
- Lire `pulse-motion reference style-personnel` avant la première question, et les goûts retenus (`pulse-motion preferences liste`) : la demande du moment, puis les préférences, puis le style de départ (`pulse-motion reference chez-soi`, section « Mémoire des goûts »).

## 1. Départ et entretien

La description vient de l'argument ; sinon, une question ouverte. Un style `baseModifiee` dans `pulse-motion styles` : `style-personnel`, « Base modifiée ».

D'abord le départ : « Adapter un style (Recommandé) » (base : l'essence la plus proche, fiche entière par `pulse-motion reference styles/<style>`) · « Partir d'une page blanche » (dire la base choisie en une ligne). Puis, une à la fois, ce qui change :

1. **Personnalité** : trois mots (trois triplets proposés), ce qu'il ne doit pas évoquer.
2. **Références** : une œuvre, une marque, un courant.
3. **Couleur** : clair, sombre ou les deux ; sobre avec une touche, affirmée, plusieurs couleurs, partout.
4. **Polices** : deux familles de Bunny Fonts (titres, texte), vérifiées avant d'être proposées.
5. **Mouvement** : vif ou doux, rebonds ou non.

Pour proposer des réponses, partir de `pulse-motion reference directions` : les trois directions de la famille la plus proche de la description (Rigueur, Calme, Énergie, Récit), avec leurs chiffres (vide, couleurs, titres ÷ texte, mouvement, matière, densité), puis écrire la direction retenue dans `identite.json` selon son tableau.

**Trois groupes**, avec les exemples de la base : sans risque, change son caractère, impossible (`style-personnel`). **5 changements au plus par tour** (hors charte) ; avant d'écrire, un résumé avant / après / ce que ça coûte, puis l'accord. Remarque floue (« ça fait cheap », « plus premium ») : `pulse-motion reference remarques`, ses options proposées, jamais appliquées en silence.

## 2. Squelette

1. Nom en minuscules et tirets (ex. `papercraft`), pas celui d'un style livré : `pulse-motion style nouveau <nom> --depuis <style>` (`--emprunts <style>` : qui prête des gestes). Dans `dossier`, `guide.md` est la fiche de la base.
2. Polices : celles de la base ou ses alternatives (`pulse-motion styles polices <base>`), jamais une `tropVues` sauf charte ; `pulse-motion police "<famille>" --dans <dossier>/polices` (`--italique` au besoin ; licence dans `polices/LICENCES.md`).
3. Écrire `identite.json` (personnalité, à éviter, genres, couleur et tons, typographie, mouvement, signature, à faire, à éviter), `charte.json` (couleurs, polices) et `style.css` (comme les styles livrés : variables de la charte, `cqh`, `--c-primaire-lisible`, `--c-accent-lisible`, `--c-sur-primaire`, `--c-sur-accent` hors décor, carré et vertical par `@container`, ton sombre par `#pm-scene[data-ton="sombre"]`). Interdits (`pulse-motion reference moteur`) : `infinite`, `counter()`, `transition:` CSS.
4. Mal rendus par l'export rapide : filtres SVG (`feTurbulence`), `mix-blend-mode`, `backdrop-filter`. Texture de papier : image embarquée (`url("texture.png")` dans `style.css`) ; ombre de découpe : `box-shadow: 1cqh 1cqh 0 …`.
5. Chaque changement accepté : `pulse-motion style noter <nom> <section> "<avant>" "<après>" "<pourquoi>"` (`--nouveau-tour` au premier d'un tour, `--charte`), puis écrit dans sa section de `guide.md`.

## 3. Scènes témoins

Base `plume` : un coin de décor d'abord (la scène `titre` seule), regardé et accepté avant toute autre scène.

1. Réécrire les scènes `titre` et `liste` du style (agent `animateur`, mode « style », une scène par agent, en parallèle).
2. `pulse-motion style planche <nom> --scenes titre,liste --ouvrir`, et à chaque tour `pulse-motion style planche <nom> --avec-base --ouvrir` (base à gauche, style à droite) ; regarder soi-même les images (`Read`).
3. Accord : « C'est ce que je veux (Recommandé) » · « Je veux changer quelque chose » (nouveau tour), jusqu'à l'accord.

## 4. Les six autres scènes

1. Un agent `animateur` (mode « style ») par scène, dans le même message : `chiffre`, `comparaison`, `etape`, `alerte`, `schema`, `conclusion`.
2. Planche des 8 scènes : `pulse-motion style planche <nom> --scenes titre,liste,chiffre,comparaison,etape,alerte,schema,conclusion --ouvrir`, aussi en `--ratio 9:16` ; `--textes maximum` : rien ne doit déborder.
3. Finir `guide.md` : ses 11 sections, chacune dite pour ce style.

## 5. Vérifier

`pulse-motion style verifier <nom>` : `erreurs` (contrat), `controle` (lecture, contrastes…), `rendu` (débordements par format et ton) : corriger jusqu'à `ok`. `avertissements` (export rapide, guide, tour de plus de 5 changements) : suivre la solution proposée. `renduVerifie` faux : le dire.

## 6. Fin

Si `renduVerifie` est faux, remplacer « est prêt » par « est prêt, mais son affichage n'a pas pu être contrôlé (Chrome ou Edge absent) ».

✅ **Fait** : le style « <nom> » est prêt ; il sera proposé pour vos prochaines vidéos.
📄 **Fichiers** : le style est rangé dans <dossier> ; pour l'utiliser sur un autre ordinateur, copiez ce dossier au même endroit.
➡️ **Ensuite** : créez une vidéo avec `/pulse-motion:creer`, ou passez une vidéo existante dans ce style avec `/pulse-motion:retoucher` (« passe en style <nom> »).
