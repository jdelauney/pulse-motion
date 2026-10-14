// Étoile : alpha d'une étoile à N branches (distance signée du prélude), bord adouci ; tourne avec la particule.
fn forme(uv: vec2f, p: Particule) -> f32 {
  let d = sdEtoile(uv, 0.95, R.branches, R.creux);
  return 1.0 - smoothstep(-R.douceur, R.douceur, d);
}
