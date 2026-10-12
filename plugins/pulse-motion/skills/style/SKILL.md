---
description: Créer son propre style de vidéo (« un style papercraft aux couleurs pop-art ») : allure, couleurs, polices et mouvements, vérifiés avant usage
argument-hint: "[le style voulu en une phrase]"
disable-model-invocation: true
allowed-tools: Bash(pulse-motion *) Read Glob Grep Write Edit Agent AskUserQuestion
---

# /pulse-motion:style – Créer un style personnel

Créer avec la personne un style à elle, rangé sur son ordinateur et proposé ensuite pour toutes ses vidéos, à côté des styles livrés.

## Règles

- Parler simplement, en français, sans jargon ; ne jamais montrer de commande.
- Questions avec `AskUserQuestion`, une à la fois, chacune avec des réponses proposées et une « (Recommandé) » en premier ; ne demander que ce qui ne se déduit pas de la description.
- Lexique : avant d'expliquer un mot de l'outil, lire `pulse-motion lexique` ; un mot expliqué pour la première fois se note avec `pulse-motion lexique noter "<terme>" "<phrase>" "<comme…>" "/pulse-motion:style"`.
- La commande échoue avec « node » introuvable (Node.js n'est pas installé) : expliquer qu'il faut installer Node.js en version LTS depuis https://nodejs.org, puis relancer Claude Code, et s'arrêter.

## 1. Entretien d'identité

La description vient de l'argument ; sinon, la demander en une question ouverte. Puis, une question à la fois :

1. **Personnalité** : trois mots (proposer trois triplets tirés de la description) et ce que le style ne doit pas évoquer.
2. **Références** : une œuvre, une marque, un courant (« comme les affiches de Lichtenstein ») ; proposer deux ou trois pistes.
3. **Couleur** : fond clair, sombre ou les deux ; stratégie (sobre avec une touche, couleur affirmée, plusieurs couleurs, la couleur partout).
4. **Polices** : proposer deux familles de Bunny Fonts de la bonne catégorie (titres, texte) ; vérifier qu'elles existent avant de les proposer.
5. **Mouvement** : vif ou doux, rebonds ou non.

Choisir le style de départ le plus proche (`pulse-motion styles`) : sa mise en page sera reprise puis transformée.

## 2. Squelette

1. Nom en minuscules et tirets (ex. `papercraft`), distinct des styles livrés : `pulse-motion style nouveau <nom> --depuis <style>`. Le dossier du style est dans la réponse (`dossier`).
2. Polices : `pulse-motion police "<famille>" --dans <dossier>/polices` pour chacune (ajouter `--italique` si le style emploie l'italique de cette police) (le texte de la licence est noté dans `polices/LICENCES.md`).
3. Écrire `identite.json` (personnalité, à éviter, genres, couleur et tons, typographie, mouvement, signature, à faire, à éviter), `charte.json` (couleurs par défaut, polices) et `style.css` (même règles que les styles livrés : variables de la charte, tailles en `cqh`, couleurs lisibles `--c-primaire-lisible`, `--c-accent-lisible`, `--c-sur-primaire`, `--c-sur-accent` pour tout ce qui n'est pas décor, formats carré et vertical par `@container`, ton sombre par `#pm-scene[data-ton="sombre"]` si déclaré). Interdits, comme pour une scène (`pulse-motion reference moteur`) : aucune animation sans fin (`infinite`) — la vidéo doit finir sur une image stable —, aucun compteur CSS `counter()` (numéros écrits en clair), aucune `transition:` CSS.
4. Effets à éviter, mal rendus par l'export rapide : filtres SVG (`feTurbulence`), `mix-blend-mode`, `backdrop-filter`. Une texture de papier se fait avec une image embarquée dans le dossier du style (`url("texture.png")` dans `style.css`), une ombre de découpe avec une ombre décalée (`box-shadow: 1cqh 1cqh 0 …`).

## 3. Scènes témoins

1. Réécrire les scènes `titre` et `liste` du style (agent `animateur`, mode « style », une scène par agent, en parallèle).
2. `pulse-motion style planche <nom> --scenes titre,liste --ouvrir` : la planche s'ouvre dans le navigateur de la personne ; regarder soi-même les images (avec `Read`).
3. Demander l'accord : « C'est ce que je veux (Recommandé) » · « Je veux changer quelque chose » ; corriger et refaire la planche jusqu'à l'accord.

## 4. Les six autres scènes

1. Un agent `animateur` (mode « style ») par scène, tous dans le même message : `chiffre`, `comparaison`, `etape`, `alerte`, `schema`, `conclusion`, à partir de la même identité et de `style.css`.
2. Planche des 8 scènes : `pulse-motion style planche <nom> --scenes titre,liste,chiffre,comparaison,etape,alerte,schema,conclusion --ouvrir`, aussi en `--ratio 9:16`. La planche montre des phrases d'exemple ; ajouter `--textes maximum` pour voir chaque texte à sa longueur maximale (le pire cas : rien ne doit déborder).
3. Compléter `guide.md` du style (bloc « L'essentiel », tableau des scènes avec leurs durées, classes, à faire / à éviter), sur le modèle de `pulse-motion reference styles/<style de départ>`.

## 5. Vérifier

`pulse-motion style verifier <nom>` :
- `erreurs` (contrat), `controle` (lecture, temps morts, contrastes…), `rendu` (débordements par format et par ton) : corriger, puis relancer jusqu'à `ok`. Les `avertissements` (effets mal rendus par l'export rapide) se corrigent avec la solution proposée.
- `renduVerifie` faux (Chrome ou Edge absent) : le dire ; le style reste utilisable mais les débordements n'ont pas été contrôlés.

## 6. Fin

Si `renduVerifie` est faux, remplacer « est prêt » par « est prêt, mais son affichage n'a pas pu être contrôlé (Chrome ou Edge absent) ».

✅ **Fait** : le style « <nom> » est prêt ; il sera proposé pour vos prochaines vidéos.
📄 **Fichiers** : le style est rangé dans <dossier> ; pour l'utiliser sur un autre ordinateur, copiez ce dossier au même endroit.
➡️ **Ensuite** : créez une vidéo avec `/pulse-motion:creer`, ou passez une vidéo existante dans ce style avec `/pulse-motion:retoucher` (« passe en style <nom> »).
