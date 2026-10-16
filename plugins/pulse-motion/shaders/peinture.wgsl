// Peinture : trois pinceaux invisibles déposent leur couleur (tampon A : RVB non prémultiplié, alpha = couverture), que
// le courant (rotationnel d'un bruit) étire en volutes.

fn passeA(coord: vec2f) -> vec4f {
  let uv = coord / iResolution.xy;
  let flux = curl(uv * R.echelle, iTime * 0.1) * 0.0008 * R.courant;
  var c = canal0(uv - flux);
  c = vec4f(c.rgb, c.a * 0.998);
  let rapport = iResolution.x / iResolution.y;
  for (var i = 0; i < 3; i++) {
    let fi = f32(i);
    let p = vec2f(0.5 + 0.4 * sin(iTime * (0.31 + 0.07 * fi) + fi * 2.1), 0.5 + 0.35 * cos(iTime * (0.23 + 0.05 * fi) + fi * 1.3));
    let d = length((uv - p) * vec2f(rapport, 1.0));
    let k = 1.0 - smoothstep(0.0, R.pinceau * 0.01, d);
    let teinte = select(select(R.couleur3, R.couleur2, i == 1), R.couleur1, i == 0);
    c = mix(c, vec4f(teinte.rgb, 1.0), k * 0.6);
  }
  return c;
}

fn image(coord: vec2f) -> vec4f {
  let c = canal0(coord / iResolution.xy);
  let a = clamp(c.a, 0.0, 1.0);
  return vec4f(c.rgb * a, a);
}
