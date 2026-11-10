/* Pulse Motion – comparer deux versions dans l'aperçu (spec Retouches et ergonomie, 5.10, point 2).
 *
 * Deux cadres : « / » (la vidéo actuelle, l'aperçu lui-même) et « /_pm/version/<n> » (la version d'avant, assemblée en
 * mémoire par l'aperçu, jamais écrite). Une seule barre de lecture pilote les deux par contentWindow.M.rendre(t) ; le son
 * vient de la version actuelle seulement (son lecteur joue, l'autre est seulement rendu à l'instant). Les barres propres
 * aux cadres sont masquées. Idée de take-one (review-room, setCmp : deux coupes synchronisées ; MIT), réécrite.
 */
const parametres = new URLSearchParams(location.search);
const avec = parametres.get('avec') || 'precedente';
const courante = document.getElementById('courante');
const avant = document.getElementById('avant');
const lecture = document.getElementById('lecture');
const position = document.getElementById('position');
const temps = document.getElementById('temps');
const message = document.getElementById('message');

const horodatage = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const moteur = (cadre) => (cadre.contentWindow && cadre.contentWindow.M) || null;

/** Masque la barre, le bandeau et les panneaux d'un cadre (la barre de cette page les remplace). */
function sansInterface(cadre) {
  const doc = cadre.contentDocument;
  if (!doc || doc.getElementById('pm-comparer-style')) return;
  const style = doc.createElement('style');
  style.id = 'pm-comparer-style';
  style.textContent = '#pm-lecteur, #pm-bandeau, #pm-remarques, #pm-reglages, #pm-pastille-ebauche, #pm-avancement { display: none !important; } body { --pm-barre: 0px !important; }';
  doc.head.appendChild(style);
}

function pret(cadre) {
  return new Promise((resolve) => {
    const verifier = () => {
      const M = moteur(cadre);
      if (M && M.pret) M.pret.then(() => { sansInterface(cadre); resolve(M); });
      else setTimeout(verifier, 50);
    };
    verifier();
  });
}

let enLecture = false;

function afficher(t) {
  position.value = String(t);
  const M = moteur(courante);
  temps.textContent = `${horodatage(t)} / ${horodatage(M ? M.duree : 0)}`;
}

/** Place les deux cadres au même instant. */
function aller(t) {
  const A = moteur(courante);
  const B = moteur(avant);
  if (A && A.lecteur) A.lecteur.aller(t); else if (A) A.rendre(t);
  if (B) B.rendre(Math.min(t, B.duree));
  afficher(t);
}

function boucle() {
  if (!enLecture) return;
  const A = moteur(courante);
  const B = moteur(avant);
  if (A && B) {
    const t = A.temps();
    if (Math.abs(B.temps() - t) > 1e-3) B.rendre(Math.min(t, B.duree));
    afficher(t);
    if (A.lecteur && !A.lecteur.enLecture()) { arreter(); return; }
  }
  requestAnimationFrame(boucle);
}

function arreter() {
  enLecture = false;
  lecture.textContent = '▶';
  lecture.setAttribute('aria-label', 'Lecture');
  const A = moteur(courante);
  if (A && A.lecteur) A.lecteur.pause();
}

lecture.addEventListener('click', () => {
  const A = moteur(courante);
  if (!A || !A.lecteur) return;
  if (enLecture) { arreter(); return; }
  enLecture = true;
  lecture.textContent = '⏸';
  lecture.setAttribute('aria-label', 'Pause');
  A.lecteur.jouer();
  requestAnimationFrame(boucle);
});
position.addEventListener('input', () => aller(parseFloat(position.value)));

async function demarrer() {
  courante.src = '/';
  // ?capture=1 : le lecteur de ce cadre ne prépare pas le son (il vient de la version actuelle seulement).
  avant.src = `/_pm/version/${encodeURIComponent(avec)}?capture=1`;
  try {
    const versions = (await (await fetch('/_pm/versions')).json()).versions || [];
    const v = versions.find((x) => x.numero === avec || Number(x.numero) === Number(avec)) || null;
    if (v) document.getElementById('legende-avant').textContent = v.nom ? `« ${v.nom} »` : v.phrase ? `Avant « ${v.phrase} »` : `Version ${v.numero}`;
  } catch { /* légende par défaut */ }
  const [A, B] = await Promise.all([pret(courante), pret(avant)]);
  position.max = String(Math.max(A.duree, B.duree));
  position.step = String(1 / (A.ips || 30));
  aller(A.temps());
  // La vidéo actuelle se recharge après une retouche : la barre la reprend au même instant.
  courante.addEventListener('load', () => pret(courante).then(() => aller(parseFloat(position.value))));
}

demarrer().catch((e) => { message.textContent = `La comparaison n'a pas pu s'ouvrir : ${e.message}`; message.hidden = false; });

/** Pour les essais. */
globalThis.__comparer = { aller, temps: () => [moteur(courante) && moteur(courante).temps(), moteur(avant) && moteur(avant).temps()] };
