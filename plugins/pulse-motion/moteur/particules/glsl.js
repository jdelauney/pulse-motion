/* Pulse Motion – shaders GLSL (P7) : un contexte WebGL2 caché (OffscreenCanvas), partagé par tous les shaders GLSL de la page.
 *
 * P.Glsl.partage() -> instance          créée au premier appel ; lève « WebGL2 indisponible »
 *   .compiler(donnee, appel = 'mainImage') -> { ok, prog?, erreurs }   erreurs situées dans le fichier .glsl
 *   .image(uri) -> Promise<{ texture, largeur, hauteur }>   image de assets/ (iChannel2), retournée (y vers le haut), gardée
 *   .ecrireSon(piste, spectre, onde) ; .texSon(piste) -> { texture, largeur: 512, hauteur: 2 } | null   (iChannel3)
 *   .dessiner(prog, { largeur, hauteur, entrees, valeurs, canaux }) -> OffscreenCanvas   canaux : 4 sources | null
 *       (ImageBitmap téléversée, retournée et non prémultipliée ; ou { texture, largeur, hauteur }) ; sortie RVBA sRGB non
 *       prémultipliée, y vers le haut (Shadertoy), gardée jusqu'au dessin suivant (preserveDrawingBuffer)
 *   .executer(prog, o, cible, largeur, hauteur)   un dessin plein cadre vers un framebuffer (null : le canvas) ; multipasse
 *   .face(l, h), .tampon(l, h), .viderFace, .copierFace, .libererFace   tampons RGBA16F des multipasses (P7)
 * Navigateur seulement ; dépend de shaders/glsl.js (M.codeGLSL).
 */
(function (racine) {
  'use strict';
  const M = racine.M = racine.M || {};
  const P = M.particulesInterne = M.particulesInterne || {};
  const EPOCH = Date.UTC(2026, 0, 1);
  const CHAMPS_SON = ['volume', 'basses', 'mediums', 'aigus', 'battement', 'phase', 'enveloppe', 'syllabe'];
  const ENTREES = ['iResolution', 'iTime', 'iTimeDelta', 'iFrame', 'iFrameRate', 'iProgres', 'iMouse', 'iDate', 'iChannelResolution'];

  function versSRGB(x) { return x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055; }

  let partage = null;

  class Glsl {
    static partage() {
      if (!partage) partage = new Glsl();
      return partage;
    }

    constructor() {
      const canvas = new OffscreenCanvas(1, 1);
      const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false, depth: false, stencil: false });
      if (!gl) throw new Error('WebGL2 indisponible');
      this.canvas = canvas;
      this.gl = gl;
      // Tampons flottants des multipasses (plan p7-5).
      this.flottant = !!gl.getExtension('EXT_color_buffer_float');
      this.vao = gl.createVertexArray();
      this.sommets = gl.createShader(gl.VERTEX_SHADER);
      gl.shaderSource(this.sommets, M.codeGLSL.SOMMETS);
      gl.compileShader(this.sommets);
      this.vide = { texture: this.texture8(1, 1, new Uint8Array(4)), largeur: 1, hauteur: 1 };
      this.images = new Map();
      this.sons = new Map();
      this.entrees = [0, 1, 2, 3].map(() => gl.createTexture());
    }

    parametrer(texture) {
      const gl = this.gl;
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }

    texture8(largeur, hauteur, octets) {
      const gl = this.gl;
      const t = gl.createTexture();
      this.parametrer(t);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, largeur, hauteur, 0, gl.RGBA, gl.UNSIGNED_BYTE, octets);
      return t;
    }

    /** Téléversement d'une image (ImageBitmap : son orientation et son alpha sont ceux de sa création ; images du pont
     *  déjà retournées par la composition). */
    televerser(texture, source) {
      const gl = this.gl;
      this.parametrer(texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, source);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    }

    async image(uri) {
      if (this.images.has(uri)) return this.images.get(uri);
      const img = new Image();
      img.src = uri;
      await img.decode();
      // Pour une ImageBitmap, WebGL ignore UNPACK_FLIP_Y et UNPACK_PREMULTIPLY_ALPHA : retournement et alpha droit
      // sont demandés à la création de l'image.
      const bitmap = await createImageBitmap(img, { imageOrientation: 'flipY', premultiplyAlpha: 'none' });
      const texture = this.gl.createTexture();
      this.televerser(texture, bitmap);
      const r = { texture, largeur: bitmap.width, hauteur: bitmap.height };
      bitmap.close();
      this.images.set(uri, r);
      return r;
    }

    ecrireSon(piste, spectre, onde) {
      const gl = this.gl;
      let s = this.sons.get(piste);
      if (!s) {
        s = { texture: gl.createTexture(), largeur: 512, hauteur: 2 };
        this.sons.set(piste, s);
      }
      const texels = new Uint8Array(1024);
      texels.set(spectre, 0);
      texels.set(onde, 512);
      this.parametrer(s.texture);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 512, 2, 0, gl.RED, gl.UNSIGNED_BYTE, texels);
    }

    texSon(piste) { return this.sons.get(piste) || null; }

    compiler(donnee, appel = 'mainImage') {
      const G = M.codeGLSL;
      const gl = this.gl;
      const a = G.assemblerGLSL({ code: donnee.code, parametres: donnee.parametres || {}, appel });
      const fs = gl.createShader(gl.FRAGMENT_SHADER);
      gl.shaderSource(fs, a.glsl);
      gl.compileShader(fs);
      if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
        const erreurs = G.situerGLSL(gl.getShaderInfoLog(fs) || '', a);
        gl.deleteShader(fs);
        return { ok: false, erreurs: erreurs.length ? erreurs : [{ ligne: null, colonne: null, message: 'compilation GLSL refusée' }] };
      }
      const programme = gl.createProgram();
      gl.attachShader(programme, this.sommets);
      gl.attachShader(programme, fs);
      gl.linkProgram(programme);
      if (!gl.getProgramParameter(programme, gl.LINK_STATUS)) {
        const message = gl.getProgramInfoLog(programme) || 'édition des liens GLSL refusée';
        gl.deleteProgram(programme);
        return { ok: false, erreurs: [{ ligne: null, colonne: null, message }] };
      }
      const u = (n) => gl.getUniformLocation(programme, n);
      const uniformes = { canaux: [0, 1, 2, 3].map((i) => u('iChannel' + i)), son: CHAMPS_SON.map((c) => u('iSon.' + c)),
        reglages: Object.keys(donnee.parametres || {}).map((k) => ({ nom: k, couleur: (donnee.parametres[k] || {}).type === 'couleur', lieu: u('R_' + k) })) };
      ENTREES.forEach((n) => { uniformes[n] = u(n); });
      return { ok: true, prog: { programme, uniformes }, erreurs: [] };
    }

    /** Source d'un canal à l'unité i : vide, texture donnée, ou ImageBitmap téléversée dans la texture d'entrée i. */
    source(i, s) {
      if (!s) return this.vide;
      if (s.texture) return s;
      this.televerser(this.entrees[i], s);
      return { texture: this.entrees[i], largeur: s.width, hauteur: s.height };
    }

    executer(prog, o, cible, largeur, hauteur) {
      const gl = this.gl;
      const U = prog.uniformes;
      const e = o.entrees || {};
      gl.bindFramebuffer(gl.FRAMEBUFFER, cible);
      gl.viewport(0, 0, largeur, hauteur);
      gl.useProgram(prog.programme);
      gl.bindVertexArray(this.vao);
      const image = e.image || [0, 0];
      gl.uniform3f(U.iResolution, largeur, hauteur, 1);
      gl.uniform1f(U.iTime, e.temps || 0);
      gl.uniform1f(U.iTimeDelta, image[1] || 0);
      gl.uniform1i(U.iFrame, image[0] || 0);
      gl.uniform1f(U.iFrameRate, image[1] > 0 ? 1 / image[1] : 0);
      gl.uniform1f(U.iProgres, e.progres || 0);
      gl.uniform4f(U.iMouse, 0, 0, 0, 0);
      const d = new Date(EPOCH + Math.round((e.instant || 0) * 1000));
      gl.uniform4f(U.iDate, d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds() + d.getUTCMilliseconds() / 1000);
      const son = e.son || {};
      U.son.forEach((lieu, i) => gl.uniform1f(lieu, son[CHAMPS_SON[i]] || 0));
      const valeurs = o.valeurs || {};
      U.reglages.forEach((r) => {
        const v = valeurs[r.nom];
        if (r.couleur) {
          const c = Array.isArray(v) ? v : [0, 0, 0, 0];
          gl.uniform4f(r.lieu, versSRGB(c[0]), versSRGB(c[1]), versSRGB(c[2]), c[3]);
        } else gl.uniform1f(r.lieu, typeof v === 'number' ? v : 0);
      });
      const resolutions = new Float32Array(12);
      const canaux = o.canaux || [];
      for (let i = 0; i < 4; i++) {
        gl.activeTexture(gl.TEXTURE0 + i);
        const s = this.source(i, canaux[i]);
        gl.bindTexture(gl.TEXTURE_2D, s.texture);
        gl.uniform1i(U.canaux[i], i);
        resolutions.set([s.largeur, s.hauteur, 1], i * 3);
      }
      gl.uniform3fv(U.iChannelResolution, resolutions);
      gl.disable(gl.BLEND);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    /** Face d'un tampon multipasse (P7) : texture RGBA16F et son framebuffer. */
    face(largeur, hauteur) {
      const gl = this.gl;
      const texture = gl.createTexture();
      this.parametrer(texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, largeur, hauteur, 0, gl.RGBA, gl.HALF_FLOAT, null);
      const fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return { texture, fb };
    }

    tampon(largeur, hauteur) { return { largeur, hauteur, faces: [this.face(largeur, hauteur), this.face(largeur, hauteur)], courant: 0 }; }

    viderFace(f, largeur, hauteur) {
      const gl = this.gl;
      gl.bindFramebuffer(gl.FRAMEBUFFER, f.fb);
      gl.viewport(0, 0, largeur, hauteur);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    /** Copie exacte d'une face dans une autre de même taille (instantanés). */
    copierFace(de, vers, largeur, hauteur) {
      const gl = this.gl;
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, de.fb);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, vers.fb);
      gl.blitFramebuffer(0, 0, largeur, hauteur, 0, 0, largeur, hauteur, gl.COLOR_BUFFER_BIT, gl.NEAREST);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    }

    libererFace(f) { this.gl.deleteTexture(f.texture); this.gl.deleteFramebuffer(f.fb); }

    dessiner(prog, o) {
      if (this.canvas.width !== o.largeur) this.canvas.width = o.largeur;
      if (this.canvas.height !== o.hauteur) this.canvas.height = o.hauteur;
      this.executer(prog, o, null, o.largeur, o.hauteur);
      return this.canvas;
    }
  }

  P.Glsl = Glsl;
})(typeof globalThis !== 'undefined' ? globalThis : this);
