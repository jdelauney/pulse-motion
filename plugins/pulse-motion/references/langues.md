# Langue de la vidéo et déclinaisons

Une vidéo peut être dans une autre langue que le français, et une vidéo réussie peut se décliner dans un autre format ou une autre langue sans la refaire. **Pulse Motion, lui, reste en français** : les questions, les messages, l'aperçu et les échanges avec la personne ne changent pas. Seule la vidéo change de langue. On dit toujours la langue en mots (« en anglais »), jamais son code.

## 1. La langue de la vidéo

Champ `langue` du déroulé, facultatif ; absent, la vidéo est en français, exactement comme avant.

| Langue | Valeur | Régions possibles |
|---|---|---|
| français | `fr` | `fr-CA`, `fr-BE`, `fr-CH` |
| anglais | `en` (anglais britannique) | `en-US`, `en-GB` |
| espagnol | `es` | `es-MX` |
| allemand | `de` | `de-AT`, `de-CH` |
| italien | `it` | |
| portugais | `pt` (portugais du Portugal) | `pt-BR`, `pt-PT` |
| néerlandais | `nl` | `nl-BE` |

Une seule langue par vidéo : une version bilingue est une déclinaison (§ 4), jamais des sous-titres doublés. Les autres langues (polonais, tchèque, turc, cyrillique, grec, arabe, chinois…) ne sont pas encore prises en charge : les polices des styles n'ont que l'alphabet latin courant. Le dire simplement, sans promettre de date.

Ce que la langue change, sans rien à faire de plus :
- la page (`lang`, coupe des mots, lecteurs d'écran) et la barre de lecture de la page livrée ;
- les nombres animés (« 1,250.5 » en anglais, « 1.250,5 » en allemand) et ceux des graphiques ;
- les sous-titres (jamais de coupe après « the » ou « der ») et leur fichier VTT (`Language:`) ;
- le calage des mots sur la voix (nombres en lettres de la langue, « Straße » = « strasse ») et les lèvres des personnages ;
- la typographie contrôlée (§ 2), la piste son de la vidéo exportée (étiquetée dans la langue).

## 2. Écrire les textes

- **Création** : la langue se déduit de la demande (« une vidéo en anglais pour nos clients ») ; aucune question en plus. Les textes du déroulé (`textes`, `voix.texte`, `titre`, `chapitre`, graphiques) s'écrivent dans la langue de la vidéo ; on parle toujours français avec la personne. Le tableau du déroulé porte une ligne « Langue de la vidéo : anglais » quand ce n'est pas le français.
- **Traduction** : Claude traduit lui-même, dans la conversation ; aucun service de traduction en ligne. Un terme du métier ou une marque ne se traduit pas sans accord.
- **Scènes** : aucun texte écrit dans le fichier d'une scène ; tout passe par `data-texte`.
- **Typographie** (règle `typographie`, corrigée seule dans le déroulé) : celle de la langue. Anglais et néerlandais : guillemets “ ”, pas d'espace avant `? ! : ;`. Allemand : „ “. Espagnol, italien, portugais : « » sans espace intérieure (portugais du Brésil : “ ”). Majuscules accentuées : français seulement. Espagnol : une question ou une exclamation sans « ¿ » ou « ¡ » ouvrant est signalée (`ponctuation-ouvrante`), jamais corrigée seule.
- **Glossaire** : `charte/glossaire.md` peut porter une ligne `Langue : anglais` ; sans elle, il est français. Il ne s'applique (formes à éviter, prononciations, termes clés) qu'à une vidéo de la même langue.
- **Polices** : un caractère absent de la police de son rôle est signalé (`glyphe-absent`), avec la police et les caractères ; proposer une police de charte qui les contient. `pulse-motion police` vérifie aussi les lettres de la langue de la vidéo.

## 3. La voix

- **Enregistrer** : avant un enregistrement, dire dans quelle langue parler (« lisez le texte en anglais »).
- **Voix provisoire** (`pulse-motion voix provisoire .`) : une voix de l'ordinateur dans la langue de la vidéo, **jamais une voix française** à sa place. Sans voix de la langue, la commande le dit (Windows : Paramètres → Heure et langue → Voix → Ajouter des voix ; macOS : Réglages Système → Accessibilité → Contenu énoncé). `pulse-motion outils --langue <valeur>` dit si une voix de la langue existe.
- **Transcription** : elle écoute dans la langue de la vidéo ; rien à faire.
- **Voix de synthèse** : elle ne parle que français (une seule voix, `ff_siwis`). Pour une autre langue : la voix de la personne, ou une voix provisoire de la langue. Aucune autre voix ni aucun autre modèle ne se télécharge.

## 4. Changer de langue ou décliner

- **« Passe la vidéo en anglais »**, vidéo **sans voix enregistrée** par la personne : sur place. Sauvegarder (`pulse-motion historique sauvegarder . --phrase "<la demande>"`), écrire `"langue"`, traduire les textes du déroulé (retirer `voix.synthese` et les voix provisoires, à refaire dans la langue), puis contrôler et regarder comme une retouche.
- **Avec une voix enregistrée**, ou quand la personne garde l'original (« la même en anglais », « traduis-la en gardant l'originale ») : une **déclinaison**.
- **« Fais-en une version verticale pour TikTok »**, « une version carrée pour LinkedIn » : une déclinaison de format. « Passe-la en vertical » sans garder l'original : la ligne « Format » de `retoucher`.

## 5. Les déclinaisons

`pulse-motion decliner . --format 9:16 [--plateforme tiktok|shorts|reels|toutes] [--langue <valeur>] [--pour <usage>]` crée `declinaisons/<nom>/` (« 9x16 », « en », « en-9x16 ») : une vidéo complète, avec son historique ; l'original ne change jamais. Un nom déjà pris est refusé ; une déclinaison ne se décline pas (décliner l'originale).

Résultat : `recopiees` (scènes toutes faites reprises du style), `aReecrire` et `motifs` (pourquoi chaque scène est à réécrire), `aTraduire` (`{ scene, champ, texte }`), `voixRetirees`, `usage` (l'usage d'export, « reseaux » pour une version verticale ou carrée : l'export le prend seul).

Déroulement, dans le dossier de la déclinaison (le passer aux commandes à la place de `.`) :
1. Les scènes de `aReecrire` : un agent `animateur` chacune, en parallèle, avec son motif et la scène d'origine en référence (`../../scenes/<fichier>`) : même intention, **autre mise en page**, jamais un recadrage. En 9:16, la plateforme pose ses zones sûres (`pulse-motion reference sorties`).
2. `aTraduire` : traduire chaque texte dans le `deroule.json` de la déclinaison (le titre compris).
3. `pulse-motion controler <déclinaison>`, la planche de regard, puis l'aperçu de la déclinaison.
4. Fin : dire où est la nouvelle vidéo et ce qui reste (« la voix est à réenregistrer en anglais, ou je mets une voix provisoire anglaise »).

Ensuite, une retouche vise la déclinaison quand la personne le dit (« dans la version verticale »). Une retouche de l'original ne se reporte jamais seule : à la fin d'une retouche, si l'état liste des `declinaisons`, demander « La version verticale n'a pas changé. Faut-il la mettre à jour aussi ? » ; si oui, refaire la même retouche dans la déclinaison.

`pulse-motion etat .` liste les déclinaisons (format, langue, dernier export) ; dans une déclinaison, il donne son `origine`.
