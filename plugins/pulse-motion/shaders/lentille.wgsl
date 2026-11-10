// Lentille : chaque point regarde vers le centre, d'autant plus qu'il en est proche (déviation en rayon² / distance) :
// au-delà, l'image se retourne en anneau. La force monte en sinus jusqu'à mi-parcours puis retombe ; la scène qui entre
// remplace celle qui sort entre 45 et 55 % ; un cœur sombre grandit au centre avec la force.
fn transition(coord: vec2f, progres: f32) -> vec4f {
  let centre = iResolution.xy * 0.5;
  let p = coord - centre;
  let r = max(length(p), 1e-3);
  let k = sin(3.14159265 * progres);
  let rs = R.rayon * iResolution.y;
  let deviation = R.force * k * rs * rs / (r + 0.25 * rs);
  let uv = (centre + p * (1.0 - deviation / r)) / iResolution.xy;
  let c = mix(canal0(uv), canal1(uv), smoothstep(0.45, 0.55, progres));
  let coeur = max(0.2 * rs * k * min(R.force, 1.5), 1e-3);
  let ombre = smoothstep(coeur * 0.6, coeur, r);
  return vec4f(c.rgb * ombre, c.a);
}
