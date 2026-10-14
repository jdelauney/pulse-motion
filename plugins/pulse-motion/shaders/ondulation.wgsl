// Ondulation : décalage radial sinusoïdal depuis le centre, d'amplitude maximale à mi-parcours ; fondu entre les scènes.
fn transition(coord: vec2f, progres: f32) -> vec4f {
  let centre = iResolution.xy * 0.5;
  let d = coord - centre;
  let r = length(d);
  let force = sin(progres * 3.14159265) * R.amplitude;
  let onde = sin(r * R.frequence - iTime * R.vitesse) * force;
  let dir = select(vec2f(0.0), d / max(r, 1e-3), r > 1e-3);
  let uv = (coord + dir * onde) / iResolution.xy;
  return mix(canal0(uv), canal1(uv), smoothstep(0.35, 0.65, progres));
}
