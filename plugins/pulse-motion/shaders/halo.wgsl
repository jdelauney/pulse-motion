// Halo : lueur qui décroît avec la distance à la boîte de l'élément, et respire doucement.
fn image(coord: vec2f) -> vec4f {
  let demi = iResolution.xy * 0.5;
  let d = max(sdBoite(coord - demi, demi), 0.0);
  let souffle = 1.0 + 0.15 * sin(iTime * 6.2831853 * R.pulsation);
  let v = exp(-d / max(R.rayon * souffle, 1e-3)) * R.intensite;
  return vec4f(R.couleur.rgb * v, clamp(v, 0.0, 1.0));
}
