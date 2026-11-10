// Fuite de lumière (d'après light-leak d'argo) : un éclair qui monte en triangle (au carré) jusqu'à mi-parcours, teinté de
// la version claire de la couleur ; sous l'éclair, la scène qui sort cède la place à celle qui entre sur 2 × douceur.
fn transition(coord: vec2f, progres: f32) -> vec4f {
  let uv = coord / iResolution.xy;
  let a = canal0(uv);
  let b = canal1(uv);
  let triangle = 1.0 - abs(progres - 0.5) * 2.0;
  let eclair = triangle * triangle * 0.9;
  let m = mix(a, b, smoothstep(0.5 - R.douceur, 0.5 + R.douceur, progres));
  let chaud = teinteClaire(R.couleur.rgb);
  return vec4f(mix(m.rgb, chaud, eclair), mix(m.a, 1.0, eclair));
}
