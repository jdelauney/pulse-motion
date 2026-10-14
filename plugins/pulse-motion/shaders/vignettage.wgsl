// Vignettage : mélange vers une couleur selon la distance au centre (corrigée du format de l'image).
fn post(coord: vec2f) -> vec4f {
  let uv = coord / iResolution.xy;
  let c = canal0(uv);
  let p = (uv - 0.5) * vec2f(iResolution.x / iResolution.y, 1.0);
  let d = length(p) * 1.4142;
  let v = 1.0 - smoothstep(R.rayon - R.douceur, R.rayon, d);
  let k = mix(1.0 - R.force, 1.0, v);
  return vec4f(mix(R.couleur.rgb * c.a, c.rgb, k), c.a);
}
