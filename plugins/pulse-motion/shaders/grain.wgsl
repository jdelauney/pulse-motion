// Grain : hachage par cellule et par image de grain (vitesse fois par seconde de t), ajouté en sRGB (perceptuel), plus
// visible dans les tons moyens. L'amplitude ne dépasse pas l'écart au noir ou au blanc : les noirs restent noirs.
fn grainVersSRGB(c: vec3f) -> vec3f {
  return select(1.055 * pow(c, vec3f(1.0 / 2.4)) - 0.055, c * 12.92, c <= vec3f(0.0031308));
}

fn grainVersLineaire(c: vec3f) -> vec3f {
  return select(pow((c + 0.055) / 1.055, vec3f(2.4)), c / 12.92, c <= vec3f(0.04045));
}

fn post(coord: vec2f) -> vec4f {
  let c = canal0(coord / iResolution.xy);
  if (c.a <= 1e-4) { return c; }
  let lin = max(c.rgb / c.a, vec3f(0.0));
  let base = min(lin, vec3f(1.0));
  let s = grainVersSRGB(base);
  let image = floor(iTime * R.vitesse);
  let g = alea2(floor(coord / R.taille) + vec2f(image * 17.0, image * 31.0)) - 0.5;
  let lum = dot(s, vec3f(0.2126, 0.7152, 0.0722));
  let poids = 4.0 * lum * (1.0 - lum) + 0.25;
  // g dans [-0,5 ; 0,5] : une amplitude au plus 2 × min(lum, 1 − lum) ne sort pas de [0, 1] (moyenne conservée).
  let amplitude = min(R.force * poids, 2.0 * min(lum, 1.0 - lum));
  let sortie = clamp(s + vec3f(g * amplitude), vec3f(0.0), vec3f(1.0));
  // Au-dessus de 1 (halo), l'excédent est gardé tel quel.
  return vec4f((lin - base + grainVersLineaire(sortie)) * c.a, c.a);
}
