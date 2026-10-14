// Énergie sur le contour : intensité qui décroît avec la distance au bord de la boîte, modulée par des ondes qui tournent.
fn image(coord: vec2f) -> vec4f {
  let demi = iResolution.xy * 0.5;
  let p = coord - demi;
  let d = abs(sdBoite(p, demi));
  let a = atan2(p.y, p.x);
  let n = fbm(vec3f(a * 3.0, d * 0.3, iTime * R.vitesse));
  let flux = 0.5 + 0.5 * sin(a * 8.0 - iTime * R.vitesse * 6.0 + n * 4.0);
  let lueur = exp(-d / max(R.epaisseur, 1e-3)) * (0.4 + 0.6 * flux);
  return vec4f(R.couleur.rgb * lueur * R.eclat, clamp(lueur, 0.0, 1.0));
}
