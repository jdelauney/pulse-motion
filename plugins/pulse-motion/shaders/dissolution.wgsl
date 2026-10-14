// Dissolution : un seuil qui monte avec le progrès découpe un bruit fractal ; liseré coloré à la frontière.
fn transition(coord: vec2f, progres: f32) -> vec4f {
  let uv = coord / iResolution.xy;
  let n = clamp(0.5 + 0.6 * fbm(vec3f(coord / R.grain, 3.7)), 0.0, 1.0);
  let seuil = progres * (1.0 + R.bord) - R.bord;
  let k = smoothstep(seuil, seuil + R.bord, n);
  let c = mix(canal1(uv), canal0(uv), k);
  let liseret = (1.0 - abs(2.0 * k - 1.0)) * step(0.001, progres) * step(progres, 0.999);
  return c + vec4f(R.couleur_bord.rgb * liseret * c.a, 0.0);
}
