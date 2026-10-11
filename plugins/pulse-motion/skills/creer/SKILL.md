---
description: Créer une vidéo de motion design en quelques questions, valider son déroulé, puis la regarder dans le navigateur
argument-hint: "[le sujet de la vidéo en une phrase]"
disable-model-invocation: true
allowed-tools: Bash(pulse-motion *) Bash(node *) Read Glob Grep Write Edit Agent AskUserQuestion
---

# /pulse-motion:creer – De l'idée à la vidéo

Guider une personne **sans notion de code** de son idée jusqu'à une vidéo animée qu'elle regarde dans son navigateur. Une vidéo = le dossier courant.

## Règles

- Parler simplement, en français, sans jargon (pas de « HTML », « JSON », « CSS » dans les messages à la personne : dire « le déroulé », « la scène », « l'aperçu »).
- Vocabulaire : **genre** (ce que fait la vidéo), **style** (à quoi elle ressemble), **charte** (logo, couleurs, polices), **déroulé** (la liste des scènes), **parcours** (rapide ou accompagné).
- Questions avec `AskUserQuestion`, 4 au plus par ronde, une option « (Recommandé) » en premier.
- Ne jamais montrer de commande à la personne ; les lancer soi-même.
- Lexique : avant d'expliquer un mot de l'outil (déroulé, scène, style, charte, transition, export…), lire `pulse-motion lexique`. Un mot déjà noté n'est pas réexpliqué en entier ; un mot expliqué pour la première fois se note avec `pulse-motion lexique noter "<terme>" "<phrase>" "<comme…>" "/pulse-motion:creer"`, en reprenant l'image fixe du lexique quand elle existe.

## 0. Vérifier

`pulse-motion etat .`
- La commande échoue avec « node » introuvable (Node.js n'est pas installé) : expliquer qu'il faut installer Node.js en version LTS depuis https://nodejs.org (Windows et macOS : programme d'installation ; Linux : gestionnaire de paquets), puis relancer Claude Code. S'arrêter.
- `node.ok` faux : expliquer le message `node.message` et s'arrêter.
- `projet` vrai : une vidéo existe déjà ici. Proposer `/pulse-motion:reprendre`, ou de créer la nouvelle vidéo dans un autre dossier. S'arrêter.

## 1. Questions (une ronde)

Le sujet vient de l'argument ; sinon, le demander d'abord en une question ouverte. Puis une ronde :

1. **Durée** : 30 s · 1 min (Recommandé pour une formation courte) · 3 min · 5 min.
2. **Public** : grand public · professionnels du métier · élèves ou stagiaires (adapter selon le sujet).
3. **Parcours** : Rapide (Recommandé) – « je valide seulement le déroulé » · Accompagné – « je valide aussi le style et la vidéo finale ».
4. **À ajouter** (choix multiple) : mon logo et mes couleurs · une musique (fichier) · rien pour l'instant.

Le genre se déduit du sujet (formation, produit, storytelling, social). Format : 16:9, sauf genre `social` → 9:16.
Puis `pulse-motion etat . --parcours rapide|accompagne`.

Logo, couleurs ou musique demandés : demander les fichiers (chemin ou glisser-déposer) et les **copier** dans `assets/`. Couleurs en mots (« bleu marine ») : les traduire en `#rrggbb` et le dire. Une police citée sans fichier (« ma police, c'est Montserrat ») : utiliser la plus proche des polices fournies (Figtree pour les titres, Inter pour le texte) et le dire ; si la personne fournit le fichier, le copier dans `assets/` et l'indiquer dans `charte.polices`.

## 2. Déroulé et style

1. `pulse-motion styles --genre <genre>` : les styles classés pour ce genre, avec leur personnalité et leurs scènes toutes faites. Les **3 premiers** sont ceux à proposer ; le premier est le style recommandé.
2. Lire `pulse-motion reference rythme`.
3. Écrire `deroule.json` (schéma ci-dessous) dans le style recommandé : une idée par scène, structure du genre, durées ≥ 1,5 s + 0,3 s par mot, total proche de la durée demandée. Pour chaque scène, choisir une scène toute faite et l'écrire dans `type` (`titre`, `liste`, `chiffre`, `comparaison`, `etape`, `alerte`, `schema` ou `conclusion`) ; pas de `type` pour une scène à composer librement.
4. S'il y a au moins 2 styles : `pulse-motion comparer . <style1>,<style2>,<style3> --ouvrir` **en arrière-plan** (avec les 3 premiers styles) : la comparaison des styles, faite sur les deux premières scènes de la personne, s'ouvre dans son navigateur. Regarder soi-même les images de `sortie/comparaison/` (avec `Read`) ; un avertissement (texte trop long pour un style) se dit en une phrase.
5. Présenter le déroulé en tableau : n°, scène, texte à l'écran, durée ; durée totale en dessous. Puis demander :
   - **Parcours rapide** : une seule question : « Je valide, avec le style <1> (Recommandé) » · « Je valide, avec le style <2> » · « Je valide, avec le style <3> » · « Je veux changer quelque chose ». Décrire chaque style par sa personnalité (trois mots), jamais par son nom technique seul.
   - **Parcours accompagné** : d'abord l'accord sur le déroulé (« Je valide » (Recommandé) · « Je veux changer quelque chose »), puis une question à part sur le style, avec les mêmes styles.
   - Un seul style disponible : pas de comparaison ; le dire et ne demander que l'accord sur le déroulé.
6. Changements : corriger, représenter. Accord : `pulse-motion etat . --accord deroule`. Style choisi : s'il diffère du style recommandé, changer `style` dans `deroule.json` (les scènes ne sont pas encore écrites) ; puis `pulse-motion etat . --accord style`.

```json
{
  "version": 1, "titre": "…", "genre": "formation", "parcours": "rapide",
  "format": { "ratio": "16:9", "ips": 30 }, "style": "clair-pedagogique",
  "charte": { "couleurs": { "primaire": "#…", "accent": "#…" }, "logo": "assets/logo.svg" },
  "musique": { "fichier": "assets/musique.mp3", "volume": 0.6 },
  "scenes": [
    { "id": "intro", "type": "titre", "fichier": "scenes/01-intro.html", "duree": 7, "intention": "poser la question", "textes": { "etiquette": "…", "titre": "…", "sous": "…" }, "transition": "fondu" }
  ]
}
```

`charte` et `musique` sont facultatifs. Clés de `textes` : celles de la scène toute faite (`pulse-motion reference styles/<style>`).

## 3. Fabrication

1. Lancer **un agent `animateur` par scène, tous dans le même message** (en parallèle). À chacun : dossier, scène (id, fichier, durée, rythme, intention, textes), style, format, scène toute faite conseillée (son `type`).
2. Un agent qui a **composé** la scène au lieu de partir de la scène toute faite le dit : retirer alors `type` de cette scène dans `deroule.json`.
3. `pulse-motion assembler .` puis `pulse-motion controler .`.
4. Erreurs ou alertes : les corriger (dans la scène, ou dans le déroulé pour une durée), relancer assembler et controler. Deux tours au plus ; ce qui reste est dit à la personne.

## 4. Aperçu

1. `pulse-motion apercu . --ouvrir` **en arrière-plan** : le navigateur s'ouvre sur la vidéo.
2. Attendre quelques secondes, puis `pulse-motion controler .` : la page a signalé les textes qui débordent. Corriger s'il y en a (l'aperçu se recharge seul).
3. Parcours accompagné (le style est déjà choisi, à l'étape 2) :
   - **Vidéo finale** : faire regarder la vidéo entière dans l'aperçu et demander l'accord (`--accord video`).
   - Un refus : demander ce qui ne va pas et passer par `/pulse-motion:retoucher`.
4. Pour montrer deux scènes en images fixes (à la demande de la personne) : `pulse-motion planche . <id1>,<id2> --ouvrir`, puis regarder soi-même les images de `sortie/planche/` (avec `Read`).

## 5. Fin

Terminer par ce bloc, sans rien après :

✅ **Fait** : la vidéo « <titre> » (<n> scènes, <durée>) est prête et s'affiche dans votre navigateur.
📄 **Fichiers** : la vidéo animée est dans `sortie/<titre>.html` (elle s'ouvre sans connexion).
➡️ **Ensuite** : décrivez une retouche en une phrase avec `/pulse-motion:retoucher` (par exemple « ralentis la scène 3 »), ou exportez la vidéo en MP4 avec `/pulse-motion:exporter`.
