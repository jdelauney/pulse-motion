# Réglages rapides de l'aperçu

## L'essentiel

- Le bouton « Réglages » de l'aperçu ouvre **cinq réglages au plus**, que la personne change sans passer par Claude : couleur d'accent, allure, ton, musique, sous-titres.
- **Des choix, pas des curseurs** : trois à cinq valeurs par réglage, toutes jolies. Un curseur continu fait chercher et donne des valeurs moches.
- La **valeur marquée est toujours celle de la vidéo** : ouvrir le panneau ne change rien.
- Chaque choix est **écrit dans `deroule.json`**, avec une sauvegarde d'historique avant (phrase « réglage rapide : … ») : « annule » le défait comme une retouche, l'export le prend, la vidéo rouverte demain l'a toujours. Rien n'est gardé seulement dans le navigateur.
- Le panneau n'existe que **dans l'aperçu** : ni dans la page livrée, ni dans l'export.
- Le contrôle n'est pas relancé à chaque clic : `pulse-motion etat .` dit `reglagesNonControles: true` (et `reglagesChanges` : lesquels) jusqu'au prochain contrôle, que `/pulse-motion:retoucher` et `/pulse-motion:exporter` lancent comme d'habitude, en disant en une phrase ce que la personne a changé.

## Les cinq réglages

| Réglage | Valeurs | Écrit dans le déroulé | Garde-fou |
|---|---|---|---|
| Couleur d'accent | L'accent actuel, puis les couleurs de la charte et du style (accent, couleur principale, seconde couleur), 5 au plus | `charte.couleurs.accent` (réglage propre à cette vidéo) | Jamais une couleur hors de la charte et du style ; grisé s'il n'y en a qu'une |
| Allure | Plus posé (0,8) · Normal (1) · Plus vif (1,2) | `rythme` de toutes les scènes (1 : retiré) | Une scène avec une voix ne devient jamais plus courte que sa prise (le minutage l'allonge) ; grisé si la vidéo suit le tempo d'une musique sur une grille fixe (la musique se décalerait) |
| Ton | Clair · Sombre · Automatique, seulement ceux que le style déclare | `charte.ton` | Grisé si le style n'a qu'un ton (contrôle `ton-indisponible`) |
| Musique | Plus basse (0,35) · Normale (0,5) · Plus forte (0,7) · Sans ; « Comme maintenant » si le volume actuel est un autre | `musique.volume`, ou `musique` retiré (gardé de côté : le choix suivant le remet) | Grisé sans musique |
| Sous-titres | Oui · Non · Mot par mot | `sousTitres.mode` `ligne` ou `mot` ; `sousTitres` retiré (gardé de côté) | Grisé sans voix |

Ce qui n'est **pas** un réglage rapide : la densité d'une scène, la mise en page, un mouvement, un texte. Ils demandent de réécrire une scène : ils passent par `/pulse-motion:retoucher`.

## Comportement

- Un clic sur une valeur : sauvegarde d'historique, écriture du déroulé (atomique, validé avant), puis l'aperçu se réassemble et se recharge **à la même position**, panneau rouvert.
- Le panneau dit en une ligne ce qui a changé (« Allure : plus vif ») et rappelle que « annule » le défait.
- Les libellés sont en français courant, sans unité technique (« Plus posé », pas « rythme 0,8 »).
- Une clé ou une valeur hors de la liste est refusée par l'aperçu ; un envoi venu d'une autre page aussi (garde des serveurs locaux).

## Les mêmes réglages en une phrase

Sans le panneau, ou si la personne préfère le dire, `/pulse-motion:retoucher` comprend les mêmes demandes : « accent en bleu », « un peu plus vif partout », « passe en sombre », « baisse la musique », « sous-titres mot par mot ». Les valeurs sont celles du tableau ; une valeur entre deux (« un tout petit peu plus vif ») est une retouche ordinaire.

## À venir

- L'allure de toute la vidéo dans son propre champ, au lieu du rythme de chaque scène (spec S7, C17) : le réglage s'y écrira.
