'use strict';
/* Pulse Motion – formules (spec S7, 5.10) : TeX simple -> MathML natif, à l'assemblage. Chrome affiche MathML Core ; le
 * contrôle, l'export et l'accessibilité le lisent comme du texte. Aucune bibliothèque : un convertisseur court pour le
 * sous-ensemble utile à une formation.
 *
 *   scenes[].formules.aire = "\\pi r^2"        <span data-formule="aire" data-start="…"></span>
 *
 * convertir(tex) -> { mathml, erreurs: [messages] } ; mathml : <math display="inline" alttext="…">…</math>.
 * Sous-ensemble : lettres (italiques), chiffres (virgule décimale : « 3,5 » ou « 3.5 »), + − × ÷ = ≠ ≈ < > ≤ ≥ ±, * (×),
 *   \frac (\dfrac, \tfrac), ^, _, \sqrt et \sqrt[n], \sum, \prod, \int, \lim (bornes par _ et ^), \to, \infty, lettres
 *   grecques (\alpha … \omega, \Gamma … \Omega), \cdot, \times, \div, \pm, \neq, \leq, \geq, \approx (et \ne, \le, \ge),
 *   \left( … \right) (parenthèses, crochets, \{ \}, |, .), \text{…}, \%, \overline, \vec, \sin, \cos, \tan, \log, \ln,
 *   \exp, espaces \, \; \: \quad, \ldots, \cdots, parenthèses et crochets.
 * Hors du sous-ensemble : un message (règle formule-non-prise-en-charge) qui nomme la commande et propose une forme permise.
 * Évaluation à partir de src/math.js d'explainroo (MathJax écarté) ; code neuf.
 */
const P = require('../../moteur/proches.js');

const GRECQUES = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ϵ', varepsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ', vartheta: 'ϑ',
  iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', varpi: 'ϖ', rho: 'ρ', sigma: 'σ', tau: 'τ',
  upsilon: 'υ', phi: 'ϕ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Upsilon: 'Υ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
};
const OPERATEURS = { to: '→', infty: '∞', cdot: '·', times: '×', div: '÷', pm: '±', mp: '∓', neq: '≠', ne: '≠', leq: '≤', le: '≤',
  geq: '≥', ge: '≥', approx: '≈', ldots: '…', cdots: '⋯', '%': '%', '{': '{', '}': '}' };
const GRANDS = { sum: '∑', prod: '∏', int: '∫' };
const FONCTIONS = ['sin', 'cos', 'tan', 'log', 'ln', 'exp', 'lim'];
const ESPACES = { ',': '0.17em', ';': '0.28em', ':': '0.22em', quad: '1em', qquad: '2em', ' ': '0.25em' };
const AVEC_ARGUMENT = ['frac', 'dfrac', 'tfrac', 'sqrt', 'text', 'overline', 'vec', 'left', 'right'];
const CONNUES = [...Object.keys(GRECQUES), ...Object.keys(OPERATEURS).filter((k) => /^[a-z]+$/i.test(k)), ...Object.keys(GRANDS),
  ...FONCTIONS, ...AVEC_ARGUMENT, 'quad', 'qquad'];
const SIMPLES = { '-': '−', '−': '−', '+': '+', '=': '=', '<': '&lt;', '>': '&gt;', '*': '×', '×': '×', '÷': '÷', '≠': '≠', '≈': '≈',
  '≤': '≤', '≥': '≥', '±': '±', '/': '/', ',': ',', ';': ';', '(': '(', ')': ')', '[': '[', ']': ']', '|': '|', '!': '!', "'": '′', ':': ':', '→': '→', '∞': '∞', '·': '·' };
const DELIMITEURS = { '(': '(', ')': ')', '[': '[', ']': ']', '\\{': '{', '\\}': '}', '|': '|', '.': '' };

const echapper = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function lexemes(tex) {
  const r = [];
  let i = 0;
  const s = String(tex);
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '\\') {
      // \text{…} : le texte tel quel, espaces compris, jusqu'à l'accolade fermante.
      const tx = /^\\text\s*\{/.exec(s.slice(i));
      if (tx) {
        let j = i + tx[0].length, prof = 1, txt = '';
        while (j < s.length) {
          if (s[j] === '\\' && /[{}%]/.test(s[j + 1] || '')) { txt += s[j + 1]; j += 2; continue; }
          if (s[j] === '{') prof++;
          if (s[j] === '}') { prof--; if (!prof) break; }
          txt += s[j++];
        }
        r.push(prof ? { t: 'commande', v: 'text' } : { t: 'texte', v: txt });
        i = prof ? s.length : j + 1;
        continue;
      }
      const m = /^\\([A-Za-z]+|.)/.exec(s.slice(i));
      if (!m) { r.push({ t: 'commande', v: '' }); i++; continue; }
      r.push({ t: 'commande', v: m[1] });
      i += m[0].length;
      continue;
    }
    const n = /^\d+(?:[.,]\d+)?/.exec(s.slice(i));
    if (n) { r.push({ t: 'nombre', v: n[0].replace('.', ',') }); i += n[0].length; continue; }
    if (/\p{L}/u.test(c)) { r.push({ t: 'lettre', v: c }); i++; continue; }
    r.push({ t: 'signe', v: c });
    i++;
  }
  return r;
}

function convertir(tex) {
  const erreurs = [];
  const toks = lexemes(tex);
  let k = 0;
  const fin = () => k >= toks.length;
  const voir = () => toks[k];
  const erreur = (m) => { if (!erreurs.includes(m)) erreurs.push(m); };
  const proposer = (nom) => {
    const p = P.proches(nom, CONNUES).map((x) => `\\${x}`);
    return p.length ? P.phrase(p) : 'pour un mot, écrire \\text{…} ; les commandes permises sont listées dans la référence « explication »';
  };

  function groupe() {
    // { … } ; sinon un seul élément.
    const t = voir();
    if (!t) { erreur('il manque un argument à la fin de la formule.'); return '<mrow></mrow>'; }
    if (t.t === 'signe' && t.v === '{') {
      k++;
      const r = suite('}');
      if (voir() && voir().v === '}') k++; else erreur('accolade « { » non fermée.');
      return r.length === 1 ? r[0] : `<mrow>${r.join('')}</mrow>`;
    }
    return atome(true) || '<mrow></mrow>';
  }

  function delimiteur() {
    const t = toks[k++];
    if (!t) { erreur('\\left ou \\right sans délimiteur : \\left( … \\right).'); return ''; }
    const cle = t.t === 'commande' ? `\\${t.v}` : t.v;
    if (!Object.hasOwn(DELIMITEURS, cle)) { erreur(`délimiteur « ${cle} » non pris en charge après \\left ou \\right (permis : ( ) [ ] \\{ \\} | .).`); return ''; }
    return DELIMITEURS[cle];
  }

  function commande(t) {
    const v = t.v;
    if (Object.hasOwn(GRECQUES, v)) return `<mi>${GRECQUES[v]}</mi>`;
    if (Object.hasOwn(OPERATEURS, v)) return v === '%' ? '<mo>%</mo>' : `<mo>${OPERATEURS[v]}</mo>`;
    if (Object.hasOwn(ESPACES, v)) return `<mspace width="${ESPACES[v]}"></mspace>`;
    if (Object.hasOwn(GRANDS, v)) return `<mo largeop="true">${GRANDS[v]}</mo>`;
    if (FONCTIONS.includes(v)) return v === 'lim' ? '<mo movablelimits="true">lim</mo>' : `<mi>${v}</mi>`;
    if (v === 'frac' || v === 'dfrac' || v === 'tfrac') return `<mfrac>${groupe()}${groupe()}</mfrac>`;
    if (v === 'sqrt') {
      if (voir() && voir().t === 'signe' && voir().v === '[') {
        k++;
        const ordre = suite(']');
        if (voir() && voir().v === ']') k++; else erreur('crochet « [ » non fermé après \\sqrt.');
        return `<mroot>${groupe()}${ordre.length === 1 ? ordre[0] : `<mrow>${ordre.join('')}</mrow>`}</mroot>`;
      }
      return `<msqrt>${groupe()}</msqrt>`;
    }
    if (v === 'text') { erreur('\\text attend un texte entre accolades : \\text{par an}.'); return '<mtext></mtext>'; }
    if (v === 'overline') return `<mover>${groupe()}<mo>‾</mo></mover>`;
    if (v === 'vec') return `<mover>${groupe()}<mo>→</mo></mover>`;
    if (v === 'left') {
      const ouvre = delimiteur();
      const corps = suite('\\right');
      let ferme = '';
      if (voir() && voir().t === 'commande' && voir().v === 'right') { k++; ferme = delimiteur(); } else erreur('\\left sans \\right : écrire \\left( … \\right).');
      return `<mrow>${ouvre ? `<mo stretchy="true">${echapper(ouvre)}</mo>` : ''}${corps.join('')}${ferme ? `<mo stretchy="true">${echapper(ferme)}</mo>` : ''}</mrow>`;
    }
    if (v === 'right') { erreur('\\right sans \\left.'); return ''; }
    erreur(`la commande « \\${v} » n'est pas prise en charge ; ${proposer(v)}.`);
    return `<mi>${echapper(v)}</mi>`;
  }

  function atome(seul) {
    const t = voir();
    if (!t) return null;
    if (t.t === 'nombre') {
      // x^23 : l'exposant est « 2 » (comme en TeX) ; 10^{12} pour un nombre entier.
      if (seul && t.v.length > 1 && !t.v.includes(',')) { toks[k] = { t: 'nombre', v: t.v.slice(1) }; return `<mn>${t.v[0]}</mn>`; }
      k++;
      return `<mn>${t.v}</mn>`;
    }
    if (t.t === 'texte') { k++; return `<mtext>${echapper(t.v)}</mtext>`; }
    if (t.t === 'lettre') { k++; return `<mi>${echapper(t.v)}</mi>`; }
    if (t.t === 'commande') { k++; return commande(t); }
    if (t.v === '{') return groupe();
    if (t.v === '}') return null;
    if (t.v === '^' || t.v === '_') { k++; erreur(`« ${t.v} » sans rien avant : écrire x${t.v}2.`); return '<mrow></mrow>'; }
    k++;
    if (Object.hasOwn(SIMPLES, t.v)) return `<mo>${SIMPLES[t.v]}</mo>`;
    erreur(`le signe « ${t.v} » n'est pas pris en charge ; écrire \\text{${t.v}} pour l'afficher tel quel.`);
    return `<mo>${echapper(t.v)}</mo>`;
  }

  function terme() {
    const t = voir();
    const grand = t && t.t === 'commande' && (Object.hasOwn(GRANDS, t.v) || t.v === 'lim');
    const base = atome(false);
    if (base === null) return null;
    let bas = null, haut = null;
    while (voir() && voir().t === 'signe' && (voir().v === '_' || voir().v === '^')) {
      const s = toks[k++].v;
      const arg = groupe();
      if (s === '_') { if (bas !== null) erreur('deux indices « _ » de suite : les grouper entre accolades.'); bas = arg; }
      else { if (haut !== null) erreur('deux exposants « ^ » de suite : les grouper entre accolades.'); haut = arg; }
    }
    if (bas === null && haut === null) return base;
    const limites = grand && t.v !== 'int';
    if (bas !== null && haut !== null) return limites ? `<munderover>${base}${bas}${haut}</munderover>` : `<msubsup>${base}${bas}${haut}</msubsup>`;
    if (bas !== null) return limites ? `<munder>${base}${bas}</munder>` : `<msub>${base}${bas}</msub>`;
    return limites ? `<mover>${base}${haut}</mover>` : `<msup>${base}${haut}</msup>`;
  }

  function suite(arret) {
    const r = [];
    while (!fin()) {
      const t = voir();
      if (arret === '}' && t.t === 'signe' && t.v === '}') break;
      if (arret === ']' && t.t === 'signe' && t.v === ']') break;
      if (arret === '\\right' && t.t === 'commande' && t.v === 'right') break;
      if (!arret && t.t === 'signe' && t.v === '}') { erreur('accolade « } » sans « { ».'); k++; continue; }
      const x = terme();
      if (x === null) { k++; continue; }
      r.push(x);
    }
    return r;
  }

  if (typeof tex !== 'string' || !tex.trim()) return { mathml: '', erreurs: ['la formule est vide : écrire par exemple « \\pi r^2 ».'] };
  const corps = suite(null);
  const contenu = corps.length === 1 ? corps[0] : `<mrow>${corps.join('')}</mrow>`;
  return { mathml: `<math display="inline" alttext="${echapper(tex)}">${contenu}</math>`, erreurs };
}

module.exports = { convertir, lexemes, GRECQUES, OPERATEURS, CONNUES };
