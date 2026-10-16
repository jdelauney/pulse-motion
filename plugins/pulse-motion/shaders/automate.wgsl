// Automate cellulaire (règle du jeu de la vie) : tampon A, r = cellule vivante (0 ou 1), g = mémoire des cellules
// disparues ; image : une case arrondie par cellule.

fn cellule(uv: vec2f, d: vec2f) -> f32 { return step(0.5, canal0(uv + d / iResolution.zw).r); }

fn passeA(coord: vec2f) -> vec4f {
  let uv = coord / iResolution.xy;
  if (iFrame == 0) {
    let n = alea2(floor(uv * iResolution.zw) + vec2f(R.graine * 17.0, 3.0));
    return vec4f(step(1.0 - R.densite, n), 0.0, 0.0, 1.0);
  }
  var voisines = 0.0;
  for (var y = -1; y <= 1; y++) {
    for (var x = -1; x <= 1; x++) {
      if (x != 0 || y != 0) { voisines += cellule(uv, vec2f(f32(x), f32(y))); }
    }
  }
  let vivante = cellule(uv, vec2f(0.0));
  let survit = select(0.0, 1.0, voisines == 2.0 || voisines == 3.0);
  let nait = select(0.0, 1.0, voisines == 3.0);
  let suite = select(nait, survit, vivante > 0.5);
  return vec4f(suite, max(suite, canal0(uv).g * 0.85), 0.0, 1.0);
}

fn image(coord: vec2f) -> vec4f {
  let taille = vec2f(textureDimensions(iChannel0));
  let g = coord / iResolution.xy * taille;
  let c = canal0((floor(g) + 0.5) / taille);
  let bord = 1.0 - smoothstep(0.35, 0.5, length(fract(g) - 0.5));
  let v = max(c.r, c.g * 0.5) * bord;
  return vec4f(R.couleur.rgb * v, v) * R.opacite;
}
