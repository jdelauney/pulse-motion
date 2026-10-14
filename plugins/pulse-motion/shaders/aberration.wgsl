// Aberration chromatique : rouge et bleu lus de part et d'autre du vert, d'un écart (cqh) qui croît vers les bords.
fn post(coord: vec2f) -> vec4f {
  let uv = coord / iResolution.xy;
  let d = 2.0 * (uv - 0.5);
  let o = d * length(d) * 0.5 * R.ecart / iResolution.xy;
  let r = canal0(uv + o);
  let g = canal0(uv);
  let b = canal0(uv - o);
  return vec4f(r.r, g.g, b.b, max(g.a, max(r.a, b.a)));
}
