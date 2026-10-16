// Réaction-diffusion de Gray-Scott : deux substances se nourrissent et se détruisent, dessinant taches et coraux.
// Tampon A : r = substance U, g = substance V. Image : V entre couleur1 et couleur2.

fn graine(uv: vec2f) -> f32 {
  let grille = vec2f(9.0, 5.0);
  let cellule = floor(uv * grille);
  let centre = (cellule + vec2f(0.5) + (vec2f(alea2(cellule), alea2(cellule + vec2f(7.0, 3.0))) - 0.5) * 0.6) / grille;
  let d = length((uv - centre) * vec2f(iResolution.x / iResolution.y, 1.0));
  return select(0.0, 1.0, d < 0.025 && alea2(cellule + vec2f(13.0, 1.0)) < 0.6);
}

fn passeA(coord: vec2f) -> vec4f {
  let uv = coord / iResolution.xy;
  if (iFrame == 0) { return vec4f(1.0, graine(uv), 0.0, 1.0); }
  let px = 1.0 / iResolution.zw;
  let c = canal0(uv).rg;
  var lap = -c;
  lap += 0.2 * (canal0(uv + vec2f(px.x, 0.0)).rg + canal0(uv - vec2f(px.x, 0.0)).rg + canal0(uv + vec2f(0.0, px.y)).rg + canal0(uv - vec2f(0.0, px.y)).rg);
  lap += 0.05 * (canal0(uv + px).rg + canal0(uv - px).rg + canal0(uv + vec2f(px.x, -px.y)).rg + canal0(uv + vec2f(-px.x, px.y)).rg);
  let u = c.x;
  let v = c.y;
  let r = u * v * v;
  let du = lap.x - r + R.alimentation * (1.0 - u);
  let dv = 0.5 * lap.y + r - (R.alimentation + R.destruction) * v;
  return vec4f(clamp(u + du, 0.0, 1.0), clamp(v + dv, 0.0, 1.0), 0.0, 1.0);
}

fn image(coord: vec2f) -> vec4f {
  let v = clamp(canal0(coord / iResolution.xy).g * 2.5, 0.0, 1.0);
  let c = mix(R.couleur1.rgb, R.couleur2.rgb, smoothstep(0.1, 0.9, v));
  return vec4f(c, 1.0) * R.opacite;
}
