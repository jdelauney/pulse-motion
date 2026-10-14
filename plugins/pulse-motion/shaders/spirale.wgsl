// Spirale : accélération tangentielle autour du centre de la zone (sens direct à l'écran), plus un rappel vers ce centre.
fn force(p: Particule, t: f32, zone: vec4f) -> vec2f {
  let c = zone.xy + zone.zw * 0.5;
  let d = p.pos - c;
  let r = max(length(d), 0.5);
  let tangente = vec2f(-d.y, d.x) / r;
  return tangente * R.tours * 40.0 - d * R.attraction * 4.0;
}
