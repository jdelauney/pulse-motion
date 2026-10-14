// Nébuleuse : nuages de bruit fractal déformés par eux-mêmes, qui dérivent lentement, en deux couleurs.
fn image(coord: vec2f) -> vec4f {
  let p = coord / R.echelle;
  let t = iTime * R.vitesse;
  let q = vec2f(fbm(vec3f(p, t * 0.3)), fbm(vec3f(p + vec2f(5.2, 1.3), t * 0.3)));
  let n = fbm(vec3f(p + 1.8 * q, t * 0.5));
  let m = clamp(0.5 + 0.5 * n, 0.0, 1.0);
  let teinte = mix(R.couleur1.rgb, R.couleur2.rgb, smoothstep(0.3, 0.8, m + 0.3 * q.x));
  let a = clamp(pow(m, 1.5) * R.densite, 0.0, 1.0);
  return vec4f(teinte * a, a);
}
