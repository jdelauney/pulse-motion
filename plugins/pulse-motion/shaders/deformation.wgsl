// Déformation : un bruit fractal replié deux fois sur lui-même (fbm de fbm, échelle en cqh) donne un champ de déplacement ;
// il pousse la scène qui sort d'un côté et celle qui entre de l'autre, au plus fort à mi-parcours, et sa forme décide où
// chaque point bascule. Les veines du champ prennent la couleur, de sa version sombre à sa version claire.
fn transition(coord: vec2f, progres: f32) -> vec4f {
  let uv = coord / iResolution.xy;
  let k = sin(3.14159265 * progres);
  let q = coord / R.echelle;
  let lent = iTime * 0.3;
  let w1 = vec2f(fbm(vec3f(q, 1.0 + lent)), fbm(vec3f(q + vec2f(5.2, 1.3), 2.0 + lent)));
  let w2 = vec2f(fbm(vec3f(q + 4.0 * w1, 3.0)), fbm(vec3f(q + 4.0 * w1 + vec2f(1.7, 9.2), 4.0)));
  let decal = w2 * k * 0.12;
  let a = canal0(uv + decal);
  let b = canal1(uv - decal);
  let c = mix(a, b, smoothstep(0.35, 0.65, progres + 0.25 * w2.x));
  let veine = smoothstep(0.15, 0.55, length(w2)) * k * 0.6;
  let couleur = R.couleur.rgb;
  let teinte = mix(teinteSombre(couleur), teinteClaire(couleur), clamp(0.5 + w2.y, 0.0, 1.0));
  return vec4f(mix(c.rgb, teinte * c.a, veine), c.a);
}
