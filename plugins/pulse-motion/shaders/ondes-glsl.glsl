// Ondes sur l'eau : équation des ondes discrète (tampon A : r = hauteur, g = hauteur au pas précédent), une goutte à
// chaque intervalle à un endroit tiré de son numéro ; image : reflet selon la pente de la surface, sur une eau sombre
// (« fond » de la charte, teintée de « primaire ») ; opacite : fragColor.a.

float hasard(float n) { return fract(sin(n * 127.1) * 43758.5453); }

void passeA(out vec4 c, in vec2 p) {
  vec2 px = 1.0 / iResolution.xy;
  vec2 uv = p * px;
  vec4 e = texture(iChannel0, uv);
  float voisins = texture(iChannel0, uv + vec2(px.x, 0.0)).r + texture(iChannel0, uv - vec2(px.x, 0.0)).r
    + texture(iChannel0, uv + vec2(0.0, px.y)).r + texture(iChannel0, uv - vec2(0.0, px.y)).r;
  float h = (voisins * 0.5 - e.g) * R_amortissement;
  float n = floor(iTime / R_intervalle);
  if (n != floor((iTime - iTimeDelta) / R_intervalle)) {
    vec2 centre = vec2(hasard(n), hasard(n + 17.0)) * 0.8 + 0.1;
    float d = length((uv - centre) * vec2(iResolution.x / iResolution.y, 1.0));
    h += R_force * (1.0 - smoothstep(0.0, 0.03, d));
  }
  c = vec4(h, e.r, 0.0, 1.0);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  vec2 px = 1.0 / iChannelResolution[0].xy;
  float dx = texture(iChannel0, uv + vec2(px.x, 0.0)).r - texture(iChannel0, uv - vec2(px.x, 0.0)).r;
  float dy = texture(iChannel0, uv + vec2(0.0, px.y)).r - texture(iChannel0, uv - vec2(0.0, px.y)).r;
  vec3 normale = normalize(vec3(-dx, -dy, 0.08));
  float lumiere = clamp(dot(normale, normalize(vec3(-0.4, 0.6, 0.7))), 0.0, 1.0);
  // Eau : la couleur « fond » de la charte, un peu teintée (un texte posé dessus reste lisible) ; reflets selon la pente.
  vec3 eau = mix(R_profondeur.rgb, R_teinte.rgb, R_melange);
  fragColor = vec4(mix(eau, R_reflet.rgb, pow(lumiere, 6.0)), R_opacite);
}
