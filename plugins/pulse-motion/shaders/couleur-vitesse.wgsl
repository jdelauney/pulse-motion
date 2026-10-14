// Couleur selon la vitesse : mélange de deux couleurs selon |v| / vitesse_max ; l'alpha de la table de vie est gardé.
fn couleur(p: Particule, u: f32, base: vec4f) -> vec4f {
  let k = clamp(length(p.vel) / R.vitesse_max, 0.0, 1.0);
  return vec4f(mix(R.lent.rgb, R.rapide.rgb, k), base.a);
}
