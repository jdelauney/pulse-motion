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
const COMMANDES = ['etat', 'assembler', 'controler', 'apercu', 'historique', 'reference', 'scene', 'styles', 'consignes', 'exporter', 'planche', 'effet', 'comparer', 'changer-style', 'lexique', 'charte', 'police', 'glossaire', 'style'];
const fichiersGuides = () => [
  ...SKILLS.map((s) => path.join('skills', s, 'SKILL.md')),
  ...fs.readdirSync(path.join(RACINE, 'agents')).map((a) => path.join('agents', a)),
];

test('skills : creer, exporter, retoucher, reprendre, lancés par la personne, outils limités', () => {
  assert.deepEqual(SKILLS.sort(), ['creer', 'exporter', 'reprendre', 'retoucher', 'style']);
  for (const s of SKILLS) {
    const e = enTete(lire('skills', s, 'SKILL.md'));
    assert.ok(e.description && e.description.length > 20, `${s} : description`);
    assert.equal(e['disable-model-invocation'], 'true', `${s} : lancé par la personne seulement`);
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
  for (const f of ['moteur.md', 'rythme.md', ...styles.map((st) => path.join('styles', `${st}.md`))]) {
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
