// Iris : une forme à distance signée grandit depuis le centre (forme : 0 cercle, 1 losange, 2 étoile à 5 branches) ; dedans,
// la scène qui entre. Un anneau suit le bord (la couleur, sa version claire au milieu), précédé d'une ombre de sa version
// sombre ; l'anneau apparaît et s'efface aux deux bouts de la transition.
fn irisDistance(p: vec2f, s: f32, forme: f32) -> f32 {
  if (forme < 0.5) { return length(p) - s; }
  if (forme < 1.5) { return (abs(p.x) + abs(p.y)) * 0.70710678 - s; }
  return sdEtoile(vec2f(-p.y, p.x), max(s, 1e-3), 5.0, 0.5);
}

fn transition(coord: vec2f, progres: f32) -> vec4f {
  let uv = coord / iResolution.xy;
  let a = canal0(uv);
  let b = canal1(uv);
  let demi = iResolution.xy * 0.5;
  let p = coord - demi;
  let forme = round(R.forme);
  var smax = length(demi);
  if (forme >= 0.5 && forme < 1.5) { smax = (demi.x + demi.y) * 0.70710678; }
  if (forme >= 1.5) { smax = length(demi) * 2.0; }
  let w = 0.025 * iResolution.y;
  let e = progres * progres * (3.0 - 2.0 * progres);
  let s = e * (smax + 4.0 * w) - w;
  let d = irisDistance(p, s, forme);
  let apparition = smoothstep(0.0, 0.06, progres) * smoothstep(1.0, 0.94, progres);
  let anneau = smoothstep(w, 0.0, abs(d)) * apparition;
  let ombre = smoothstep(4.0 * w, w, d) * step(0.0, d) * apparition * 0.45;
  let base = select(a, b, d < 0.0);
  let couleur = R.couleur.rgb;
  let teinte = mix(couleur, teinteClaire(couleur), anneau * anneau);
  let assombri = mix(base.rgb, teinteSombre(couleur) * base.a, ombre);
  return vec4f(mix(assombri, teinte, anneau), max(base.a, anneau));
}
