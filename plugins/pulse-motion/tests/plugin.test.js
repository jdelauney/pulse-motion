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
const COMMANDES = ['etat', 'assembler', 'controler', 'apercu', 'historique', 'reference', 'scene', 'styles', 'consignes', 'exporter', 'planche', 'effet', 'comparer', 'changer-style', 'lexique', 'charte', 'police', 'glossaire', 'style', 'ffmpeg', 'voix', 'whisper', 'musique', 'outils', 'atelier', 'personnages', 'mouvements', 'modeles'];
const fichiersGuides = () => [
  ...SKILLS.map((s) => path.join('skills', s, 'SKILL.md')),
  ...fs.readdirSync(path.join(RACINE, 'agents')).map((a) => path.join('agents', a)),
];

test('skills : creer, exporter, retoucher, reprendre, lancés par la personne, outils limités', () => {
  assert.deepEqual(SKILLS.sort(), ['animer-personnage', 'atelier-particules', 'atelier-personnages', 'creer', 'decouper-personnage', 'dessiner-personnage', 'exporter', 'outils', 'reprendre', 'retoucher', 'style', 'voix']);
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
    assert.match(lire('references', f), /^# .+\n\n## L'essentiel\n/, f);
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

test('référence des contrôles : chaque règle du contrôle y est expliquée, et les skills y renvoient', () => {
  const ref = lire('references', 'controles.md');
  const regles = ['temps-mort', 'pause-finale', 'lecture', 'texte-petit', 'contraste', 'typographie', 'majuscule-accentuee', 'mot-double', 'terme-variable',
    'trop-d-animations', 'debordement', 'chevauchement', 'hors-cadre', 'marge', 'zone-sure', 'logo-masque', 'texte-fugace', 'mouvement-rapide', 'contraste-reel', 'flash',
    'rendu-non-verifie', 'rendu-impossible'];
  for (const r of regles) assert.match(ref, new RegExp('`' + r + '`'), r);
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
  assert.match(creer, /« Pas de voix »[^\n]*ignor[^\n]*sous-titres/);
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


test('demandes : slash seulement pour creer et style ; les autres en langage courant, avec garde « pas de vidéo »', () => {
  for (const s of SKILLS) {
    const e = enTete(lire('skills', s, 'SKILL.md'));
    if (['creer', 'style'].includes(s)) assert.equal(e['disable-model-invocation'], 'true', s);
    else {
      assert.equal(e['disable-model-invocation'], undefined, s);
      assert.ok((e.description.match(/« [^»]+ »/g) || []).length >= 3, `${s} : exemples de demandes`);
    }
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
    exporter: ['retoucher'],
    reprendre: ['creer'],
    retoucher: ['voix', 'creer'],
    voix: ['retoucher'],
  };
  for (const [s, cibles] of Object.entries(RENVOIS)) {
    const d = descriptionDe(s);
    for (const c of cibles) assert.match(d, new RegExp(`(^|[\\s/:])${c}(?![a-z-])`), `${s} : renvoi vers ${c}`);
  }
});

test('budget-consignes : les consignes ne regrossissent pas sans qu\'on le voie (octets, état 0.28.0 + 10 % ; animateur 6 000 o)', () => {
  // animateur.md ramené à 6 000 o par les références à la carte (spec S1 § 5.4, plan S1-2, 0.29.0).
  const PLAFONDS = {
    'skills/animer-personnage/SKILL.md': 5884, 'skills/atelier-particules/SKILL.md': 2272, 'skills/atelier-personnages/SKILL.md': 3529,
    'skills/creer/SKILL.md': 21315, 'skills/decouper-personnage/SKILL.md': 4020, 'skills/dessiner-personnage/SKILL.md': 4528,
    'skills/exporter/SKILL.md': 6151, 'skills/outils/SKILL.md': 6144, 'skills/reprendre/SKILL.md': 2999,
    'skills/retoucher/SKILL.md': 12571, 'skills/style/SKILL.md': 6460, 'skills/voix/SKILL.md': 5073,
    'agents/animateur.md': 6000,
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
