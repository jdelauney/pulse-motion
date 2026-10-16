// Traînées lumineuses : des points de lumière suivent des courbes de Lissajous ; le tampon A garde leur sillage, qui
// s'efface à chaque pas (persistance). Couleurs RVB prémultipliées par la lumière.

fn pointLumineux(i: f32, t: f32) -> vec2f {
  return vec2f(0.5 + 0.38 * sin(t * (0.7 + 0.13 * i) + i * 1.7), 0.5 + 0.38 * sin(t * (0.9 + 0.11 * i) + i * 2.9));
}

fn passeA(coord: vec2f) -> vec4f {
  let uv = coord / iResolution.xy;
  var c = canal0(uv) * R.persistance;
  let rapport = iResolution.x / iResolution.y;
  let largeur = R.epaisseur * 0.01;
  for (var i = 0; i < 6; i++) {
    let fi = f32(i);
    if (fi >= R.nombre) { break; }
    let d = length((uv - pointLumineux(fi, iTime * R.vitesse)) * vec2f(rapport, 1.0));
    let lueur = exp(-d * d / (largeur * largeur));
    c += vec4f(mix(R.couleur1.rgb, R.couleur2.rgb, fi / 5.0) * lueur, lueur);
  }
  return min(c, vec4f(4.0));
}

fn image(coord: vec2f) -> vec4f {
  let c = canal0(coord / iResolution.xy);
  return vec4f(c.rgb, clamp(c.a, 0.0, 1.0));
}
