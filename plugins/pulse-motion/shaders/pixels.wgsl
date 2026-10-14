// Pixels : échantillonnage par cellules dont la taille croît jusqu'à mi-parcours puis décroît ; bascule de scène au milieu.
fn transition(coord: vec2f, progres: f32) -> vec4f {
  let k = 1.0 - abs(2.0 * progres - 1.0);
  let taille = max(R.taille_max * k * k, 0.05);
  let cellule = (floor(coord / taille) + 0.5) * taille;
  let uv = cellule / iResolution.xy;
  return select(canal0(uv), canal1(uv), progres >= 0.5);
}
