// Glitch : chaque bande horizontale tire (hachage de son rang et de l'image) un décalage et l'instant où elle bascule.
fn transition(coord: vec2f, progres: f32) -> vec4f {
  let k = 1.0 - abs(2.0 * progres - 1.0);
  let bande = floor(coord.y / iResolution.y * R.bandes);
  let h = alea2(vec2f(bande, floor(iTime * 24.0)));
  let actif = step(0.5, alea2(vec2f(bande, 7.0 + floor(iTime * 12.0))));
  let decal = (h - 0.5) * R.force * k * actif;
  let uv = (coord + vec2f(decal, 0.0)) / iResolution.xy;
  let e = vec2f(R.force * 0.15 * k, 0.0) / iResolution.xy;
  let entree = alea2(vec2f(bande, 3.0)) < progres;
  let r = select(canal0(uv + e), canal1(uv + e), entree);
  let g = select(canal0(uv), canal1(uv), entree);
  let b = select(canal0(uv - e), canal1(uv - e), entree);
  return vec4f(r.r, g.g, b.b, g.a);
}
