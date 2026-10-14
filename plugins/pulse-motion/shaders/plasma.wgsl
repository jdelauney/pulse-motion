// Plasma : somme d'ondes sinusoïdales croisées, teintes d'une palette cosinus autour d'une couleur de la charte.
fn image(coord: vec2f) -> vec4f {
  let p = coord / R.echelle;
  let t = iTime * R.vitesse;
  var v = sin(p.x + t) + sin(p.y * 1.3 - t * 0.7) + sin((p.x + p.y) * 0.7 + t * 1.3);
  v += sin(length(p - iResolution.xy / R.echelle * 0.5) * 1.5 - t);
  let k = 0.5 + 0.5 * sin(v * R.contraste);
  let c = palette(k, R.couleur.rgb, vec3f(0.35), vec3f(1.0), vec3f(0.0, 0.33, 0.67));
  return vec4f(clamp(c, vec3f(0.0), vec3f(1.0)), 1.0);
}
