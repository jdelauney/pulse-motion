// Chaleur : déplacement de l'image par un bruit qui évolue avec t, nul au-dessus de « haut », maximal en bas.
fn post(coord: vec2f) -> vec4f {
  let uv = coord / iResolution.xy;
  let poids = smoothstep(R.haut, 1.0, uv.y);
  let t = iTime * R.vitesse;
  let q = coord / R.echelle;
  let n = vec2f(bruit(vec3f(q, t)), bruit(vec3f(q + vec2f(11.0, 5.0), t)));
  return canal0(uv + n * R.force * poids / iResolution.xy);
}
