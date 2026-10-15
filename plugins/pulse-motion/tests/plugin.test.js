'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RACINE = path.join(__dirname, '..');
const lire = (...p) => fs.readFileSync(path.join(RACINE, ...p), 'utf8');

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
const COMMANDES = ['etat', 'assembler', 'controler', 'apercu', 'historique', 'reference', 'scene', 'styles', 'consignes', 'exporter', 'planche', 'effet', 'comparer', 'changer-style', 'lexique', 'charte', 'police', 'glossaire', 'style', 'ffmpeg', 'voix', 'whisper', 'musique', 'outils', 'atelier', 'personnages'];
const fichiersGuides = () => [
  ...SKILLS.map((s) => path.join('skills', s, 'SKILL.md')),
  ...fs.readdirSync(path.join(RACINE, 'agents')).map((a) => path.join('agents', a)),
];

test('skills : creer, exporter, retoucher, reprendre, lancés par la personne, outils limités', () => {
  assert.deepEqual(SKILLS.sort(), ['creer', 'exporter', 'outils', 'reprendre', 'retoucher', 'style', 'voix']);
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

test('consignes : les personnages sont guidés', () => {
  const retoucher = lire('skills', 'retoucher', 'SKILL.md');
  assert.match(retoucher, /\| Personnages \|/);
  assert.match(retoucher, /pulse-motion personnages atelier <nom>/);
  assert.match(retoucher, /pulse-motion personnages planche <nom>/);
  assert.match(retoucher, /pulse-motion reference personnages/);
  assert.match(lire('references', 'personnages.md'), /^# .+\n\n## L'essentiel\n/);
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
  const moteur = lire('references', 'moteur.md');
  for (const motif of [/data-decor/, /data-superpose/, /alt=""/, /aria-hidden="true"/]) assert.match(moteur, motif);
  assert.match(lire('skills', 'creer', 'SKILL.md'), /rendu-non-verifie.*rendu-impossible/);
});

test('référence du moteur : contraste réel et flashs expliqués', () => {
  const moteur = lire('references', 'moteur.md');
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
  const t = lire('references', 'audio.md');
  assert.match(t, /^# .+\n\n## L'essentiel\n/);
  for (const mot of ['voix.texte', 'voix.provisoire', 'voix.debut', 'sousTitres', 'incrustes', 'bruitages', 'transitions', 'generee', 'graine', 'intensite', 'tonalite', 'partition', 'mot:', 'data-son', 'data-son-volume', '−16 LUFS', '3,5 mots', '.srt', '.vtt', '--avec-provisoire',
    'pulse-motion voix importer', 'pulse-motion voix provisoire', 'pulse-motion voix transcrire', 'pulse-motion voix studio', 'pulse-motion whisper installer', 'pulse-motion musique ecouter']) {
    assert.ok(t.includes(mot), `audio.md : « ${mot} » absent`);
  }
  const C = require('../moteur/synthe/catalogue.js');
  for (const a of Object.keys(C.AMBIANCES)) assert.ok(t.includes(`\`${a}\``), `ambiance ${a}`);
  for (const s of C.BRUITAGES) assert.ok(t.includes(`\`${s}\``), `son ${s}`);
  for (const i of C.INSTRUMENTS) assert.ok(t.includes(`\`${i}\``), `instrument ${i}`);
  assert.match(lire('references', 'moteur.md'), /pulse-motion reference audio/);
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
  const audio = lire('references', 'audio.md');
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
  for (const f of ['audio.md', 'moteur.md']) assert.match(lire('references', f), /crête sous −1,5 dBFS/, f);
  assert.match(lire('references', 'audio.md'), /--pm-st-largeur/);
});

test('correctifs : sous-commandes du son citées dans les guides : elles existent', () => {
  const SOUS = { voix: ['importer', 'provisoire', 'transcrire', 'studio'], whisper: ['installer'], musique: ['ecouter'] };
  for (const f of [...fichiersGuides(), path.join('references', 'audio.md'), path.join('references', 'moteur.md')]) {
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
  const ref = lire('references', 'particules.md');
  assert.match(ref, /## Régler à l'œil : l'atelier/);
  assert.match(ref, /pulse-motion atelier/);
  assert.match(ref, /bouton \*\*Effets\*\*/);
  assert.match(ref, /« Enregistrer comme nouvel effet »/);
  const retoucher = lire('skills', 'retoucher', 'SKILL.md');
  assert.match(retoucher, /pulse-motion atelier/);
  assert.match(retoucher, /bouton « Effets »/);
});
