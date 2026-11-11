'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RACINE = path.join(__dirname, '..');
const lire = (...p) => fs.readFileSync(path.join(RACINE, ...p), 'utf8');
// Références découpées en tronc et parties (spec Rapidité § 5.4) : lues ensemble pour vérifier qu'une règle existe.
const { lireReference, partiesDe } = require('./aide/references.js');

function enTete(texte) {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(texte.replace(/\r\n/g, '\n'));
  assert.ok(m, 'en-tête --- absent');
  const champs = {};
  for (const ligne of m[1].split('\n')) {
    const i = ligne.indexOf(':');
    if (i > 0) champs[ligne.slice(0, i).trim()] = ligne.slice(i + 1).trim();
  }
  return champs;
}

const SKILLS = fs.readdirSync(path.join(RACINE, 'skills'));
const COMMANDES = ['etat', 'assembler', 'controler', 'apercu', 'historique', 'reference', 'scene', 'styles', 'consignes', 'exporter', 'planche', 'effet', 'comparer', 'changer-style', 'lexique', 'charte', 'police', 'glossaire', 'style', 'ffmpeg', 'voix', 'whisper', 'musique', 'outils', 'atelier', 'personnages', 'mouvements', 'modeles', 'credits', 'avancement', 'ebauche', 'decisions', 'remarques', 'filmer'];
const fichiersGuides = () => [
  ...SKILLS.map((s) => path.join('skills', s, 'SKILL.md')),
  ...fs.readdirSync(path.join(RACINE, 'agents')).map((a) => path.join('agents', a)),
];

test('skills : creer, exporter, retoucher, reprendre, lancés par la personne, outils limités', () => {
  assert.deepEqual(SKILLS.sort(), ['animer-personnage', 'atelier-particules', 'atelier-personnages', 'creer', 'decouper-personnage', 'dessiner-personnage', 'exporter', 'filmer', 'outils', 'reprendre', 'retoucher', 'style', 'voix']);
  for (const s of SKILLS) {
    const e = enTete(lire('skills', s, 'SKILL.md'));
    assert.ok(e.description && e.description.length > 20, `${s} : description`);
    assert.match(e['allowed-tools'], /Bash\(pulse-motion \*\)/, `${s} : outil pulse-motion autorisé`);
  }
});

test('agent animateur : nom, description, outils', () => {
  const e = enTete(lire('agents', 'animateur.md'));
  assert.equal(e.name, 'animateur');
  assert.match(e.description, /une seule scène/);
  assert.match(e.tools, /Write/);
});

test('les commandes pulse-motion citées existent, avec les références et scènes citées', () => {
  for (const f of fichiersGuides()) {
    const texte = lire(f);
    for (const m of texte.matchAll(/pulse-motion ([a-z]+(?:-[a-z]+)*)/g)) {
      if (m[1] === 'reference' || COMMANDES.includes(m[1])) continue;
      assert.fail(`${f} : commande inconnue « pulse-motion ${m[1]} »`);
    }
    for (const m of texte.matchAll(/pulse-motion reference ([a-z0-9/<>-]+)/g)) {
      if (m[1].includes('<')) continue;
      // Le dictionnaire de mouvements est rendu depuis sa source JSON.
      if (m[1] === 'mouvements') { assert.ok(fs.existsSync(path.join(RACINE, 'references', 'mouvements', 'mouvements.json')), `${f} : dictionnaire absent`); continue; }
      // Les usages d'export aussi (scripts/usages.json, spec Rendu et export 5.4).
      if (m[1] === 'usages') { assert.ok(fs.existsSync(path.join(RACINE, 'scripts', 'usages.json')), `${f} : usages.json absent`); continue; }
      assert.ok(fs.existsSync(path.join(RACINE, 'references', `${m[1]}.md`)), `${f} : référence « ${m[1]} » absente`);
    }
    for (const m of texte.matchAll(/pulse-motion consignes ([a-z0-9-]+)/g)) {
      assert.ok(SKILLS.includes(m[1]), `${f} : consignes « ${m[1]} » absentes`);
    }
  }
});

test('guidage : Node absent, police non fournie, décor de la dernière scène', () => {
  for (const s of SKILLS) {
    assert.match(lire('skills', s, 'SKILL.md'), /Node\.js.*introuvable|introuvable.*Node\.js/, `${s} : cas « Node absent »`);
  }
  assert.match(lire('skills', 'creer', 'SKILL.md'), /police.*sans fichier.*(Figtree|Inter)/i);
  for (const f of [path.join('agents', 'animateur.md'), path.join('references', 'styles', 'clair-pedagogique.md')]) {
    assert.match(lire(f), /dernière scène.*0,5 s/, `${f} : pause finale de la dernière scène`);
  }
});

test('export : proposé à la fin de creer et de retoucher, planche dans le parcours accompagné', () => {
  for (const s of ['creer', 'retoucher']) assert.match(lire('skills', s, 'SKILL.md'), /\/pulse-motion:exporter/, s);
  assert.match(lire('skills', 'creer', 'SKILL.md'), /pulse-motion comparer \. <style1>,<style2>,<style3> --ouvrir/);
  assert.match(lire('skills', 'creer', 'SKILL.md'), /pulse-motion styles --genre <genre>/);
  assert.match(lire('skills', 'retoucher', 'SKILL.md'), /pulse-motion changer-style \. <style>/);
  for (const s of ['creer', 'retoucher', 'reprendre', 'exporter']) assert.match(lire('skills', s, 'SKILL.md'), /pulse-motion lexique/, s);
  assert.match(lire('skills', 'exporter', 'SKILL.md'), /`pulse-motion exporter \.` en arrière-plan/);
});

test('références : bloc « L\'essentiel » en tête, chaque style du catalogue documenté', () => {
  const styles = fs.readdirSync(path.join(RACINE, 'styles'));
  for (const f of ['moteur.md', 'rythme.md', 'audio.md', ...styles.map((st) => path.join('styles', `${st}.md`))]) {
    // Une fiche de style a son essence et ses sources en citation entre le titre et « L'essentiel ».
    assert.match(lire('references', f), /^# .+\n\n(?:> .+\n)*\n?## L'essentiel\n/, f);
  }
  for (const st of styles) {
    const catalogue = JSON.parse(lire('styles', st, 'catalogue.json'));
    const doc = lire('references', 'styles', `${st}.md`);
    for (const sc of catalogue.scenes) {
      assert.match(doc, new RegExp(`\\| \`${sc.nom}\` \\|.*\\| ${sc.duree} s \\|`), `${st} : scène ${sc.nom} documentée avec sa durée`);
    }
  }
});

test('consignes : les effets de particules sont guidés', () => {
  const animateur = lire('agents', 'animateur.md');
  assert.match(animateur, /pulse-motion reference particules/);
  assert.match(animateur, /effets\/<nom>\.json/);
  assert.match(animateur, /etend/);
  const retoucher = lire('skills', 'retoucher', 'SKILL.md');
  assert.match(retoucher, /\| Effet de particules \|/);
  assert.match(retoucher, /data-graine/);
  const creer = lire('skills', 'creer', 'SKILL.md');
  assert.match(creer, /effet de particules/);
  assert.match(creer, /au plus deux effets simultanés/);
  assert.match(animateur, /seulement si votre consigne le demande/);
  assert.match(animateur, /effet-sur-texte/);
});

test('consignes : les personnages sont guidés, un skill par action', () => {
  const skill = (n) => lire('skills', n, 'SKILL.md');
  const retoucher = skill('retoucher');
  assert.match(retoucher, /\| Personnages \|/);
  for (const n of ['dessiner-personnage', 'animer-personnage', 'atelier-personnages', 'atelier-particules']) assert.match(retoucher, new RegExp(n), `retoucher renvoie vers ${n}`);
  const dessiner = skill('dessiner-personnage');
  assert.match(dessiner, /pulse-motion reference dessin-personnages/);
  assert.match(dessiner, /--dessin <nom> --visage/);
  assert.match(dessiner, /Cohérence entre les vues|cohérence entre les vues/);
  assert.match(dessiner, /dans chaque vue/);
  const animer = skill('animer-personnage');
  assert.match(animer, /pulse-motion reference personnages/);
  assert.match(animer, /pulse-motion personnages planche/);
  const atelier = skill('atelier-personnages');
  assert.match(atelier, /pulse-motion personnages atelier <nom> --dessin <dessin>/);
  assert.match(enTete(atelier).description, /éditeur de personnage/);
  assert.match(enTete(skill('atelier-particules')).description, /éditeur de particules/);
  assert.match(skill('atelier-particules'), /pulse-motion atelier <effet>/);
  assert.match(lire('references', 'personnages.md'), /^# .+\n\n## L'essentiel\n/);
  assert.match(lire('references', 'dessin-personnages.md'), /^# .+\n\n## L'essentiel\n/);
  assert.match(lire('references', 'dessin-personnages.md'), /dans chaque vue/);
  const decouper = skill('decouper-personnage');
  assert.match(decouper, /pulse-motion reference decoupe-personnages/);
  assert.match(decouper, /pulse-motion personnages analyser assets\/<fichier>\.svg/);
  assert.match(decouper, /pulse-motion personnages decouper <nom>/);
  assert.match(decouper, /pulse-motion personnages renommer-couleur/);
  assert.match(atelier, /pulse-motion personnages atelier --decoupe <nom>/);
  assert.match(retoucher, /decouper-personnage/);
  assert.match(lire('references', 'decoupe-personnages.md'), /^# .+\n\n## L'essentiel\n/);
});

test('creer : style choisi alors que des scènes existent déjà → changement de style', () => {
  assert.match(lire('skills', 'creer', 'SKILL.md'), /scènes existent déjà[^\n]*pulse-motion changer-style \. <style>/);
});

test('charte : logo, chartes enregistrées, polices et glossaire dans le parcours', () => {
  const creer = lire('skills', 'creer', 'SKILL.md');
  assert.match(creer, /pulse-motion charte depuis-logo charte\/logo\.<ext> --style <style>/);
  assert.match(creer, /pulse-motion charte liste/);
  assert.match(creer, /pulse-motion charte appliquer <nom> \./);
  assert.match(creer, /pulse-motion charte enregistrer <nom> \./);
  assert.match(creer, /pulse-motion police "<famille>"/);
  assert.match(creer, /pulse-motion glossaire noter \./);
  assert.match(lire('skills', 'reprendre', 'SKILL.md'), /charte\.aJour/);
  assert.match(lire('skills', 'retoucher', 'SKILL.md'), /pulse-motion charte depuis-logo/);
  assert.match(lire('agents', 'animateur.md'), /pulse-motion glossaire \./);
});

test('style personnel : création guidée, scènes témoins, vérification avant usage', () => {
  const s = lire('skills', 'style', 'SKILL.md');
  assert.match(s, /pulse-motion style nouveau <nom> --depuis <style>/);
  assert.match(s, /pulse-motion style planche <nom> --scenes titre,liste --ouvrir/);
  assert.match(s, /pulse-motion style verifier <nom>/);
  assert.match(s, /pulse-motion police "<famille>" --dans/);
  assert.match(s, /feTurbulence|texture/);
  assert.match(lire('agents', 'animateur.md'), /## Mode « style »/);
});

test('retoucher : une scène ajoutée garde son « type » si elle vient d\'une scène toute faite, le perd si elle est composée', () => {
  const ligne = lire('skills', 'retoucher', 'SKILL.md').split('\n').find((l) => l.startsWith('| Structure |'));
  assert.match(ligne, /« type »/);
  assert.match(ligne, /scène toute faite/);
  assert.match(ligne, /composée/);
});

test('creer et retoucher : le contrôle corrige seul les cas sûrs, et les corrections sont dites', () => {
  for (const s of ['creer', 'retoucher']) {
    const texte = lire('skills', s, 'SKILL.md');
    assert.match(texte, /corrections/, s);
    assert.match(texte, /sortie\/controle\.json/, s);
  }
});

test('creer et retoucher : le contrôle vérifie lui-même la vidéo rendue ; rendu non vérifié dit à la personne', () => {
  for (const s of ['creer', 'retoucher']) {
    const texte = lire('skills', s, 'SKILL.md');
    assert.match(texte, /renduVerifie/, s);
    assert.doesNotMatch(texte, /Attendre quelques secondes, puis `pulse-motion controler \.`|Quelques secondes après, `pulse-motion controler \.`/, s);
  }
});

test('revue : la référence du moteur explique les marqueurs lus par le contrôle de la vidéo rendue', () => {
  const moteur = lireReference('moteur', { parties: true });
  for (const motif of [/data-decor/, /data-superpose/, /alt=""/, /aria-hidden="true"/]) assert.match(moteur, motif);
  assert.match(lire('skills', 'creer', 'SKILL.md'), /rendu-non-verifie.*rendu-impossible/);
});

test('référence du moteur : contraste réel et flashs expliqués', () => {
  const moteur = lireReference('moteur', { parties: true });
  assert.match(moteur, /contraste réel/);
  assert.match(moteur, /3 flashs par seconde/);
});

test('référence des contrôles : les skills y renvoient (chaque règle du code y est : documentation.test.js)', () => {
  const ref = lire('references', 'controles.md');
  assert.match(ref, /corrigé seul/);
  for (const s of ['creer', 'retoucher']) assert.match(lire('skills', s, 'SKILL.md'), /pulse-motion reference controles/, s);
});

test('skill exporter : ffmpeg vérifié, installation proposée avec accord (commande sûre seulement), repli dans le navigateur', () => {
  const s = lire('skills', 'exporter', 'SKILL.md');
  assert.match(s, /pulse-motion ffmpeg/);
  assert.match(s, /AskUserQuestion|accord/);
  assert.match(s, /`commande`/);
  assert.match(s, /--rapide/);
  assert.match(s, /--qualite 720p/);
  assert.match(s.split('\n').find((l) => l.startsWith('allowed-tools:')), /Bash\(winget install --id Gyan\.FFmpeg/);
});

test('revue : skill exporter, seules les commandes d\'installation exactes sont autorisées (pas de sudo)', () => {
  const ligne = lire('skills', 'exporter', 'SKILL.md').split('\n').find((l) => l.startsWith('allowed-tools:'));
  assert.match(ligne, /Bash\(winget install --id Gyan\.FFmpeg -e --accept-source-agreements --accept-package-agreements\)/);
  assert.match(ligne, /Bash\(brew install ffmpeg\)/);
  assert.doesNotMatch(ligne, /sudo|\*\)\s*Bash\(brew|install \*\)/);
});

test('référence audio : champs, ancres, sons, ambiances, partition, mixage, sous-titres, commandes', () => {
  const t = lireReference('audio', { parties: true });
  assert.match(lire('references', 'audio.md'), /^# .+\n\n## L'essentiel\n/);
  for (const mot of ['voix.texte', 'voix.provisoire', 'voix.debut', 'sousTitres', 'incrustes', 'bruitages', 'transitions', 'generee', 'graine', 'intensite', 'tonalite', 'partition', 'mot:', 'data-son', 'data-son-volume', '−16 LUFS', '3,5 mots', '.srt', '.vtt', '--avec-provisoire',
    'pulse-motion voix importer', 'pulse-motion voix provisoire', 'pulse-motion voix transcrire', 'pulse-motion voix studio', 'pulse-motion whisper installer', 'pulse-motion musique ecouter']) {
    assert.ok(t.includes(mot), `audio.md : « ${mot} » absent`);
  }
  const C = require('../moteur/synthe/catalogue.js');
  for (const a of Object.keys(C.AMBIANCES)) assert.ok(t.includes(`\`${a}\``), `ambiance ${a}`);
  for (const s of C.BRUITAGES) assert.ok(t.includes(`\`${s}\``), `son ${s}`);
  for (const i of C.INSTRUMENTS) assert.ok(t.includes(`\`${i}\``), `instrument ${i}`);
  assert.match(lireReference('moteur', { parties: true }), /pulse-motion reference audio/);
});

test('creer : la question du son, textes dits, voix provisoire, sous-titres, Whisper avec accord', () => {
  const creer = lire('skills', 'creer', 'SKILL.md');
  assert.match(creer, /\*\*Le son\*\*/);
  assert.match(creer, /3,5 mots/);
  assert.match(creer, /une idée par phrase/);
  assert.match(creer, /pulse-motion voix provisoire \./);
  assert.match(creer, /pulse-motion whisper/);
  assert.match(creer, /pulse-motion reference audio/);
  assert.match(creer, /sousTitres/);
  assert.match(creer, /mode.*mot.*9:16|9:16.*mode.*mot/);
  assert.match(creer, /generee/);
  assert.match(creer, /pulse-motion musique ecouter \./);
  assert.match(creer, /hors-tempo/);
  const e = enTete(creer);
  assert.match(e['allowed-tools'], /Bash\(winget install --id Python\.Python\.3\.12 -e --accept-source-agreements --accept-package-agreements\)/);
  assert.match(e['allowed-tools'], /Bash\(brew install python\)/);
});

test('guidage du son : animateur (mot:, data-son), retoucher (lignes du son), exporter (provisoire, srt/vtt)', () => {
  const animateur = lire('agents', 'animateur.md');
  assert.match(animateur, /mot:/);
  assert.match(animateur, /data-son/);
  assert.match(animateur, /seulement.*prise|prise.*seulement/);
  assert.match(animateur, /son-sous-voix|pendant un mot/);
  assert.match(animateur, /pulse-motion reference audio/);
  const retoucher = lire('skills', 'retoucher', 'SKILL.md');
  for (const r of [/\| Voix \|/, /\| Musique \|/, /\| Bruitages \|/, /\| Sous-titres \|/, /pulse-motion voix studio <id> \./, /graine/, /pulse-motion voix transcrire \./]) assert.match(retoucher, r);
  const exporter = lire('skills', 'exporter', 'SKILL.md');
  assert.match(exporter, /--avec-provisoire/);
  assert.match(exporter, /\.srt/);
  assert.match(exporter, /\.vtt/);
});

test('revue : consignes du son exactes (pas de voix.fichier, import relancé après Whisper, repli, place du tempo)', () => {
  const audio = lireReference('audio', { parties: true });
  assert.doesNotMatch(audio, /\| `voix\.fichier` \|/);
  assert.match(audio, /\| `musique\.tempo` \|/);
  const creer = lire('skills', 'creer', 'SKILL.md');
  assert.match(creer, /"musique": \{ "generee": "<ambiance>", "tempo": 120/);
  const whisper = creer.indexOf('`pulse-motion whisper`');
  const importer = creer.indexOf('pulse-motion voix importer assets/<fichier> .');
  assert.ok(whisper > 0 && importer > whisper, 'la transcription se vérifie avant l\'import d\'un enregistrement entier');
  assert.match(creer, /relancer `pulse-motion voix importer assets\/<fichier> \.`/);
  assert.match(creer, /relancer `pulse-motion whisper`/);
  assert.match(creer, /relancer Claude Code/);
});


test('correctifs : guidage du son précisé (sous-titres sans voix, arrêt avant export, retouches, crête, largeur des sous-titres)', () => {
  const creer = lire('skills', 'creer', 'SKILL.md');
  // R2 (5.4) : voix et sous-titres en une question ; « Pas de voix » ne laisse pas de sous-titres.
  assert.match(creer, /« Pas de voix » \(donc sans sous-titres, qui reprennent le texte dit\)/);
  const exporter = lire('skills', 'exporter', 'SKILL.md');
  assert.match(exporter, /« Enregistrer ma voix d'abord »[^\n]*s'arrêter/);
  const retoucher = lire('skills', 'retoucher', 'SKILL.md');
  assert.match(retoucher, /« enlève les sous-titres »/);
  assert.doesNotMatch(retoucher, /« plus de sous-titres »/);
  assert.match(retoucher, /\| Structure \|[^\n]*voix\.texte[^\n]*pulse-motion voix provisoire --scene <id> \./);
  for (const f of ['audio', 'moteur']) assert.match(lireReference(f, { parties: true }), /crête sous −1,5 dBFS/, f);
  assert.match(lire('references', 'audio.md'), /--pm-st-largeur/);
});

test('correctifs : sous-commandes du son citées dans les guides : elles existent', () => {
  const SOUS = { voix: ['importer', 'provisoire', 'transcrire', 'studio'], whisper: ['installer'], musique: ['ecouter'] };
  const references = ['audio', 'moteur'].flatMap((n) => [path.join('references', `${n}.md`), ...partiesDe(n).map((p) => path.relative(RACINE, p.fichier))]);
  for (const f of [...fichiersGuides(), ...references]) {
    for (const m of lire(f).matchAll(/pulse-motion (voix|whisper|musique)(?: ([a-z]+))?/g)) {
      if (m[2] === undefined) continue;
      assert.ok(SOUS[m[1]].includes(m[2]), `${f} : « pulse-motion ${m[1]} ${m[2]} » n'existe pas`);
    }
  }
});


test('demandes : skills outils et voix, déclenchables en langage courant, consignes complètes', () => {
  for (const s of ['outils', 'voix']) {
    const t = lire('skills', s, 'SKILL.md');
    const e = enTete(t);
    assert.equal(e['disable-model-invocation'], undefined, s);
    assert.ok((e.description.match(/« [^»]+ »/g) || []).length >= 3, `${s} : exemples de demandes`);
    assert.match(e['allowed-tools'], /Bash\(pulse-motion \*\)/, s);
  }
  const outils = lire('skills', 'outils', 'SKILL.md');
  for (const r of [/pulse-motion outils/, /pulse-motion ffmpeg/, /pulse-motion whisper installer/, /--modele small/, /relancer Claude Code/, /accord/, /j'enregistre la scène 1/]) assert.match(outils, r);
  assert.match(enTete(outils)['allowed-tools'], /winget install --id Python\.Python\.3\.12/);
  assert.match(enTete(outils)['allowed-tools'], /winget install --id Gyan\.FFmpeg/);
  const voix = lire('skills', 'voix', 'SKILL.md');
  for (const r of [/pulse-motion voix studio <id> \./, /pulse-motion voix importer "<chemin>"/, /pulse-motion voix provisoire \./, /pulse-motion voix transcrire \./, /pulse-motion musique ecouter \. --ouvrir/, /pulse-motion apercu \. --ouvrir/, /pulse-motion etat \./]) assert.match(voix, r);
  assert.match(enTete(voix).description, /retoucher/);
  assert.match(voix, /\/pulse-motion:creer/);
});


// Spec Retouches et ergonomie (S4) 5.5 : creer et style appelables en phrase, avec garde-fous (décision validée par
// l'auteur le 2026-11-08 ; retour au blocage au-delà de 5 % de déclenchements erronés aux évaluations).
test('plugin : creer et style sans disable-model-invocation', () => {
  for (const s of SKILLS) assert.equal(enTete(lire('skills', s, 'SKILL.md'))['disable-model-invocation'], undefined, s);
});

test('plugin : description de creer et de style, garde-fou dans la première phrase', () => {
  const description = (s) => enTete(lire('skills', s, 'SKILL.md')).description.replace(/^"(.*)"$/, '$1');
  const premiere = (s) => description(s).split(/\. (?=[A-ZÀ-Ý])/)[0];
  assert.match(premiere('creer'), /^Créer une NOUVELLE vidéo Pulse Motion, seulement quand la personne le demande/);
  assert.match(premiere('creer'), /« que sait faire Pulse Motion \? »/);
  assert.match(premiere('style'), /^Créer son propre style de vidéo, seulement sur demande expresse/);
  for (const s of ['creer', 'style']) {
    assert.match(description(s), /\/pulse-motion:retoucher\.$/, `${s} : renvoi vers retoucher`);
    assert.ok([...description(s)].length < 250, s);
  }
});

test('plugin : creer n\'écrit rien avant la première ronde', () => {
  const creer = lire('skills', 'creer', 'SKILL.md');
  const debut = creer.indexOf('## 0. Vérifier');
  const ronde = creer.indexOf('**Première ronde**');
  assert.ok(debut > 0 && ronde > debut, 'sections 0 et 1, puis la première ronde');
  assert.match(creer.slice(debut, ronde), /Rien n'est écrit dans le dossier avant la réponse à la première ronde/);
  // Avant la première ronde, seulement des commandes qui n'écrivent rien dans le dossier (ordre des commandes du texte).
  const PERMISES = /^(etat \.|avancement \.|modeles (trouver|afficher|liste|apercu)|charte liste|lexique|reference|consignes)/;
  for (const m of creer.slice(0, ronde).matchAll(/pulse-motion ([a-z][^`]*)`/g)) assert.match(m[1], PERMISES, `avant la première ronde : « pulse-motion ${m[1]} »`);
  assert.doesNotMatch(creer.slice(0, ronde), /etat \. --(parcours|accord)|modeles exemple|charte (appliquer|depuis-logo|enregistrer)/);
  assert.ok(creer.indexOf('pulse-motion etat . --parcours') > ronde, 'le parcours se note après la première ronde');
  assert.match(creer, /« Nouvelle vidéo sur « <sujet> » dans ce dossier »/);
  assert.match(creer.slice(debut, ronde), /`projet` vrai[^\n]*\/pulse-motion:reprendre/);
  assert.match(creer.slice(debut, ronde), /« Que sait faire Pulse Motion \? »[^\n]*sans rien écrire/);
  assert.match(lire('references', 'demandes.md'), /## Que sait faire Pulse Motion \?/);
});

test('demandes : les compétences en langage courant, avec garde « pas de vidéo »', () => {
  for (const s of SKILLS) {
    const e = enTete(lire('skills', s, 'SKILL.md'));
    assert.equal(e['disable-model-invocation'], undefined, s);
    assert.ok((e.description.match(/« [^»]+ »/g) || []).length >= 3, `${s} : exemples de demandes`);
  }
  for (const s of ['retoucher', 'reprendre', 'exporter', 'voix']) assert.match(lire('skills', s, 'SKILL.md'), /`projet` faux[^\n]*\/pulse-motion:creer/, s);
  const retoucher = lire('skills', 'retoucher', 'SKILL.md');
  assert.match(retoucher, /\| Aperçu et images \|/);
  assert.match(retoucher, /\| Charte et glossaire \|/);
  for (const r of [/pulse-motion planche \. <ids> --ouvrir/, /pulse-motion charte enregistrer <nom> \./, /pulse-motion glossaire noter \./, /pulse-motion apercu \. --ouvrir/]) assert.match(retoucher, r);
  assert.match(enTete(lire('skills', 'reprendre', 'SKILL.md')).description, /où en est ma vidéo/);
  for (const s of ['creer', 'exporter']) assert.match(lire('skills', s, 'SKILL.md'), /pulse-motion consignes outils/, s);
});


test('demandes : README et smoke tests sans terminal', () => {
  const readme = lire('README.md');
  for (const s of SKILLS) assert.match(readme, new RegExp(`/pulse-motion:${s}`), s);
  const essais = path.join(RACINE, '..', '..', 'docs', 'essais');
  for (const f of ['smoke-test-son.md', 'smoke-test-complet.md']) {
    const t = fs.readFileSync(path.join(essais, f), 'utf8');
    assert.doesNotMatch(t, /```powershell|```bash|PowerShell/, f);
    assert.doesNotMatch(t, /(^|\s)pm (voix|apercu|exporter|whisper|musique|assembler|controler|ffmpeg|outils)/m, f);
  }
});

test('consignes : l\'atelier des effets est guidé', () => {
  const ref = lireReference('particules', { parties: true });
  assert.match(lire('references', 'particules', 'atelier.md'), /^# Régler à l'œil : l'atelier\n/);
  assert.match(ref, /pulse-motion atelier/);
  assert.match(ref, /bouton \*\*Effets\*\*/);
  assert.match(ref, /« Enregistrer comme nouvel effet »/);
  const skill = lire('skills', 'atelier-particules', 'SKILL.md');
  assert.match(skill, /pulse-motion atelier/);
  assert.match(skill, /bouton « Effets »/);
  assert.match(lire('skills', 'retoucher', 'SKILL.md'), /atelier-particules/);
});

// Spec Rapidité (S1) § 5.2, 5.5 et 5.6 : descriptions courtes, budget des consignes, état injecté, effort.
const descriptionDe = (s) => enTete(lire('skills', s, 'SKILL.md')).description.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');

test('descriptions-250-caracteres : chaque description tient dans la liste de Claude Code (250 caractères Unicode au plus)', () => {
  for (const s of SKILLS) {
    const d = descriptionDe(s);
    assert.ok([...d].length <= 250, `${s} : ${[...d].length} caractères`);
    assert.doesNotMatch(d, /"/, `${s} : guillemet droit dans la description`);
  }
});

test('descriptions-renvois-presents : chaque renvoi vers une autre compétence subsiste, sous une forme courte', () => {
  const RENVOIS = {
    'animer-personnage': ['dessiner-personnage', 'atelier-personnages'],
    'atelier-particules': ['atelier-personnages'],
    'atelier-personnages': ['atelier-particules'],
    'decouper-personnage': ['dessiner-personnage', 'atelier-personnages'],
    'dessiner-personnage': ['animer-personnage', 'atelier-personnages'],
    creer: ['retoucher'],
    exporter: ['retoucher'],
    reprendre: ['creer'],
    retoucher: ['voix', 'creer'],
    style: ['retoucher'],
    voix: ['retoucher'],
  };
  for (const [s, cibles] of Object.entries(RENVOIS)) {
    const d = descriptionDe(s);
    for (const c of cibles) assert.match(d, new RegExp(`(^|[\\s/:])${c}(?![a-z-])`), `${s} : renvoi vers ${c}`);
  }
});

test('budget-consignes : les consignes ne regrossissent pas sans qu\'on le voie (octets, état 0.28.0 + 10 % ; animateur 6 000 o)', () => {
  // animateur.md ramené à 6 000 o par les références à la carte (spec S1 § 5.4, plan S1-2, 0.29.0).
  // 0.33.0 (S10-A et S2-2) : creer +1 700 o (visuels d'un produit, directions, recettes de rythme, regarder avant de
  // montrer, ligne 🔎), retoucher +1 300 o (lignes Revue et Format, regarder, ligne 🔎), exporter +700 o (sorties, ligne 🔎) ;
  // la section « fabrication » de creer reste sous 7 000 o (consignes-a-la-carte.test.js).
  // 0.34.0 (S2-3 et S2-4) : creer +300 o (lire la doctrine, la relecture dès 3 scènes, verdict sur la ligne 🔎),
  // retoucher +200 o (relecture d'une refonte, ligne 🔎), exporter +100 o (verdict de la relecture) : trois renvois d'une
  // ligne, la conduite elle-même vit dans realisation § 13 et revue.md, lus à la demande. critique.md : corps ≤ 3 500 o.
  // 0.40.0 (S4 R1, 5.6) : outils 6 144 → 6 550 o (plan d'installation en un accord, installation de Node.js : deux étapes
  // demandées par la spec, que les autres compétences ne recopient plus ; elles renvoient à outils).
  // 0.51.0 (S6 plan 2) : filmer, la 13e compétence (7 417 o, plafond 7 800 o) ; creer, retoucher, reprendre et l'animateur
  // n'y renvoient qu'en une ligne (consignes filmer creer, retouches, prises), sans relever leur plafond.
  // 0.52.0 (S6 plans 3 et 4) : filmer 7 800 → 11 500 o : accord réseau, connexion, confidentialité et import (spec S6
  // 5.16), trois flux propres à cette compétence que creer, retoucher et outils (pleins) ne recopient pas.
  const PLAFONDS = {
    'skills/animer-personnage/SKILL.md': 5884, 'skills/atelier-particules/SKILL.md': 2272, 'skills/atelier-personnages/SKILL.md': 3529,
    'skills/creer/SKILL.md': 23400, 'skills/decouper-personnage/SKILL.md': 4020, 'skills/dessiner-personnage/SKILL.md': 4528,
    'skills/exporter/SKILL.md': 6600, 'skills/filmer/SKILL.md': 11500, 'skills/outils/SKILL.md': 6550, 'skills/reprendre/SKILL.md': 2999,
    'skills/retoucher/SKILL.md': 13850, 'skills/style/SKILL.md': 6460, 'skills/voix/SKILL.md': 5073,
    'agents/animateur.md': 6000, 'agents/critique.md': 3800,
  };
  for (const f of fichiersGuides()) {
    const cle = f.split(path.sep).join('/');
    assert.ok(PLAFONDS[cle], `${cle} : plafond à fixer dans ce test`);
    const octets = fs.statSync(path.join(RACINE, f)).size;
    assert.ok(octets <= PLAFONDS[cle], `${cle} : ${octets} o, plafond ${PLAFONDS[cle]} o`);
  }
});

test('injection-etat-reprendre-retoucher-exporter : état lu au lancement, jamais une commande qui annule la compétence', () => {
  const ATTENDU = { reprendre: ['etat .', 'lexique'], retoucher: ['etat .', 'lexique'], exporter: ['etat .', 'ffmpeg'] };
  for (const s of SKILLS) {
    const texte = lire('skills', s, 'SKILL.md');
    const blocs = [...texte.matchAll(/^!`([^`]+)`$/gm)].map((m) => m[1]);
    // Une commande injectée qui sort en erreur annule toute la compétence : chacune finit par « || true ».
    for (const b of blocs) assert.match(b, /^pulse-motion [a-z]+[^`]* 2>&1 \|\| true$/, `${s} : « ${b} »`);
    assert.deepEqual(blocs.map((b) => b.replace(/^pulse-motion (.*) 2>&1 \|\| true$/, '$1')), ATTENDU[s] || [], s);
    if (!ATTENDU[s]) continue;
    // Le bloc vient avant toute autre consigne, sous son titre ; consignes creer n'est pas injecté.
    const avantPremierBloc = texte.slice(0, texte.indexOf('!`'));
    assert.match(avantPremierBloc, /## État de la vidéo, lu au lancement\n\n$/, s);
    assert.doesNotMatch(texte, /!`pulse-motion consignes/, s);
    assert.doesNotMatch(texte, /^shell:/m, `${s} : shell par défaut (bash)`);
  }
});

test('injection-suivie-du-repli : chaque bloc injecté est suivi de sa phrase de repli', () => {
  for (const s of ['reprendre', 'retoucher', 'exporter']) {
    const texte = lire('skills', s, 'SKILL.md');
    for (const m of texte.matchAll(/^!`pulse-motion ([^`]+) 2>&1 \|\| true`\n\n([^\n]+)/gm)) {
      assert.equal(m[2], `Si ce bloc est vide ou contient une erreur, lancer \`pulse-motion ${m[1]}\`.`, `${s} : ${m[1]}`);
    }
    assert.equal([...texte.matchAll(/^Si ce bloc est vide ou contient une erreur/gm)].length, [...texte.matchAll(/^!`/gm)].length, s);
    // Node absent : la compétence reconnaît le message des enveloppes.
    assert.match(texte, /« Node\.js introuvable »/, s);
  }
});

// Spec S1 § 5.6 : « effort: low » ne se garde que si les commandes lancées et le bloc de fin restent identiques. Mesure
// du 2026-11-08 (3 phrases types par compétence, avec et sans le champ) : sur outils et les deux ateliers, l'effort
// faible saute la lecture et la note du lexique ; sur exporter, il lance l'export au premier plan au lieu de
// l'arrière-plan (première phrase après 100 à 125 s au lieu de 25 à 30 s). Aucune compétence ne le garde.
const EFFORT_FAIBLE = [];

test('effort-low-sur-les-competences-procedurales : effort faible seulement là où la mesure l\'a validé (aucune au 2026-11-08)', () => {
  const avecEffort = SKILLS.filter((s) => enTete(lire('skills', s, 'SKILL.md')).effort !== undefined).sort();
  assert.deepEqual(avecEffort, EFFORT_FAIBLE);
  for (const s of avecEffort) assert.equal(enTete(lire('skills', s, 'SKILL.md')).effort, 'low', s);
});

test('effort-absent-sur-reprendre-et-creer : reprendre peut fabriquer toute une vidéo, creer en écrit les scènes', () => {
  for (const s of ['reprendre', 'creer', 'retoucher', 'style', 'voix', 'dessiner-personnage', 'animer-personnage', 'decouper-personnage']) {
    assert.equal(enTete(lire('skills', s, 'SKILL.md')).effort, undefined, s);
  }
  assert.equal(enTete(lire('agents', 'animateur.md')).effort, undefined);
});

// --- Spec « Regard et réalisation » (S2), plan S2-2 : regarder avant de montrer (5.4), bilan honnête (5.6) ----------

test('plugin.test.js › creer et retoucher regardent la planche de regard avant de montrer', () => {
  const { sectionsConsignes } = require('../scripts/lib/consignes.js');
  const apercu = sectionsConsignes(lire('skills', 'creer', 'SKILL.md'), ['apercu']).texte;
  const regard = apercu.indexOf('`pulse-motion planche . --regard`');
  const ouvrir = apercu.indexOf('`pulse-motion apercu . --ouvrir`');
  assert.ok(regard > 0 && ouvrir > regard, "creer : les planches regardées avant d'ouvrir l'aperçu");
  assert.match(apercu, /`sortie\/regard\/ouverture\.png`, `telephone-\*\.png` et `temps-forts-\*\.png` \(pas `bandes\.png`\), en trois passes/);
  assert.match(apercu, /un tour au plus/);
  assert.match(apercu, /sans question/);
  const r = lire('skills', 'retoucher', 'SKILL.md');
  const etape = r.slice(r.indexOf('## 5. Vérifier et montrer'), r.indexOf('## 6. Fin'));
  const controle = etape.indexOf('`pulse-motion controler .`');
  const planche = etape.indexOf('`pulse-motion planche . --regard --scenes <scènes touchées>`');
  assert.ok(controle > 0 && planche > controle, 'retoucher : après le contrôle');
  assert.match(etape, /deux au plus/);
  assert.match(etape, /ne touche que le son, la charte ou le glossaire n'en fait pas/);
});

/** Bloc de fin d'une compétence : les lignes qui commencent par un pictogramme, dans l'ordre. */
function blocDeFin(s) {
  const t = lire('skills', s, 'SKILL.md');
  return t.slice(t.lastIndexOf('\n## ')).split('\n').filter((l) => /^(✅|📄|🔎|➡️)/u.test(l));
}

test('plugin.test.js › blocs de fin : ✅, 📄, 🔎, ➡️ dans cet ordre, pour creer, retoucher et exporter', () => {
  for (const s of ['creer', 'retoucher', 'exporter']) {
    assert.deepEqual(blocDeFin(s).map((l) => [...l][0]), ['✅', '📄', '🔎', '➡'], s);
    assert.match(blocDeFin(s)[2], /^🔎 \*\*Vérifié\*\* : /, s);
  }
});

test("plugin.test.js › bilan : « mesuré, pas écouté » et ce qui n'a pas pu être vérifié", () => {
  for (const s of ['creer', 'retoucher', 'exporter']) {
    const t = lire('skills', s, 'SKILL.md');
    const fin = t.slice(t.lastIndexOf('\n## '));
    assert.match(fin, /le son a été mesuré, pas écouté/, s);
    assert.match(fin, /n'a pas pu l'être|n'a pas pu être vérifié/, s);
    assert.match(fin, /« sans (Chrome|ffmpeg)/, s);
  }
  assert.match(blocDeFin('creer')[2], /images de la vidéo regardées/);
  assert.match(blocDeFin('creer')[2], /Ce que je corrigerais ensuite/);
  assert.match(blocDeFin('retoucher')[2], /les scènes touchées ont été contrôlées et regardées ; les autres n'ont pas été modifiées/);
});

// --- Spec « Regard et réalisation » (S2), plan S2-3 : doctrine (5.1), règles de scène (5.2) ------------------------

test('plugin.test.js › creer lit pulse-motion reference realisation avant d\'écrire le déroulé ; l\'animateur ne la lit pas', () => {
  const { sectionsConsignes } = require('../scripts/lib/consignes.js');
  const deroule = sectionsConsignes(lire('skills', 'creer', 'SKILL.md'), ['deroule']).texte;
  const lecture = deroule.indexOf('`pulse-motion reference realisation`');
  const ecriture = deroule.indexOf('Écrire `deroule.json`');
  assert.ok(lecture > 0 && ecriture > lecture, 'la doctrine est lue avant d\'écrire le déroulé');
  assert.ok(deroule.indexOf('`pulse-motion reference rythme`') < lecture, 'après la référence rythme');
  assert.match(deroule, /`pulse-motion reference realisation` \(ses `cadrans`, ses `faits`\)/);
  for (const f of ['agents/animateur.md', 'agents/critique.md']) assert.doesNotMatch(lire(f), /realisation/, f);
  // Ni le tronc ni la partie de rythme (lus par l'animateur) ne renvoient à la doctrine entière.
  assert.doesNotMatch(lireReference('rythme', { parties: true }), /reference realisation/);
});

test('plugin.test.js › rythme.md : mouvement, chiffres et clichés, sans dépasser 4 200 octets au total', () => {
  const tronc = lire('references', 'rythme.md');
  const partie = lire('references', 'rythme', 'scene.md');
  assert.ok(Buffer.byteLength(tronc) + Buffer.byteLength(partie) <= 4200, `${Buffer.byteLength(tronc) + Buffer.byteLength(partie)} o`);
  assert.ok(Buffer.byteLength(partie) <= 1500, `${Buffer.byteLength(partie)} o ajoutés`);
  assert.deepEqual([...partie.matchAll(/^## (.+)$/gm)].map((m) => m[1]), ['Mouvement', 'Chiffres', 'À éviter']);
  for (const r of [/fondu seul/, /un seul dépassement/i, /`back-out`, `bounce-out` et `elastic-out` seulement si le style les propose/, /Caméra immobile pendant qu'un texte important entre/,
    /valeur d'un compteur est celle du déroulé \(texte, texte dit, intention ou `faits`\)/, /L'unité et la date entrent quand le compteur s'arrête/, /« Exemple »/, /« après » plutôt que « grâce à »/,
    /Emoji/, /« 03\/06 »/, /même temps sur la même courbe/, /scène vide pendant sa transition/]) assert.match(partie, r);
  // Courbes citées : de vraies courbes du moteur.
  const C = require('../moteur/courbes.js');
  for (const m of partie.matchAll(/`([a-z]+-(?:out|in|inout))`/g)) assert.doesNotThrow(() => C.courbeNommee(m[1]), m[1]);
  // La partie est lue à la demande, par une scène composée ou témoin : listée par le tronc, pas dans sa tête.
  assert.match(tronc, /\n## Les parties\n\n- `pulse-motion reference rythme\/scene` : [^\n]*scène composée ou témoin/);
  assert.doesNotMatch(tronc.slice(0, tronc.indexOf('\n## Les parties')), /rythme\/scene/);
});

test('plugin.test.js › rythme.md : l\'accroche annoncée est celle de seuils.json (3 s)', () => {
  const seuils = JSON.parse(lire('scripts', 'seuils.json'));
  const ligne = lire('references', 'rythme.md').split('\n').find((l) => l.startsWith('| Publication sociale |'));
  assert.match(ligne, /Accroche lisible avant (\d+) s \(`accrocheMax`\)/);
  assert.equal(Number(/avant (\d+) s/.exec(ligne)[1]), seuils.accrocheMax);
  assert.doesNotMatch(ligne, /en 2 s/);
});

test('plugin.test.js › animateur : pas de scène vide en transition, pas de nombre inventé', () => {
  const a = lire('agents', 'animateur.md');
  const temps = a.split('\n').find((l) => l.startsWith('4. Temps : '));
  assert.match(temps, /jamais de scène vide pendant sa transition/);
  assert.match(temps, /Un compteur : le nombre de la consigne, jamais inventé/);
  // En cas de doute, le dire dans le compte rendu.
  assert.match(a.slice(a.indexOf('## Résultat à renvoyer')), /nombre incertain/);
  assert.ok(Buffer.byteLength(a) <= 6000, `${Buffer.byteLength(a)} o`);
});

// --- Spec « Regard et réalisation » (S2), plan S2-4 : l'agent critique (5.5), bilan (5.6) ---------------------------

test('plugin.test.js › agent critique : nom, description de 250 caractères au plus, outils Read, Glob, Write, sans model: dans le frontmatter', () => {
  const t = lire('agents', 'critique.md');
  const e = enTete(t);
  assert.equal(e.name, 'critique');
  assert.ok(e.description.length <= 250, `${e.description.length} caractères`);
  assert.match(e.description, /\/pulse-motion:creer et \/pulse-motion:retoucher/);
  assert.equal(e.tools, 'Read, Glob, Write');
  assert.equal(e.model, undefined);
  assert.equal(e.effort, undefined);
  assert.ok(Buffer.byteLength(t.replace(/^---[\s\S]*?---\n/, '')) <= 3500, 'corps ≤ 3 500 o');
});

test('plugin.test.js › creer et retoucher passent le modèle du critique à l\'appel, jamais plus cher que la session', () => {
  const { sectionsConsignes } = require('../scripts/lib/consignes.js');
  const apercu = sectionsConsignes(lire('skills', 'creer', 'SKILL.md'), ['apercu']).texte;
  const r = lire('skills', 'retoucher', 'SKILL.md');
  for (const [nom, t] of [['creer', apercu], ['retoucher', r]]) {
    assert.match(t, /agent `critique`, (?:modèle passé à l'appel \(`model`\)|`model` passé à l'appel), selon `realisation` § 13/, nom);
  }
  // La règle elle-même, la même phrase que pour l'animateur (S1, 5.3), dans la section que les deux citent.
  const regle = 'Jamais un modèle plus cher que celui de la session : si la session tourne déjà en Sonnet ou en Haiku, aucun paramètre.';
  const treize = lire('references', 'realisation.md').split('\n## 13. ')[1].split('\n## ')[0];
  assert.ok(treize.includes(regle));
  assert.match(treize, /\(paramètre `model`\) : `sonnet`/);
  for (const s of ['creer', 'retoucher']) assert.ok(lire('skills', s, 'SKILL.md').includes(regle), s);
});

test('plugin.test.js › revue.md donne la correspondance des 5 axes vers les 8 axes de critique.json, et chaque axe du critique y figure une fois', () => {
  const { AXES } = require('../scripts/lib/relecture.js');
  const r = lire('references', 'revue.md');
  const s = r.slice(r.indexOf('## Depuis la relecture du critique'), r.indexOf('## Rendre la revue'));
  const lignes = s.split('\n').filter((l) => /^\| (Message|Lisibilité|Rythme|Cohérence|Singularité) \|/.test(l)).map((l) => l.split('|').map((c) => c.trim()));
  assert.deepEqual(lignes.map((l) => l[1]), ['Message', 'Lisibilité', 'Rythme', 'Cohérence', 'Singularité']);
  // Singularité : aucun axe du critique (Claude la note lui-même) ; sa cellule ne cite que la doctrine.
  const axesDe = (cellule) => (/^aucun/.test(cellule) ? [] : [...cellule.matchAll(/`([a-z]+)`/g)].map((m) => m[1]));
  const cites = lignes.flatMap((l) => axesDe(l[2]));
  assert.deepEqual([...cites].sort(), [...AXES].sort(), 'chaque axe du critique une fois');
  assert.deepEqual(Object.fromEntries(lignes.map((l) => [l[1], axesDe(l[2])])),
    { Message: ['message', 'verite'], Lisibilité: ['lisibilite', 'composition'], Rythme: ['ouverture', 'rythme'], Cohérence: ['continuite', 'mouvement'], Singularité: [] });
  assert.match(lignes[4][2], /^aucun : Claude la note lui-même/);
  assert.match(s, /Cette table fait foi/);
  assert.match(s, /moyenne des axes du critique notés/);
  // La ligne « À venir » de l'agent est retirée ; la revue lance la relecture quand elle n'est pas à jour.
  assert.doesNotMatch(r.slice(r.indexOf('## À venir')), /critique/);
  assert.match(r, /si elle n'est pas à jour \(`aJour` faux ou `null`\), lancer l'agent `critique`/);
});

test('plugin.test.js › critique : 8 axes, barre de 8, un seul tour, pas de son, verrouillé, invérifiable', () => {
  const { AXES } = require('../scripts/lib/relecture.js');
  const t = lire('agents', 'critique.md');
  const grille = t.slice(t.indexOf('| Axe |')).split('\n').filter((l) => /^\| `/.test(l)).map((l) => /`([a-z]+)`/.exec(l)[1]);
  assert.deepEqual(grille, AXES);
  assert.match(t, /chaque axe noté vaut 8 \(`critiqueBarre`\) ou plus et qu'aucun défaut n'est `a-corriger`/);
  assert.match(t, /Un seul tour de corrections suivra, sans seconde relecture/);
  assert.match(t, /vous ne jugez pas le son/);
  assert.match(t, /\*\*Verrouillé\*\* \(fiche\) : textes validés par la personne, style, charte/);
  assert.match(t, /\*\*Invérifiable\*\*[^\n]*`null`[^\n]*`inverifiable`/);
  assert.match(t, /Rejetez par défaut/);
  assert.match(t, /Regarder toutes les planches \*\*avant\*\* la fiche/);
  assert.match(t, /Écrire `sortie\/regard\/critique\.json`, le seul fichier que vous écrivez/);
  assert.match(t, /résumé de 450 mots au plus/);
  assert.match(t, /Vous ne retouchez rien/);
});

test('plugin.test.js › creer lance la critique pour 3 scènes et plus, avant l\'aperçu ; retoucher seulement pour une refonte ou sur demande ; exporter jamais', () => {
  const { sectionsConsignes } = require('../scripts/lib/consignes.js');
  const apercu = sectionsConsignes(lire('skills', 'creer', 'SKILL.md'), ['apercu']).texte;
  const regard = apercu.indexOf('`pulse-motion planche . --regard`');
  const relecture = apercu.indexOf('dès 3 scènes, la **relecture**');
  const ouvrir = apercu.indexOf('`pulse-motion apercu . --ouvrir`');
  assert.ok(regard > 0 && relecture > regard && ouvrir > relecture, 'regard, relecture, puis aperçu');
  const r = lire('skills', 'retoucher', 'SKILL.md');
  const etape = r.slice(r.indexOf('## 5. Vérifier et montrer'), r.indexOf('## 6. Fin'));
  assert.match(etape, /Refonte \(style changé, 3 scènes réécrites ou plus, scène ajoutée ou retirée\) : puis la relecture, agent `critique`/);
  assert.match(r.split('\n').find((l) => l.startsWith('| Revue |')), /`pulse-motion reference revue`/);
  const e = lire('skills', 'exporter', 'SKILL.md');
  assert.doesNotMatch(e, /agent `critique`|Agent/);
  assert.doesNotMatch(enTete(e)['allowed-tools'], /\bAgent\b/);
  assert.match(e, /`relecture` du résumé/);
  const treize = lire('references', 'realisation.md').split('\n## 13. ')[1].split('\n## ')[0];
  assert.match(treize, /`creer`, une fois, dès 3 scènes/);
  assert.match(treize, /`retoucher` : refonte[^\n]*ou demande/);
  assert.match(treize, /Jamais à l'export/);
  // « Jamais deux fois sur la même version » : la relecture à jour se relit.
  assert.match(treize, /`aJour` vrai : relire `sortie\/regard\/critique\.json`, ne pas relancer/);
  assert.match(lire('references', 'revue.md'), /Une relecture à jour se relit, sans se relancer/);
});

test('plugin.test.js › blocs de fin : le verdict de la relecture dans la ligne 🔎 de creer, retoucher et exporter', () => {
  assert.match(blocDeFin('creer')[2], /relue par un relecteur qui n'a pas vu la fabrication \(<prête, ou corrigée après relecture, non relue>\), scène la plus faible « <id> »/);
  assert.match(blocDeFin('retoucher')[2], /\[ ; relue : scène la plus faible « <id> », corrigée, non relue\]/);
  assert.match(blocDeFin('exporter')[2], /`relecture` du résumé : relue \(prête, ou corrigée après relecture\)[^\n]*`null` : non relue/);
});

// --- Spec « Regard et réalisation » (S2), plan S2-6 : vérification de l'export (5.12) -----------------------------------

test('plugin.test.js › exporter dit la vérification et relance une fois sur erreur', () => {
  const e = lire('skills', 'exporter', 'SKILL.md');
  const ligne = e.split('\n').find((l) => l.startsWith('- `verification`'));
  assert.ok(ligne, 'une ligne pour la vérification de l\'export');
  assert.match(ligne, /`sortie\/verification\.json`/);
  assert.match(ligne, /une erreur[^\n]*« l'export est abîmé », le relancer une fois/);
  assert.match(ligne, /des alertes[^\n]*les dire en une phrase et proposer la retouche/);
  assert.match(blocDeFin('exporter')[2], /`faites` de `sortie\/verification\.json`/);
  assert.match(blocDeFin('exporter')[2], /`nonFaites`/);
  assert.match(lire('references', 'controles.md'), /`sortie\/verification\.json` : la vérification de l'export/);
});

// --- Décision 8 de l'auteur (2026-11-09) : tour de corrections après la critique borné --------------------------------

test('plugin.test.js › tour de corrections après la critique borné : défauts à corriger seulement, 3 scènes au plus, corrigées sur place', () => {
  const treize = lire('references', 'realisation.md').split('\n## 13. ')[1].split('\n## ')[0];
  const ligne = treize.split('\n').find((l) => l.startsWith('- **Un seul tour'));
  assert.ok(ligne, 'la règle du tour de corrections');
  assert.match(ligne, /les défauts `a-corriger` seulement \(les autres se citent à la personne\)/);
  assert.match(ligne, /3 scènes \(`critiqueScenesMax`\) au plus, les plus graves d'abord/);
  assert.match(ligne, /sur place \(Edit ciblé : taille, « Exemple », couleur, durée\), réécrire seulement si le défaut l'exige/);
  assert.match(ligne, /sans seconde relecture/);
  // L'ancienne règle (« les scènes notées 7 ou moins ») a disparu partout.
  for (const f of [['references', 'realisation.md'], ['references', 'controles.md'], ['references', 'revue.md'], ['skills', 'creer', 'SKILL.md'], ['skills', 'retoucher', 'SKILL.md'], ['agents', 'critique.md']]) {
    assert.doesNotMatch(lire(...f), /notées 7|critiqueCorrige/, f.join('/'));
  }
  const SEUILS = JSON.parse(lire('scripts', 'seuils.json'));
  assert.equal(SEUILS.critiqueScenesMax, 3);
  assert.equal(SEUILS.critiqueCorrige, undefined);
  assert.match(lire('references', 'controles.md'), /3 scènes \(`critiqueScenesMax`\) au plus/);
});

// --- Spec Rendu et export (S5), jalon 1 : skill exporter, mentions de tiers ---------------------------------------------

test('plugin.test.js › le skill exporter cite les six usages, sans mot interdit (CRF, débit, codec, BT.709, ProRes)', () => {
  const s = lire('skills', 'exporter', 'SKILL.md');
  for (const u of ['web', 'reseaux', 'presentation', 'master', 'courriel', 'brouillon']) assert.match(s, new RegExp(`\`${u}\``), u);
  assert.doesNotMatch(s, /\bCRF\b|débit|\bcodec\b|BT\.?709|ProRes/i);
  assert.match(s, /`pulse-motion reference usages`/);
  assert.match(s, /--pour <usage>/);
  assert.match(s, /--estimer/);
  assert.match(s, /--taille-max 20/);
  // La référence des usages, rendue depuis usages.json, ne dit pas non plus de mot technique à la personne.
  const { tableauUsages } = require('../scripts/lib/usages.js');
  assert.doesNotMatch(tableauUsages().split('\n').filter((l) => l.startsWith('| `')).join('\n'), /\bCRF\b|débit|\bcodec\b|BT\.?709|ProRes/i);
});

test('plugin.test.js › AskUserQuestion du skill exporter : quatre options au plus, le web recommandé', () => {
  const s = lire('skills', 'exporter', 'SKILL.md');
  const ligne = s.split('\n').find((l) => l.includes('« Pour le web (Recommandé) »'));
  assert.ok(ligne, 'question des usages');
  const question = ligne.slice(ligne.indexOf('`AskUserQuestion`'));
  const options = question.slice(0, question.indexOf(' ; ')).match(/« [^»]+ »/g);
  assert.deepEqual(options, ['« Pour le web (Recommandé) »', '« Pour les réseaux sociaux »', '« Pour l\'envoyer par courriel »', '« Pour la projeter en réunion »']);
  assert.ok(options.length <= 4);
  // Vidéo 9:16 ou sociale : les réseaux en premier (décision 13).
  assert.match(ligne, /9:16 ou de genre `social` : « Pour les réseaux sociaux \(Recommandé\) » en premier/);
  // Seulement si la demande ne dit pas l'usage.
  assert.match(ligne, /Si la demande ne le dit pas, `AskUserQuestion`/);
});

test('plugin.test.js › THIRD-PARTY-NOTICES.md cite Mediabunny (MPL-2.0) et chaque dépôt traduit de près par S5 ; fichiers racine et plugin identiques', () => {
  const plugin = lire('THIRD-PARTY-NOTICES.md');
  const racine = fs.readFileSync(path.join(RACINE, '..', '..', 'THIRD-PARTY-NOTICES.md'), 'utf8');
  assert.equal(racine, plugin);
  const section = (nom) => { const i = plugin.indexOf(`\n## ${nom}\n`); assert.ok(i >= 0, nom); const j = plugin.indexOf('\n## ', i + 4); return plugin.slice(i, j < 0 ? undefined : j); };
  assert.match(section('Mediabunny'), /MPL-2\.0/);
  assert.match(section('Mediabunny'), /1\.61\.3/);
  assert.match(section('Mediabunny'), /non modifié/);
  assert.match(section('argo'), /Copyright \(c\) 2026 Shreyas Karnik/);
  assert.match(section('argo'), /usages\.json/);
  assert.match(section('argo'), /detecterEncodeurs/);
  assert.match(section('reanimate'), /out_color_matrix=bt709:out_range=tv/);
  assert.match(section('video-director'), /usages\.json/);
  assert.match(section('take-one'), /usages\.json/);
  assert.match(section('Lemo-Opuscar'), /core\/render\/video\.mjs/);
  // Aucune mention de huashu (idées seulement, par S10) ni d'anidoodle comme source.
  assert.doesNotMatch(plugin, /huashu/i);
});

// --- Spec Rendu et export (S5), jalons 2 et 3 : textes d'accompagnement, sorties, notices ---------------------------------

test('plugin.test.js › le skill exporter renvoie à references/accompagnement.md pour réseaux et courriel ; Write limité aux textes', () => {
  const e = lire('skills', 'exporter', 'SKILL.md');
  const ligne = e.split('\n').find((l) => l.includes('`pulse-motion reference accompagnement`'));
  assert.ok(ligne, 'renvoi à accompagnement');
  assert.match(ligne, /`reseaux` ou `courriel` : proposer « Voulez-vous un texte pour accompagner la vidéo \? »/);
  assert.match(enTete(e)['allowed-tools'], /\bWrite\b/);
  assert.match(e, /`Write` n'écrit que `sortie\/<titre>-textes\.md`/);
  // Les nouvelles sorties passent par la référence des sorties, qui donne leurs options.
  const sorties = lire('references', 'sorties.md');
  for (const o of ['--scene', '--plage', '--gif', '--cadre telephone', 'planche . --pdf', 'pulse-motion credits . noter']) assert.ok(sorties.includes(o), o);
});

test('plugin.test.js › accompagnement.md : règles d\'accroche, de chiffres et de longueur présentes', () => {
  const t = lire('references', 'accompagnement.md');
  assert.match(t, /^# .+\n\n## L'essentiel\n/);
  assert.match(t, /\*\*15 mots au plus\*\*/);
  assert.match(t, /\*\*sujet apparaît dans les 3 premiers mots\*\*/);
  assert.match(t, /\*\*3 à 5 lignes\*\*/);
  assert.match(t, /Seulement ceux \*\*présents dans la vidéo\*\*/);
  assert.match(t, /« Exemple »/);
  assert.match(t, /\*\*0 à 3\*\*/);
  assert.match(t, /\*\*60 caractères au plus\*\*/);
  assert.match(t, /\*\*3 phrases\*\*/);
  assert.match(t, /\*\*2 phrases\*\*/);
  assert.match(t, /Rien n'est publié/);
});

test('plugin.test.js › notices : chapitres et marges d\'explainroo, ffmetadata et palette d\'argo, plage de take-one, cadre de rossark', () => {
  const n = lire('THIRD-PARTY-NOTICES.md');
  assert.match(n, /src\/chapters\.js/);
  assert.match(n, /zonesPlateformes/);
  assert.match(n, /;FFMETADATA1/);
  assert.match(n, /palettegen=stats_mode=diff/);
  assert.match(n, /`START\/END`/);
  assert.match(n, /moteur\/cadres\/telephone\.js/);
});
