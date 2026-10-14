// Grille néon : lignes d'un plan vu en perspective sous l'horizon, qui défilent avec le temps ; lueur au-dessus de l'horizon.
fn image(coord: vec2f) -> vec4f {
  let uv = coord / iResolution.xy;
  let horizon = 0.45;
  if (uv.y < horizon) {
    let lueur = exp(-(horizon - uv.y) * 30.0) * 0.6;
    return vec4f(R.couleur.rgb * lueur, lueur);
  }
  let prof = (uv.y - horizon) / (1.0 - horizon);
  let z = 1.0 / max(prof, 1e-3);
  let x = (uv.x - 0.5) * z * iResolution.x / R.pas;
  let y = z * 100.0 / R.pas + iTime * R.vitesse * 4.0;
  let largeur = 0.04 * z;
  let lx = 1.0 - smoothstep(0.0, largeur, abs(fract(x) - 0.5));
  let ly = 1.0 - smoothstep(0.0, largeur, abs(fract(y) - 0.5));
  let a = clamp(max(lx, ly) * prof * 1.5, 0.0, 1.0);
  return vec4f(R.couleur.rgb * a * R.eclat, a);
}
