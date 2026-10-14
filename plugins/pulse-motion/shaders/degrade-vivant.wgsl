// Dégradé vivant : dégradé linéaire dont l'axe oscille et dont le bord est légèrement troublé par du bruit.
fn image(coord: vec2f) -> vec4f {
  let uv = coord / iResolution.xy - 0.5;
  let a = radians(R.angle) + 0.4 * sin(iTime * R.vitesse * 6.2831853);
  let d = dot(uv, vec2f(cos(a), sin(a)));
  let o = 0.08 * bruit(vec3f(uv * 3.0, iTime * R.vitesse * 2.0));
  let k = smoothstep(-0.6, 0.6, d + o);
  return vec4f(mix(R.couleur1.rgb, R.couleur2.rgb, k), 1.0);
}
