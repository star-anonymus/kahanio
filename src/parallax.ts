// 2.5D photo motion on the GPU (WebGL2): the depth map shifts near things more than far things as the camera moves.
// Without a depth map it is a smooth zoom and pan. Sub-pixel sampling keeps the motion smooth, never jittery.
import { coverUV, type Motion } from "./motion.ts";

export type PhotoLayer = { id: string; name: string; bitmap: ImageBitmap; depth: HTMLCanvasElement | null };

const VS = `#version 300 es
in vec2 pos; out vec2 v;
void main(){ v = pos * 0.5 + 0.5; gl_Position = vec4(pos, 0.0, 1.0); }`;

const FS = `#version 300 es
precision highp float;
in vec2 v; out vec4 o;
uniform sampler2D img; uniform sampler2D dep;
uniform vec4 cover; uniform vec2 shift; uniform float zoom; uniform float hasDepth;
void main(){
  vec2 uv = (vec2(v.x, 1.0 - v.y) - 0.5) / zoom + 0.5; // top-down, like the image rows
  uv = uv * cover.xy + cover.zw;
  vec2 p = uv;
  if (hasDepth > 0.5) {
    for (int i = 0; i < 4; i++) { float d = texture(dep, p).r; p = uv - shift * (d - 0.4); }
  } else p = uv - shift * 0.6;
  o = texture(img, clamp(p, vec2(0.001), vec2(0.999)));
}`;

export class ParallaxRenderer {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private prog: WebGLProgram;
  private tex = new WeakMap<object, WebGLTexture>();
  private flat: WebGLTexture;

  constructor(w: number, h: number) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = w;
    this.canvas.height = h;
    const gl = this.canvas.getContext("webgl2", { preserveDrawingBuffer: true, premultipliedAlpha: false });
    if (!gl) throw new Error("This browser cannot animate photos (no WebGL2).");
    this.gl = gl;
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader");
      return s;
    };
    this.prog = gl.createProgram()!;
    gl.attachShader(this.prog, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(this.prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(this.prog);
    gl.useProgram(this.prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(this.prog, "pos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.uniform1i(gl.getUniformLocation(this.prog, "img"), 0);
    gl.uniform1i(gl.getUniformLocation(this.prog, "dep"), 1);
    const flat = document.createElement("canvas");
    flat.width = flat.height = 1;
    const fctx = flat.getContext("2d")!;
    fctx.fillStyle = "#666";
    fctx.fillRect(0, 0, 1, 1);
    this.flat = this.upload(flat);
  }

  resize(w: number, h: number) {
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  private upload(src: TexImageSource): WebGLTexture {
    const gl = this.gl;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    // No UNPACK_FLIP_Y: browsers ignore it for ImageBitmap, so the shader flips instead (same for every texture).
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  private texFor(key: object, src: TexImageSource) {
    let t = this.tex.get(key);
    if (!t) {
      t = this.upload(src);
      this.tex.set(key, t);
    }
    return t;
  }

  /** Draws the photo with the camera move and returns the canvas (same size as the frame). */
  render(layer: PhotoLayer, m: Motion): HTMLCanvasElement {
    const gl = this.gl;
    const { width: w, height: h } = this.canvas;
    gl.viewport(0, 0, w, h);
    gl.useProgram(this.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texFor(layer.bitmap, layer.bitmap));
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, layer.depth ? this.texFor(layer.depth, layer.depth) : this.flat);
    const c = coverUV(layer.bitmap.width, layer.bitmap.height, w, h);
    gl.uniform4f(gl.getUniformLocation(this.prog, "cover"), c.sx, c.sy, c.ox, c.oy);
    gl.uniform2f(gl.getUniformLocation(this.prog, "shift"), m.dx, m.dy);
    gl.uniform1f(gl.getUniformLocation(this.prog, "zoom"), m.zoom);
    gl.uniform1f(gl.getUniformLocation(this.prog, "hasDepth"), layer.depth ? 1 : 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return this.canvas;
  }
}
