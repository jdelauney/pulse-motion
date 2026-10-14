// Grain : hachage par cellule et par image de grain (vitesse fois par seconde de t), pondéré par la luminance.
fn post(coord: vec2f) -> vec4f {
  let c = canal0(coord / iResolution.xy);
  let image = floor(iTime * R.vitesse);
  let g = alea2(floor(coord / R.taille) + vec2f(image * 17.0, image * 31.0)) - 0.5;
  let lum = dot(c.rgb, vec3f(0.2126, 0.7152, 0.0722)) / max(c.a, 1e-4);
  let poids = 4.0 * lum * (1.0 - lum) + 0.25;
  return vec4f(max(c.rgb + vec3f(g * R.force * poids * c.a), vec3f(0.0)), c.a);
}
