# Brief – Pulse Motion

> Produit par `/pulse:brainstorm` le 2026-10-11. Ce document raconte l'idée **avec des mots simples, accessibles à tous**.

## En une phrase

Pulse Motion vous permet de créer, sur votre ordinateur et sans cloud, des vidéos dynamiques bluffantes en haute fidélité, en quelques minutes et sans friction.

## Le problème aujourd'hui

- Comment ça se passe aujourd'hui : trois façons de faire, chacune avec son défaut.
  - **Canva** : rapide, mais les vidéos se ressemblent toutes et on ne maîtrise pas le rythme.
  - **Un monteur freelance** : cher, lent, et chaque retouche coûte un aller-retour.
  - **After Effects** : trop difficile ; on abandonne après quelques soirées de tutoriels.
- Ce qui coince (temps perdu, erreurs, oublis, coûts) : on publie peu, on ne retouche pas soi-même, et une série de vidéos cohérentes est hors de portée.
- Ce que ça coûte (estimation, même grossière) : non chiffré. Par exemple, un monteur facture chaque minute de vidéo et chaque aller-retour (montant à préciser).

## Les acteurs

| Acteur | Qui est-ce ? | Ce qu'il veut |
|---|---|---|
| Créateur solo | Indépendant qui publie sur les réseaux sociaux | Des vidéos courtes, originales, publiées chaque semaine |
| Formateur | Formateur indépendant, sans notion de code | Des vidéos de formation de 1 à 5 minutes, qu'il retouche lui-même |
| Petite agence | Agence de communication qui produit pour ses clients | Une même vidéo déclinée en série, aux couleurs de chaque client |
| Pulse Motion | Le plugin, dans Claude Code | Guider la personne et fabriquer la vidéo sur son ordinateur |

## L'histoire (domain storytelling)

Il était une fois **Pulse Motion**, un plugin Claude Code qui transforme une idée décrite en mots simples en vidéo animée, fabriquée entièrement sur l'ordinateur de la personne.

- **Claire**, formatrice en hygiène alimentaire, **décrit** sa vidéo : « Expliquer la chaîne du froid en 3 minutes ».
  - Pulse Motion lui pose une petite ronde de questions : le genre, la durée, le format, le public, et le parcours (rapide par défaut, ou accompagné).
- Pulse Motion **propose** 3 styles → Claire en choisit un et **applique** sa charte (logo, couleurs, police).
- Pulse Motion **écrit** le déroulé (les scènes, leurs textes, leur durée) → Claire le valide avant toute animation.
  - Parcours rapide : c'est le seul accord demandé. Parcours accompagné : Claire valide aussi le style, puis la vidéo finale.
- Pulse Motion **fabrique** l'animation → Claire la **regarde** aussitôt dans son navigateur.
  - En coulisse, des contrôles automatiques corrigent un titre qui déborde ou un temps mort.
  - Musique générée sur l'ordinateur ou importée ; Claire peut ajouter sa voix, et les sous-titres se calent dessus.
- Claire **demande une retouche** en une phrase (« ralentis la scène 3 ») → elle la voit dans la seconde.
- Claire **exporte** sa vidéo en MP4 pour sa plateforme de formation, et garde la page HTML animée pour son site.
- **Karim**, coach sportif, **se filme** dans son salon → Pulse Motion **détoure** Karim et l'intègre dans l'animation, puis **décline** la vidéo en format vertical pour Instagram.
- L'agence **Atelier Nord** **transforme** une vidéo réussie en modèle, **remplit** un tableau de 12 clients → elle **obtient** une série de 12 variantes, chacune à leurs couleurs, avec leurs textes et leurs images.

## Le vocabulaire du projet

Les mots du métier et leur définition commune sont dans le glossaire : `aidd_docs/memory/glossary.md`.

## Décisions prises

**Décidé par vous**

- ✔ Un plugin Claude Code dédié à la création de vidéos en motion design – pour créer des vidéos sans logiciel à apprendre.
- ✔ Simple, rapide, sans frustration, avec un guidage au niveau de Pulse – le public n'a pas de notion de code.
- ✔ Aucune dépendance à un service cloud externe – tout se fabrique sur l'ordinateur de la personne.
- ✔ Un moteur JavaScript directement utilisable dans une page HTML, avec du CSS et du SVG animés (effets SVG autorisés).
- ✔ Trois publics : créateur solo, formateur sans notion de code, petite agence.
- ✔ Des vidéos longues (jusqu'à 5 minutes), de genres variés (présentation de produit, storytelling, formation) et de styles variés.
- ✔ Le détourage d'une personne filmée, par une IA qui tourne sur l'ordinateur.

**Proposé par Pulse, accepté**

- ✔ Distinguer **genre** (ce que la vidéo fait) et **style** (à quoi elle ressemble) – on peut ainsi combiner n'importe quel genre avec n'importe quel style.
- ✔ La personne choisit son **parcours** au départ : **rapide** (un accord, sur le déroulé), par défaut, ou **accompagné** (trois accords : déroulé, style, vidéo finale) – garder la vitesse sans sacrifier le contrôle.
- ✔ Les styles viennent d'un **catalogue**, personnalisé par la **charte** de la personne – pour éviter l'effet « toutes les vidéos se ressemblent ».
- ✔ La narration repose sur le texte à l'écran et la musique ; la voix de la personne est en option, et l'animation se cale dessus – la seule voix de synthèse française gratuite et locale est de qualité moyenne.
- ✔ Musique générée sur l'ordinateur, ou importée par la personne.
- ✔ Sous-titres automatiques (transcription sur l'ordinateur) ou à partir d'un texte fourni.
- ✔ Images de la personne (photos, captures, logos), plus une bibliothèque d'icônes libres fournie.
- ✔ Le détourage en trois niveaux : une IA légère dans le navigateur par défaut, une IA haute qualité plus lente en option, et le fond vert, toujours possible.
- ✔ Un modèle fait varier les textes et chiffres, la charte, les images et les vidéos ; les données d'une série viennent d'un tableur ou de la conversation.
- ✔ Deux livrables issus du même travail : un fichier MP4 et une page HTML animée autonome.
- ✔ L'export en deux niveaux : rapide dans le navigateur sans rien installer, et fidèle avec un outil local installé une seule fois, pas à pas.
- ✔ Diffusion gratuite, code ouvert sous licence MIT – permet de reprendre du code de projets libres compatibles, et impose d'écarter tout composant à licence contaminante ou non commerciale.
- ✔ Un plugin autonome, dans le catalogue pulseia – il reprend le guidage de Pulse sans exiger Pulse.

## Hypothèses à vérifier

- [ ] Des formateurs habitués à Canva acceptent de travailler dans Claude Code (abonnement Claude, installation) – faire réaliser une première vidéo à 3 formateurs et observer où ils bloquent.
- [ ] Une vidéo courte est prête en quelques minutes, du premier message à l'aperçu – chronométrer 5 vidéos de 15 à 30 secondes.
- [ ] Le motion design dessiné tient l'attention sur 5 minutes avec du texte et de la musique – montrer une vidéo de formation de 5 minutes à quelques personnes et noter quand elles décrochent.
- [ ] Le détourage dans le navigateur donne un résultat acceptable sur un tournage fait au bureau, sans fond vert – tester 3 vidéos filmées au téléphone.
- [ ] La page HTML animée reste légère quand la vidéo contient une vidéo filmée ou une voix – mesurer le poids sur un exemple.
- [ ] Le catalogue de styles et la charte suffisent à rendre chaque vidéo singulière – comparer 5 vidéos produites par des personnes différentes.

## Questions ouvertes

- [ ] Quel public est servi en premier dans la première version (créateur, formateur ou agence) ? À trancher dans `/pulse:prd`.
- [ ] Le détourage entre-t-il dans la première version, ou plus tard ? À trancher dans `/pulse:prd`.
- [ ] Faut-il, plus tard, décliner une vidéo en plusieurs langues (les textes plus longs décalent le rythme) ?
- [ ] Combien de styles dans le catalogue de départ, et lesquels ?
- [ ] Comment partager un projet avec un client pour qu'il donne son avis (l'agence) ?

## Ce que serait une réussite

- Dans un mois, si l'outil marche, on constate que :
  - un créateur publie une vidéo par semaine au lieu d'une par trimestre ;
  - une association ou une agence sort une série de 12 vidéos cohérentes, à la même charte, en une après-midi, sans payer personne ;
  - un formateur retouche lui-même sa vidéo la veille de sa session, en deux minutes ;
  - des vidéos longues (jusqu'à 5 minutes) sortent dans des genres et des styles variés : présentation de produit, storytelling, formation.
