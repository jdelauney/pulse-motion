// Brûlure : un bruit en crêtes (1 − |fbm|) fixe l'ordre où chaque point brûle ; le seuil monte avec le progrès. Du côté
// intact, le bord chauffe de la couleur à sa version claire ; du côté brûlé, une cendre de la version sombre s'efface sur la
// scène qui entre. Étincelles : cellules tirées au hasard près du front, renouvelées 12 fois par seconde.
fn transition(coord: vec2f, progres: f32) -> vec4f {
  let uv = coord / iResolution.xy;
  let a = canal0(uv);
  let b = canal1(uv);
  let cretes = 1.0 - abs(fbm(vec3f(coord / R.grain, 2.1)));
  let n = clamp((cretes - 0.3) / 0.7, 0.0, 1.0);
  let bord = 0.08;
  let seuil = progres * (1.0 + 2.0 * bord) - bord;
  let d = n - seuil;
  let couleur = R.couleur.rgb;
  var c: vec4f;
  if (d >= 0.0) {
    // Intact : le bord chauffe à l'approche du front.
    let k = clamp(1.0 - d / bord, 0.0, 1.0);
    let chaleur = mix(couleur, teinteClaire(couleur), k);
    c = vec4f(mix(a.rgb, chaleur * a.a, k * k), a.a);
  } else {
    // Brûlé : cendre sombre juste derrière le front.
    let w = clamp(1.0 + d / bord, 0.0, 1.0);
    c = vec4f(mix(b.rgb, teinteSombre(couleur) * b.a, w * w), b.a);
  }
  // Étincelles : une cellule sur quelques-unes, près du front, pendant la transition seulement.
  let taille = 1.2;
  let cellule = floor(coord / taille);
  let tirage = floor(iTime * 12.0);
  let h = alea2(cellule + vec2f(tirage * 13.0, tirage * 7.0));
  let pres = smoothstep(bord * 3.0, 0.0, abs(d));
  let centre = (cellule + vec2f(0.25 + 0.5 * alea2(cellule + vec2f(5.0, tirage)), 0.25 + 0.5 * alea2(cellule + vec2f(tirage, 9.0)))) * taille;
  let tache = smoothstep(taille * 0.35, 0.0, length(coord - centre));
  let actif = step(1.0 - R.etincelles * 0.18, h) * step(0.001, progres) * step(progres, 0.999);
  let etincelle = actif * pres * tache;
  return vec4f(mix(c.rgb, teinteClaire(couleur), etincelle), max(c.a, etincelle));
}
