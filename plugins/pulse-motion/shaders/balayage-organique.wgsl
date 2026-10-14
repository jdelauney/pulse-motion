// Balayage organique : front linéaire selon un angle, déformé par du bruit fractal, qui avance avec le progrès.
fn transition(coord: vec2f, progres: f32) -> vec4f {
  let uv = coord / iResolution.xy;
  let a = radians(R.angle);
  let x = dot(uv - 0.5, vec2f(cos(a), sin(a))) * 1.4142 + 0.5;
  let n = 0.15 * fbm(vec3f(coord / R.echelle, 1.3));
  let front = progres * (1.0 + 2.0 * R.douceur + 0.9) - R.douceur - 0.45;
  let k = smoothstep(front - R.douceur, front + R.douceur, x + n);
  return mix(canal1(uv), canal0(uv), k);
}
