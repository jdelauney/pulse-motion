// Rayons : faisceaux angulaires autour d'un point de la zone, adoucis par du bruit, qui s'éteignent avec la distance.
fn image(coord: vec2f) -> vec4f {
  let c = vec2f(R.centre_x, R.centre_y) * iResolution.xy;
  let d = coord - c;
  let a = atan2(d.y, d.x) + iTime * R.vitesse;
  let r = 0.5 + 0.5 * cos(a * R.nombre);
  let doux = pow(r, 6.0) * (0.7 + 0.3 * bruit(vec3f(a * 3.0, 0.0, iTime * 0.3)));
  let fondu = exp(-length(d) / (0.6 * iResolution.y));
  let v = clamp(doux * fondu * R.intensite, 0.0, 1.0);
  return vec4f(R.couleur.rgb * v, v);
}
