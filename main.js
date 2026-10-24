import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { films } from "./films.js";

// Tuning values taken from the original bundle's disc gallery config (main.*.js).
const CFG = {
  holeSize: 0.14,
  hubSize: 0.24,
  discThickness: 0.01,
  galleryScale: 1.08,
  hGap: 2.3,
  depthGap: 1,
  activeDiscY: 0.06,
  galleryRotX: -30,
  galleryRotY: -30,
  inactiveScale: 0.8,
  cameraDistance: 4.4,
  cameraFOV: 40,
  exposure: 0.86,
  keyColor: 0xfff9e8,
  keyIntensity: 0.75,
  fillIntensity: 0.3,
  rimColor: 0x499ff5,
  rimIntensity: 0.75,
  fogColor: 0xffffff,
  hoverTiltStrength: 0.21,
  flowLean: 0.055,
  flowLeanMax: 0.3,
  flowBank: 0.32,
  snapFreq: 9.5,
  snapDamping: 12,
  wheelStepThreshold: 40,
  wheelMinStep: 190,
  scribbleFps: 10,
  scribblePoints: 24,
  scribbleJitter: 0.028,
  scribbleLoops: 2,
  scribbleLoopGap: 0.045,
  scribblePadding: 0.06,
  scribbleWidth: 0.012,
  artResolution: 1024,
};

// Label palettes for the procedurally drawn disc art: [background, ink, accent]
const PALETTES = {
  "backrooms": ["#6d6a2e", "#d8d39a", "#2a2412"],
  "the-invite": ["#ece8df", "#1b1b1b", "#b0344a"],
  "tony": ["#8a5a3c", "#f1e6d8", "#d3261f"],
  "marty-supreme": ["#1d2a44", "#f2e7cf", "#e0a43a"],
  "the-smashing-machine": ["#2b2b2b", "#e9e4da", "#c43b2b"],
  "the-brutalist": ["#c9c3b6", "#1a1a1a", "#7b6f5c"],
  "the-zone-of-interest": ["#3f5a3a", "#eef0e6", "#0e120d"],
  "everything-everywhere-all-at-once": ["#e9b949", "#141414", "#2d5bd7"],
  "uncut-gems": ["#0d3b3a", "#f3ead2", "#c9a23a"],
  "hereditary": ["#4a1d1a", "#efe4d6", "#d9a55b"],
  "lady-bird": ["#efb7a6", "#2d1f1b", "#c0392b"],
  "ex-machina": ["#cfd6dc", "#121417", "#9a2a2a"],
};

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const deg = THREE.MathUtils.degToRad;

/* ------------------------------------------------------------------ */
/* Grain                                                              */
/* ------------------------------------------------------------------ */
(function makeGrain() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(128, 128);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 140 + Math.random() * 115;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  document.querySelector(".grain").style.backgroundImage = `url(${c.toDataURL()})`;
})();

/* ------------------------------------------------------------------ */
/* Renderer / scene                                                   */
/* ------------------------------------------------------------------ */
const gallery = document.querySelector("[data-gallery]");
const mount = document.querySelector("[data-canvas]");

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = CFG.exposure * 1.15;
mount.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(CFG.fogColor, 7, 14);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(CFG.cameraFOV, 1, 0.1, 100);
camera.position.set(0, 0, CFG.cameraDistance);

const root = new THREE.Group();
root.rotation.set(deg(CFG.galleryRotX), deg(CFG.galleryRotY), 0);
root.scale.setScalar(CFG.galleryScale);
scene.add(root);

scene.add(new THREE.AmbientLight(0xffffff, 0.25));
const key = new THREE.DirectionalLight(CFG.keyColor, CFG.keyIntensity);
key.position.set(3.5, -8, 6);
scene.add(key);
const fill = new THREE.DirectionalLight(0xffffff, CFG.fillIntensity);
fill.position.set(-5, -2, 4);
scene.add(fill);
const rim = new THREE.DirectionalLight(CFG.rimColor, CFG.rimIntensity);
rim.position.set(0, 3, -6);
scene.add(rim);
const top = new THREE.DirectionalLight(0xffffff, 0.9);
top.position.set(0, 3.2, 3);
scene.add(top);

/* ------------------------------------------------------------------ */
/* Procedural textures                                                */
/* ------------------------------------------------------------------ */
function valueNoise(x, y) {
  const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return v - Math.floor(v);
}

// Height map -> normal map, same approach as the original worker builders.
function normalTexture(size, heightAt) {
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) h[y * size + x] = heightAt(x, y);
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const l = h[y * size + Math.max(0, x - 1)];
      const r = h[y * size + Math.min(size - 1, x + 1)];
      const u = h[Math.max(0, y - 1) * size + x];
      const d = h[Math.min(size - 1, y + 1) * size + x];
      let nx = l - r, ny = u - d, nz = 1;
      const inv = 1 / Math.hypot(nx, ny, nz);
      const i = (y * size + x) * 4;
      data[i] = (nx * inv * 0.5 + 0.5) * 255;
      data[i + 1] = (ny * inv * 0.5 + 0.5) * 255;
      data[i + 2] = (nz * inv * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size);
  // DataTexture defaults to nearest filtering without mipmaps, which turns the
  // fine radial rings into moiré at a distance.
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  tex.needsUpdate = true;
  return tex;
}

const NORMAL_SIZE = 256;
const frontNormal = normalTexture(NORMAL_SIZE, (x, y) => {
  const c = NORMAL_SIZE / 2;
  const r = Math.hypot(x - c, y - c);
  return Math.sin(r * 0.6) * 0.02 + (valueNoise(x * 0.4, y * 0.4) - 0.5) * 0.18;
});
const backNormal = normalTexture(NORMAL_SIZE, (x, y) => {
  const c = NORMAL_SIZE / 2;
  const r = Math.hypot(x - c, y - c);
  return Math.sin(r * 3.2) * 0.5 + (valueNoise(x * 0.6, y * 0.6) - 0.5) * 0.06;
});

function drawDiscArt(film) {
  const S = CFG.artResolution;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const ctx = c.getContext("2d");
  const [bg, ink, accent] = PALETTES[film.slug] || ["#333", "#eee", "#c33"];
  const cx = S / 2;

  // Base wash with a soft radial vignette
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, S, S);
  const g = ctx.createRadialGradient(cx * 0.8, cx * 0.7, S * 0.05, cx, cx, S * 0.6);
  g.addColorStop(0, "rgba(255,255,255,0.18)");
  g.addColorStop(1, "rgba(0,0,0,0.28)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);

  // Graphic shape so each label reads differently
  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = accent;
  const seed = film.slug.length;
  ctx.beginPath();
  ctx.ellipse(cx + Math.cos(seed) * S * 0.18, cx + S * 0.2, S * 0.34, S * 0.22, seed * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Print grain
  const img = ctx.getImageData(0, 0, S, S);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 22;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);

  // Title, fitted across the upper half
  ctx.fillStyle = ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  const words = film.title.split(" ");
  const lines = [];
  let line = "";
  ctx.font = `400 ${S * 0.1}px "Gilda Display", serif`;
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > S * 0.62 && line) { lines.push(line); line = w; } else line = test;
  }
  lines.push(line);
  const size = Math.min(S * 0.12, (S * 0.62) / Math.max(...lines.map(l => l.length)) * 1.9);
  ctx.font = `400 ${size}px "Gilda Display", serif`;
  lines.forEach((l, i) => ctx.fillText(l, cx, S * 0.3 + i * size * 1.02 - (lines.length - 1) * size * 0.5));

  ctx.font = `400 ${S * 0.04}px "Gilda Display", serif`;
  ctx.fillText("A24", cx, S * 0.3 + lines.length * size * 0.55 + S * 0.03);

  // Credits set on the rim, like a real disc label
  const ring = [...film.starring.map(s => s.toUpperCase()), film.year, "A24"].join("  ·  ");
  ctx.font = `500 ${S * 0.018}px "Inter Tight", sans-serif`;
  const radius = S * 0.44;
  const chars = ring.split("");
  const arc = Math.min(Math.PI * 1.1, chars.length * 0.028);
  ctx.save();
  ctx.translate(cx, cx);
  ctx.rotate(Math.PI * 0.5 + arc / 2);
  for (const ch of chars) {
    ctx.save();
    ctx.translate(0, -radius);
    ctx.rotate(Math.PI);
    ctx.fillText(ch, 0, 0);
    ctx.restore();
    ctx.rotate(-arc / chars.length);
  }
  ctx.restore();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

/* ------------------------------------------------------------------ */
/* Disc geometry & materials                                          */
/* ------------------------------------------------------------------ */
function planarUV(geo) {
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) * 0.5 + 0.5, pos.getY(i) * 0.5 + 0.5);
  uv.needsUpdate = true;
  return geo;
}

const T = CFG.discThickness;
const geo = {
  front: planarUV(new THREE.RingGeometry(CFG.hubSize, 1, 160, 1)),
  back: planarUV(new THREE.RingGeometry(CFG.hubSize, 1, 160, 1)),
  edge: new THREE.CylinderGeometry(1, 1, T, 160, 1, true).rotateX(Math.PI / 2),
  hub: new THREE.RingGeometry(CFG.holeSize, CFG.hubSize, 96, 1),
  hubLip: new THREE.TorusGeometry(CFG.holeSize, 0.012, 12, 96),
  hubOuter: new THREE.TorusGeometry(CFG.hubSize * 0.82, 0.008, 12, 96),
  pick: new THREE.CircleGeometry(1, 32),
};

const mat = {
  back: new THREE.MeshPhysicalMaterial({
    color: 0x1a1e2a,
    metalness: 1,
    roughness: 0.23,
    clearcoat: 0.34,
    iridescence: 1,
    iridescenceIOR: 1.86,
    iridescenceThicknessRange: [300, 900],
    normalMap: backNormal,
    normalScale: new THREE.Vector2(0.25, 0.25),
  }),
  edge: new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0.55, roughness: 0.04 }),
  hub: new THREE.MeshPhysicalMaterial({
    color: 0xdfe3ea,
    roughness: 0.38,
    metalness: 0,
    // Plain alpha instead of `transmission`: transmission forces a second
    // full-scene render pass every frame and halves the frame rate on iGPUs.
    clearcoat: 0.4,
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide,
  }),
  lip: new THREE.MeshPhysicalMaterial({ color: 0xf4f6f9, roughness: 0.25, clearcoat: 0.6 }),
  pick: new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }),
};

function createDisc(film, index) {
  const holder = new THREE.Group(); // position + scale
  const tilt = new THREE.Group(); // flow lean + hover tilt
  const flip = new THREE.Group(); // Space / click flip
  holder.add(tilt);
  tilt.add(flip);

  const front = new THREE.Mesh(
    geo.front,
    new THREE.MeshPhysicalMaterial({
      map: drawDiscArt(film),
      roughness: 0.42,
      metalness: 0.2,
      clearcoat: 0.8,
      clearcoatRoughness: 0.25,
      normalMap: frontNormal,
      normalScale: new THREE.Vector2(0.15, 0.15),
    })
  );
  front.position.z = T / 2;

  const back = new THREE.Mesh(geo.back, mat.back);
  back.rotation.y = Math.PI;
  back.position.z = -T / 2;

  const edge = new THREE.Mesh(geo.edge, mat.edge);
  const hubF = new THREE.Mesh(geo.hub, mat.hub);
  hubF.position.z = T * 0.6;
  const lip = new THREE.Mesh(geo.hubLip, mat.lip);
  lip.position.z = T * 0.8;
  const outer = new THREE.Mesh(geo.hubOuter, mat.lip);
  outer.position.z = T * 0.7;

  const pick = new THREE.Mesh(geo.pick, mat.pick);
  pick.userData.index = index;

  flip.add(front, back, edge, hubF, lip, outer, pick);
  root.add(holder);

  return {
    film, index, holder, tilt, flip, pick,
    hover: 0,
    flipTarget: 0,
    appear: reducedMotion ? 1 : 0,
  };
}

const discs = films.map(createDisc);

/* ------------------------------------------------------------------ */
/* Scribble (hand-drawn loop around the active disc)                  */
/* ------------------------------------------------------------------ */
const scribble = (() => {
  const segs = CFG.scribblePoints * 3;
  const material = new THREE.MeshBasicMaterial({
    color: 0x000000,
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    fog: false,
  });
  const group = new THREE.Group();
  group.renderOrder = 900;
  const loops = [];
  for (let l = 0; l < CFG.scribbleLoops; l++) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array((segs + 1) * 2 * 3), 3));
    const idx = [];
    for (let i = 0; i < segs; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    g.setIndex(idx);
    const mesh = new THREE.Mesh(g, material);
    mesh.renderOrder = 900;
    mesh.frustumCulled = false;
    group.add(mesh);
    loops.push({ geometry: g, start: 0, sweep: 1, jitter: [] });
  }
  group.visible = false;

  function reseed() {
    loops.forEach((loop, l) => {
      loop.start = Math.random() * Math.PI * 2;
      loop.sweep = 0.9 + Math.random() * 0.3 + l * 0.1;
      loop.jitter = Array.from({ length: CFG.scribblePoints + 1 }, () => 1 + (Math.random() - 0.5) * 2 * CFG.scribbleJitter);
      loop.jitter[CFG.scribblePoints] = loop.jitter[0];
    });
  }

  // progress: 0..1 portion of the stroke drawn
  function build(progress) {
    loops.forEach((loop, l) => {
      const pos = loop.geometry.attributes.position;
      const base = 1 + CFG.scribblePadding + l * CFG.scribbleLoopGap;
      const half = CFG.scribbleWidth * 0.5;
      const total = Math.PI * 2 * loop.sweep * clamp(progress, 0, 1);
      for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        const a = loop.start + t * total;
        // Smoothly interpolate the per-point jitter so the line wobbles like ink
        const f = t * CFG.scribblePoints;
        const k = Math.floor(f);
        const fr = f - k;
        const s = fr * fr * (3 - 2 * fr);
        const j = loop.jitter[k % CFG.scribblePoints] * (1 - s) + loop.jitter[(k + 1) % CFG.scribblePoints] * s;
        // Spiral slightly so the loop ends do not meet cleanly
        const r = base * j + t * 0.03 * (l ? -1 : 1);
        const taper = Math.sin(Math.PI * clamp(t * 1.05, 0, 1)) * 0.6 + 0.4;
        const w = half * taper;
        const cx = Math.cos(a), sy = Math.sin(a);
        pos.setXYZ(i * 2, cx * (r - w), sy * (r - w), 0);
        pos.setXYZ(i * 2 + 1, cx * (r + w), sy * (r + w), 0);
      }
      pos.needsUpdate = true;
    });
  }

  reseed();
  return { group, reseed, build };
})();

/* ------------------------------------------------------------------ */
/* UI binding                                                         */
/* ------------------------------------------------------------------ */
const $ = sel => document.querySelector(sel);
const target = name => $(`[data-target="${name}"]`);
const live = $("[data-live]");

const STAR_PATH = "M5.24862 0L6.68508 3.53591L10.4972 3.81215L7.62431 6.29834L8.50829 10L5.24862 8.01105L1.98895 10L2.87293 6.29834L0 3.81215L3.81215 3.53591L5.24862 0Z";
let clipId = 0;
function starsMarkup(rating) {
  let out = "";
  for (let i = 0; i < 5; i++) {
    const fillAmt = clamp(rating - i, 0, 1);
    if (fillAmt >= 1) {
      out += `<svg viewBox="0 0 11 10"><path d="${STAR_PATH}" fill="currentColor"/></svg>`;
    } else if (fillAmt > 0) {
      const id = `half-${clipId++}`;
      out += `<svg viewBox="0 0 11 10"><clipPath id="${id}"><rect width="${10.5 * fillAmt}" height="10"/></clipPath><path d="${STAR_PATH}" fill="currentColor" clip-path="url(#${id})"/></svg>`;
    }
  }
  return out;
}

// Replace text and animate it in line by line.
function reveal(el, lines, delay = 0) {
  el.replaceChildren(
    ...lines.map((text, i) => {
      const line = document.createElement("span");
      line.className = "line";
      line.style.setProperty("--d", `${delay + i * 0.05}s`);
      const inner = document.createElement("span");
      // Trailing space keeps words separate for screen readers and copy/paste;
      // it collapses visually at the end of the block line.
      inner.textContent = i < lines.length - 1 ? `${text} ` : text;
      line.appendChild(inner);
      requestAnimationFrame(() => line.classList.add("is-in"));
      return line;
    })
  );
}

let shownIndex = -1;
function showFilm(i) {
  if (i === shownIndex) return;
  shownIndex = i;
  const f = films[i];
  reveal(target("title"), [f.title]);
  reveal(target("directors"), f.directors, 0.04);
  reveal(target("year"), [f.year], 0.08);
  reveal(target("starring"), f.starring, 0.12);
  [0, 1].forEach(n => {
    const r = f.reviews[n];
    const card = target(`stars-${n}`).closest(".review");
    card.classList.toggle("is-empty", !r);
    if (!r) return;
    target(`stars-${n}`).innerHTML = starsMarkup(r.stars);
    reveal(target(`pub-${n}`), [r.publication], 0.1 + n * 0.06);
    reveal(target(`quote-${n}`), balance(`“${r.quote}”`), 0.14 + n * 0.06);
  });
  document.querySelectorAll(".nav__dropdown-link").forEach((a, n) => a.classList.toggle("is-active", n === i));
  live.textContent = `${f.title}, ${f.year}. Film ${i + 1} of ${films.length}.`;
}

// Split a quote into two balanced lines, as the original [data-balance-lines] helper does.
function balance(text) {
  const words = text.split(" ");
  if (words.length < 2) return [text];
  let best = 1, bestDiff = Infinity;
  for (let k = 1; k < words.length; k++) {
    const diff = Math.abs(words.slice(0, k).join(" ").length - words.slice(k).join(" ").length);
    if (diff < bestDiff) { bestDiff = diff; best = k; }
  }
  return [words.slice(0, best).join(" "), words.slice(best).join(" ")];
}

/* Index dropdown */
const toggle = $("[data-dropdown-toggle]");
const dropdown = $("[data-dropdown]");
const indexList = $("[data-index-list]");
films.forEach((f, i) => {
  const li = document.createElement("li");
  const b = document.createElement("button");
  b.className = "nav__dropdown-link";
  b.innerHTML = `<span></span><span></span>`;
  b.children[0].textContent = f.title;
  b.children[1].textContent = f.year;
  b.addEventListener("click", () => { goTo(i); setDropdown(false); gallery.focus({ preventScroll: true }); });
  li.appendChild(b);
  indexList.appendChild(li);
});
function setDropdown(open) {
  dropdown.classList.toggle("is-open", open);
  toggle.setAttribute("aria-expanded", String(open));
}
toggle.addEventListener("click", e => { e.stopPropagation(); setDropdown(!dropdown.classList.contains("is-open")); });
document.addEventListener("click", e => {
  if (!(e.target instanceof Element && e.target.closest(".nav__item--dropdown"))) setDropdown(false);
});

/* ------------------------------------------------------------------ */
/* Gallery state & input                                              */
/* ------------------------------------------------------------------ */
let current = 0; // smoothed float index
let velocity = 0;
let targetIndex = 0;
let dragging = false;
let ready = false;

function goTo(i) {
  targetIndex = clamp(Math.round(i), 0, films.length - 1);
}

window.addEventListener("keydown", e => {
  if (!ready || e.altKey || e.metaKey || e.ctrlKey) return;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;
  if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); goTo(targetIndex + 1); }
  else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); goTo(targetIndex - 1); }
  else if (e.key === "Home") { e.preventDefault(); goTo(0); }
  else if (e.key === "End") { e.preventDefault(); goTo(films.length - 1); }
  else if (e.key === " " && gallery.contains(document.activeElement)) { e.preventDefault(); flipDisc(targetIndex); }
  else if (e.key === "Escape") setDropdown(false);
});

// Wheel: accumulate until a threshold, then step once with a cooldown so a
// trackpad flick advances one film instead of ten.
let wheelAcc = 0, wheelLast = 0, wheelIdle;
window.addEventListener("wheel", e => {
  if (!ready || (e.target instanceof Element && e.target.closest(".nav__dropdown"))) return;
  e.preventDefault();
  const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  wheelAcc += clamp(d, -80, 80);
  clearTimeout(wheelIdle);
  wheelIdle = setTimeout(() => (wheelAcc = 0), 150);
  const now = performance.now();
  if (Math.abs(wheelAcc) > CFG.wheelStepThreshold && now - wheelLast > CFG.wheelMinStep) {
    goTo(targetIndex + Math.sign(wheelAcc));
    wheelAcc = 0;
    wheelLast = now;
  }
}, { passive: false });

// Pointer: drag scrubs the gallery; a click focuses or flips a disc.
const pointer = new THREE.Vector2(-10, -10);
const raycaster = new THREE.Raycaster();
let downX = 0, downIndex = 0, lastX = 0, lastT = 0, dragVel = 0, moved = false;

gallery.addEventListener("pointerdown", e => {
  if (!ready || e.button !== 0 || e.target.closest("a, button")) return;
  dragging = true;
  moved = false;
  downX = lastX = e.clientX;
  lastT = performance.now();
  downIndex = current;
  dragVel = 0;
  gallery.setPointerCapture(e.pointerId);
});
gallery.addEventListener("pointermove", e => {
  const rect = gallery.getBoundingClientRect();
  pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  if (!dragging) return;
  const dx = e.clientX - downX;
  if (Math.abs(dx) > 5) { moved = true; gallery.classList.add("is-dragging"); }
  if (!moved) return;
  const span = Math.max(260, rect.width * 0.28);
  current = clamp(downIndex - dx / span, -0.4, films.length - 0.6);
  const now = performance.now();
  dragVel = (-(e.clientX - lastX) / span) / Math.max(1, now - lastT) * 1000;
  lastX = e.clientX;
  lastT = now;
  velocity = 0;
});
function endDrag(e) {
  if (!dragging) return;
  dragging = false;
  gallery.classList.remove("is-dragging");
  if (moved) {
    goTo(current + clamp(dragVel * 0.18, -2, 2));
    velocity = dragVel;
  } else {
    const hit = pickDisc();
    if (hit >= 0) hit === targetIndex ? flipDisc(hit) : goTo(hit);
  }
}
gallery.addEventListener("pointerup", endDrag);
gallery.addEventListener("pointercancel", endDrag);
gallery.addEventListener("pointerleave", () => pointer.set(-10, -10));

function pickDisc() {
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(discs.filter(d => d.holder.visible).map(d => d.pick), false);
  return hits.length ? hits[0].object.userData.index : -1;
}

function flipDisc(i) {
  const d = discs[i];
  d.flipTarget = d.flipTarget ? 0 : Math.PI;
}

/* ------------------------------------------------------------------ */
/* Layout                                                             */
/* ------------------------------------------------------------------ */
let scribbleProgress = 0;
let scribbleTick = 0;
let scribbleOwner = -1;

function layout(dt, time) {
  const active = Math.round(clamp(current, 0, films.length - 1));
  const lean = clamp(Math.sign(velocity) * Math.sqrt(Math.abs(velocity)) * CFG.flowLean, -CFG.flowLeanMax, CFG.flowLeanMax);
  const hovered = !dragging && pointer.x > -2 ? pickDisc() : -1;

  for (const d of discs) {
    const m = d.index - current;
    const h = Math.abs(m);
    const isActive = d.index === active;
    const a = m * 0.35;
    const v = CFG.depthGap;

    // Discs sit on a shallow arc: sideways on sin, receding on cos.
    const x = Math.sin(a) * CFG.hGap * 2.4;
    const y = isActive ? CFG.activeDiscY : 0;
    let z = -Math.cos(a) * v * 2.4 + v * 2.4;

    const restScale = isActive ? 1 : Math.max(CFG.inactiveScale, 1 - h * (1 - CFG.inactiveScale) * 0.6);
    const appear = d.appear;
    const pop = appear < 1 ? 1 - Math.pow(1 - appear, 3) : 1;
    z -= (1 - pop) * 2.2;
    d.holder.position.set(x, y, z);
    d.holder.scale.setScalar(Math.max(0.0001, restScale * pop));
    d.holder.visible = pop > 0.01 && h < 6;

    // Hover tilt toward the pointer, plus lean while the row is moving.
    const hoverTarget = hovered === d.index ? 1 : 0;
    d.hover += (hoverTarget - d.hover) * Math.min(1, dt * 10);
    const tiltX = -pointer.y * d.hover * CFG.hoverTiltStrength;
    const tiltY = pointer.x * d.hover * CFG.hoverTiltStrength;
    d.tilt.rotation.set(tiltX, -a + lean * (isActive ? 1 : 1.12) + tiltY, -lean * CFG.flowBank * (isActive ? 0.7 : 1));

    d.flip.rotation.y += (d.flipTarget - d.flip.rotation.y) * Math.min(1, dt * 7);
  }

  // Scribble follows the settled active disc and redraws at a low frame rate.
  const settled = ready && !dragging && Math.abs(targetIndex - current) < 0.02 && Math.abs(velocity) < 0.05;
  if (scribbleOwner !== active) {
    scribbleOwner = active;
    scribbleProgress = 0;
    discs[active].tilt.add(scribble.group);
    scribble.group.position.z = 0.03;
  }
  scribbleProgress = settled ? Math.min(1, scribbleProgress + dt * 1.6) : Math.max(0, scribbleProgress - dt * 4);
  scribble.group.visible = scribbleProgress > 0.01;
  scribbleTick += dt;
  if (scribble.group.visible && scribbleTick > 1 / CFG.scribbleFps) {
    scribbleTick = 0;
    scribble.reseed();
  }
  if (scribble.group.visible) scribble.build(1 - Math.pow(1 - scribbleProgress, 3));

  if (active !== shownIndex && ready) showFilm(active);
}

/* ------------------------------------------------------------------ */
/* Loop                                                               */
/* ------------------------------------------------------------------ */
function resize() {
  const w = mount.clientWidth, h = mount.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // Pull back on portrait screens so the active disc still fits.
  camera.position.z = CFG.cameraDistance * Math.max(1, 1.25 / camera.aspect);
  // Keep the fog band relative to the camera so pulled-back views aren't washed out.
  const pullback = camera.position.z - CFG.cameraDistance;
  scene.fog.near = 7 + pullback;
  scene.fog.far = 14 + pullback;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();

const clock = new THREE.Clock();
function frame() {
  const dt = Math.min(clock.getDelta(), 1 / 20);
  if (!dragging) {
    // Spring toward the target index (snapFreq / snapDamping from the original).
    const acc = CFG.snapFreq * CFG.snapFreq * (targetIndex - current) - CFG.snapDamping * velocity;
    velocity += acc * dt;
    current += velocity * dt;
    if (reducedMotion) { current = targetIndex; velocity = 0; }
  }
  layout(dt, clock.elapsedTime);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

/* ------------------------------------------------------------------ */
/* Intro                                                              */
/* ------------------------------------------------------------------ */
async function intro() {
  await Promise.all([document.fonts.load('64px "Gilda Display"'), document.fonts.load('500 16px "Inter Tight"')]).catch(() => {});
  await document.fonts.ready;
  // Fonts are now available, so redraw the labels with the real typefaces.
  discs.forEach(d => {
    const front = d.flip.children[0];
    front.material.map.dispose();
    front.material.map = drawDiscArt(d.film);
    front.material.needsUpdate = true;
  });
  requestAnimationFrame(frame);

  const preloader = $("[data-preloader]");
  const yearEl = $("[data-preload-year]");
  const years = films.map(f => +f.year);
  const [minY, maxY] = [Math.min(...years), Math.max(...years)];
  const duration = reducedMotion ? 0 : 1800;
  const start = performance.now();

  await new Promise(resolve => {
    (function tick() {
      const t = duration ? clamp((performance.now() - start) / duration, 0, 1) : 1;
      yearEl.textContent = Math.round(minY + (maxY - minY) * t);
      t < 1 ? requestAnimationFrame(tick) : resolve();
    })();
  });

  preloader.classList.add("is-done");
  document.documentElement.removeAttribute("data-preload");
  ready = true;
  showFilm(0);
  gallery.focus({ preventScroll: true });

  // Pop discs in from the active one outward.
  const t0 = performance.now();
  (function grow() {
    const el = (performance.now() - t0) / 1000;
    let done = true;
    for (const d of discs) {
      d.appear = clamp((el - d.index * 0.09) / 0.9, 0, 1);
      if (d.appear < 1) done = false;
    }
    if (!done) requestAnimationFrame(grow);
  })();
  setTimeout(() => preloader.remove(), 800);
}

// Read-only snapshot for automated checks and debugging in the console.
window.__gallery = () => ({
  ready,
  current,
  velocity,
  targetIndex,
  shownIndex,
  flipped: discs.map(d => d.flipTarget !== 0),
  scribbleVisible: scribble.group.visible,
  visible: discs.map(d => d.holder.visible),
});

intro();
