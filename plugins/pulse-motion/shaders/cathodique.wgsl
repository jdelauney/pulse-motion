// Cathodique : vieille télé et cassette vidéo, en une passe (d'après core/post/crt.js de lemo-opuscar). Couleurs étalées
// à l'horizontale et rouge décalé, luminance nette ; lignes de balayage de 3 px, plus fines dans les clairs ; grille RVB ;
// coins assombris ; bruit de signal ; bande de bruit qui défile ; allumage du tube (un point, une ligne, puis l'image).
// Tout dépend de iTime (bruit tiré 30 fois par seconde) et de la position : même instant, même image.
fn cathoSRGB(c: vec3f) -> vec3f {
  let x = clamp(c, vec3f(0.0), vec3f(1.0));
  return select(1.055 * pow(x, vec3f(1.0 / 2.4)) - 0.055, x * 12.92, x <= vec3f(0.0031308));
}

fn cathoLineaire(c: vec3f) -> vec3f {
  let x = clamp(c, vec3f(0.0), vec3f(1.0));
  return select(pow((x + 0.055) / 1.055, vec3f(2.4)), x / 12.92, x <= vec3f(0.04045));
}

// Couleur de l'image en sRGB (non prémultipliée).
fn cathoLire(uv: vec2f) -> vec3f {
  let c = canal0(uv);
  if (c.a <= 1e-4) { return vec3f(0.0); }
  return cathoSRGB(c.rgb / c.a);
}

fn cathoVersYC(c: vec3f) -> vec3f {
  let y = dot(c, vec3f(0.299, 0.587, 0.114));
  return vec3f(y, (c.b - y) * 0.564, (c.r - y) * 0.713);
}

fn cathoDepuisYC(v: vec3f) -> vec3f {
  return vec3f(v.x + 1.403 * v.z, v.x - 0.344 * v.y - 0.714 * v.z, v.x + 1.773 * v.y);
}

fn post(coord: vec2f) -> vec4f {
  let uv = coord / iResolution.xy;
  let res = iResolution.zw;
  let px = uv * res;
  let tirage = floor(iTime * 30.0);
  let origine = canal0(uv);

  // Allumage : un point s'étire en ligne horizontale, puis la ligne s'ouvre en hauteur.
  var sx = 1.0;
  var sy = 1.0;
  var eclat = 0.0;
  if (R.allumage > 0.0) {
    let pw = clamp(iTime / R.allumage, 0.0, 1.0);
    if (pw < 1.0) {
      sx = smoothstep(0.0, 0.3, pw);
      sy = max(0.003, smoothstep(0.3, 1.0, pw));
      eclat = pow(1.0 - sy, 3.0);
    }
  }
  var q = vec2f(0.5 + (uv.x - 0.5) / max(sx, 0.001), 0.5 + (uv.y - 0.5) / sy);

  // Bande de bruit : déchirure de chaque ligne, bande qui défile de haut en bas, barre de commutation des têtes en bas.
  var bande = 0.0;
  if (R.bruit_bande > 0.0) {
    let hauteurBande = fract(iTime * 0.23 + 0.15);
    bande = smoothstep(0.07, 0.0, abs(uv.y - hauteurBande));
    let rang = floor(uv.y * res.y / 2.0);
    q.x += (alea2(vec2f(rang, tirage * 7.0)) - 0.5) * 0.012 * R.bruit_bande * (1.0 + bande * 5.0);
    q.x += bande * R.bruit_bande * 0.03 * sin(tirage * 3.0);
    q.y += (alea2(vec2f(tirage, 13.0)) - 0.5) * 0.004 * R.bruit_bande;
    if (uv.y > 0.95) { q.x += 0.03 * R.bruit_bande * (alea2(vec2f(floor(uv.y * res.y), tirage)) - 0.3); }
  }

  // Signal vidéo : luminance nette, couleur étalée sur « bavure » pixels, rouge décalé à droite.
  let pas = vec2f(1.0 / res.x, 0.0);
  let y = cathoVersYC(cathoLire(q)).x;
  var cb = 0.0;
  var cr = 0.0;
  var n = 0.0;
  for (var i = -4; i <= 4; i++) {
    let fi = f32(i);
    if (abs(fi) > R.bavure * 0.5) { continue; }
    cb += cathoVersYC(cathoLire(q + pas * fi)).y;
    cr += cathoVersYC(cathoLire(q + pas * (fi - R.decalage_rouge))).z;
    n += 1.0;
  }
  var c = clamp(cathoDepuisYC(vec3f(y, cb / n, cr / n)), vec3f(0.0), vec3f(1.0));
  if (q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0) { c = vec3f(0.0); }

  // Bruit du signal, et neige dans la bande.
  c += vec3f((alea2(px + vec2f(tirage * 17.0, tirage * 5.0)) - 0.5) * 0.018);
  if (R.bruit_bande > 0.0) {
    let neige = alea2(floor(px / vec2f(3.0, 2.0)) + vec2f(tirage * 31.0, 0.0));
    c = mix(c, vec3f(neige), bande * 0.75 * R.bruit_bande);
    c = mix(c, vec3f(dot(c, vec3f(0.33))), bande * 0.5 * R.bruit_bande);
  }

  // Lignes de balayage (période de 3 px), plus fines dans les clairs ; grille RVB en colonnes.
  let lum = dot(clamp(c, vec3f(0.0), vec3f(1.0)), vec3f(0.3, 0.59, 0.11));
  let phase = 0.5 - 0.5 * cos(6.2831853 * px.y / 3.0);
  c *= 1.0 - R.lignes * phase * (1.0 - 0.6 * lum);
  let colonne = u32(floor(px.x)) % 3u;
  var masque = vec3f(1.0 - R.grille);
  if (colonne == 0u) { masque.x = 1.0 + R.grille * 2.0; } else if (colonne == 1u) { masque.y = 1.0 + R.grille * 2.0; } else { masque.z = 1.0 + R.grille * 2.0; }
  c *= masque;

  // Coins assombris (sans bord noir d'écran bombé).
  let u2 = (uv - 0.5) * 2.0;
  c *= 1.0 - R.coins * (u2.x * u2.x * u2.y * u2.y * 2.0 + 0.25 * (u2.x * u2.x + u2.y * u2.y));

  // Allumage : image surexposée et trait lumineux au milieu.
  c = c * (1.0 + eclat * 1.5) + eclat * vec3f(0.85, 0.9, 1.0) * smoothstep(0.006, 0.0, abs(uv.y - 0.5)) * step(abs(uv.x - 0.5), sx * 0.5);
  c = clamp(c, vec3f(0.0), vec3f(1.0));

  // Force : mélange avec l'image d'origine (en sRGB) ; l'allumage rend l'écran opaque.
  let a = select(origine.a, 1.0, R.allumage > 0.0 && iTime < R.allumage);
  let base = select(vec3f(0.0), cathoSRGB(origine.rgb / max(origine.a, 1e-4)), origine.a > 1e-4);
  let sortie = mix(base, c, R.force);
  return vec4f(cathoLineaire(sortie) * a, a);
}
