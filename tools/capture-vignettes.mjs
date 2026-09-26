#!/usr/bin/env node
//
// Photographie les projets publiés pour leur vignette de la page d'accueil :
// une image prise dans le projet lui-même — en jeu, sans écran titre ni
// texte, puisque le titre est imprimé par-dessus —, recadrée en 16:10 et
// encodée en WebP dans vignettes/<projet>.webp.
//
// Usage :
//   npm i --no-save playwright                 une fois (utilise le Chrome installé)
//   tools/capture-vignettes.mjs                tous les projets qui ont une recette
//   tools/capture-vignettes.mjs baston tetris  seulement ceux-là
//   BASE=http://localhost:8000 tools/capture-vignettes.mjs   (site assemblé en local)
//
// Chaque projet a sa recette ci-dessous : comment passer l'écran titre, quoi
// cacher, à quel moment déclencher, quelle zone garder. Un projet sans
// recette est photographié tel qu'il s'ouvre, texte masqué. Une image posée
// à la main dans vignettes/ fait tout aussi bien l'affaire : la page
// d'accueil prend ce qu'elle trouve.

import { writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "vignettes");
const BASE = (process.env.BASE || "https://9mp.org").replace(/\/$/, "");
const W = 1200, H = 750, QUALITY = 0.74;

// Playwright est cherché à côté du dépôt, puis depuis le dossier courant
let chromium;
for (const from of [import.meta.url, join(process.cwd(), "_")]) {
  try {
    const pw = await import(pathToFileURL(createRequire(from).resolve("playwright")).href);
    chromium = pw.chromium ?? pw.default?.chromium;
    if (chromium) break;
  } catch { /* au suivant */ }
}
if (!chromium) {
  console.error("Playwright introuvable : lance d'abord  npm i --no-save playwright");
  process.exit(1);
}

// ------------------------------------------------------------- recettes --
// crop : [x, y, largeur, hauteur] en fractions de la capture ; la vignette
// garde le plus grand 16:10 centré dans cette zone.
// focus : un point {x, y} (fractions) lu dans la page au moment de la prise ;
// la zone de crop est alors recentrée dessus (utile pour suivre un boss).

const unlockMoto = () => localStorage.setItem("motopeter.save.v1", JSON.stringify({
  lv: { l1: { done: true }, l2: { done: true }, l3: { done: true }, l4: { done: true }, l5: { done: true } }, mute: true,
}));

// Nebula Strike 1 et 2 (Qwen, Gemma) : le boss est l'ennemi le plus large ; on le
// cadre en haut de l'image, ses tirs en dessous
const bossFocus = () => {
  const c = document.querySelector("canvas");
  const b = enemies.find((e) => e.w > 50);
  return b ? { x: b.x / c.width, y: (b.y + 150) / c.height } : { x: 0.5, y: 0.35 };
};

const RECETTES = {
  motopeter: {
    init: unlockMoto,
    async play(h) {
      await h.click("JOUER");
      await h.click("NEON DISTRICT");
      await h.js(() => { window.x0 = GAME.bike.body.x; });
      // gaz par à-coups : le jeu oublie une touche enfoncée avant le départ
      await h.until(() => GAME.bike.body.x > window.x0 + 80, 30000, () => h.hold("ArrowUp", 700));
      await h.onlyMedia();
    },
    crop: [0.02, 0.12, 0.68, 0.76],
  },

  berceuse: {
    async play(h) {
      await h.click("Entrer dans la maison");
      await h.wait(4000);
      await h.hold("KeyW", 1300);               // jusqu'à la boîte à musique
      await h.wait(600);
      await h.onlyMedia();
    },
    crop: [0.22, 0.14, 0.56, 0.74],
    filter: "brightness(1.55) contrast(1.2)",
  },

  baston: {
    async play(h) {
      // le combat de démonstration du jeu, sur le ring mexicain, sans les annonces
      await h.js(() => {
        const c = (id) => CHARS.find((x) => x.id === id);
        Game.set(new FightScene({ chars: [c("tigre"), c("neferti")], stage: "mexico", cpu: [true, true], level: [0.85, 0.85], demo: true, onEnd() {} }));
        Game.scene.announce = () => {};
      });
      await h.until(() => Game.scene.phase === "fight" && Game.scene.phaseT > 150, 30000);
      await h.until(() => Game.scene.fighters.some((f) => ["attack", "special", "air", "throwing"].includes(f.state)), 15000);
      await h.wait(120);
    },
    crop: [0, 0.16, 1, 0.58],                   // sous les barres de vie, au-dessus du bandeau DEMO
  },

  beatemall: {
    async play(h) {
      await h.hold("Enter");                    // écran titre
      await h.wait(900);
      await h.hold("Enter");                    // choix du combattant
      await h.wait(3000);
      // on avance jusqu'au premier verrou de la rue, puis on attend les voyous au contact
      await h.until(() => game.scene.world.locked, 20000, () => h.hold("KeyD", 400));
      await h.until(() => {
        const w = game.scene.world, p = w.players[0];
        return w.enemies.filter((e) => e.hp > 0 && Math.abs(e.x - p.x) < 70).length >= 2;
      }, 20000, () => h.hold("KeyJ", 90));
      await h.hold("KeyJ", 90);
      await h.wait(160);
    },
    crop: [0, 0.25, 1, 0.75],
  },

  "clip-pc98": {
    dpr: 2,
    async play(h) {
      await h.js(() => new Promise((ok) => {
        const v = document.querySelector("video");
        v.controls = false;
        v.pause();
        v.addEventListener("seeked", ok, { once: true });
        v.currentTime = 62.5;                   // Hikari, lignes de vitesse
      }));
      await h.wait(300);
    },
    element: "video",
  },

  "rewind-raid": {
    async play(h) {
      await h.hold("Enter");
      await h.wait(3000);
      await h.page.keyboard.down("Space");
      await h.weave(9000, null);                // le temps que la consigne du début s'efface
      await h.until(() => G.enemies.length >= 4, 40000, () => h.weave(900, null));
      await h.page.keyboard.up("Space");
      await h.onlyMedia();
    },
    element: "canvas",
    crop: [0.16, 0, 0.62, 0.31],                // entre les vies (à gauche) et la cassette (à droite)
    focus: () => ({ y: (Math.min(G.player.y, 268) - 22) / 320 }),   // l'avion en bas, le HUD dessous
  },

  // shoot'em up : on joue jusqu'à ce que l'écran se remplisse
  qwemup: {
    dpr: 2, viewport: { width: 1280, height: 800 },
    play: (h) => h.shmup(() => h.page.mouse.click(640, 400), () => enemies.some((e) => e.w > 50) && enemyBullets.length >= 10),
    element: "canvas", crop: [0, 0, 0.9, 0.5], focus: bossFocus,
  },
  "qwemup/clauded": {
    dpr: 2, viewport: { width: 1280, height: 800 },
    play: (h) => h.shmup(() => h.hold("Space"), () => foes.length + eb.length >= 18),
    element: "canvas", crop: [0, 0.15, 1, 0.6],
  },
  "qwemup/gemma": {
    dpr: 2, viewport: { width: 1280, height: 800 },
    play: (h) => h.shmup(() => h.page.mouse.click(640, 400), () => enemies.some((e) => e.w > 50) && enemyBullets.length >= 10),
    element: "canvas", crop: [0, 0, 0.9, 0.5], focus: bossFocus,
  },
  ds4shmup: {
    dpr: 2, viewport: { width: 1280, height: 800 },
    async play(h) {
      await h.shmup(async () => { await h.hold("Enter"); await h.page.mouse.click(640, 400); },
        () => game && game.enemies.filter((e) => e.y > 40 && e.y < innerHeight * 0.7).length >= 5, 60000);
      await h.onlyMedia();
    },
    crop: [0, 0, 0.46, 0.46],
    focus: () => {                              // le centre de l'essaim
      const e = game.enemies.filter((o) => o.y > 40 && o.y < innerHeight * 0.7), n = e.length || 1;
      return { x: e.reduce((s, o) => s + o.x, 0) / n / innerWidth, y: (e.reduce((s, o) => s + o.y, 0) / n + 60) / innerHeight };
    },
  },

  tetris: {
    dpr: 2, viewport: { width: 640, height: 1000 },
    async play(h) {
      // une partie jouée par une petite IA (un peu distraite, pour que la pile
      // monte) : chaque pièce tourne, glisse, tombe, les lignes pleines partent
      await h.js(async () => {
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const score = (mat, x) => {
          const p = { matrix: mat, pos: { x, y: 0 } };
          if (collide(board, p)) return null;
          while (!collide(board, p)) p.pos.y++;
          p.pos.y--;
          const b = board.map((r) => r.slice());
          mat.forEach((row, y) => row.forEach((v, dx) => { if (v) b[y + p.pos.y][x + dx] = v; }));
          let agg = 0, holes = 0, bump = 0, prev = null;
          for (let c = 0; c < b[0].length; c++) {
            let top = 0;
            for (let r = 0; r < b.length; r++) { if (b[r][c]) { if (!top) top = b.length - r; } else if (top) holes++; }
            agg += top; if (prev !== null) bump += Math.abs(top - prev); prev = top;
          }
          const lines = b.filter((r) => r.every(Boolean)).length;
          return -0.51 * agg + 0.76 * lines - 0.25 * holes - 0.18 * bump;
        };
        const height = () => { const i = board.findIndex((r) => r.some(Boolean)); return i < 0 ? 0 : board.length - i; };
        for (let n = 0; n < 500 && height() < board.length * 0.5; n++) {
          const moves = [];
          let mat = player.matrix.map((r) => r.slice());
          for (let rot = 0; rot < 4; rot++) {
            for (let x = -2; x < cols; x++) { const s = score(mat, x); if (s !== null) moves.push({ s, rot, x }); }
            rotate(mat, 1);
          }
          moves.sort((m1, m2) => m2.s - m1.s);
          const pick = moves[(Math.random() * Math.min(4, moves.length)) | 0];
          for (let i = 0; i < pick.rot; i++) playerRotate(1);
          for (let g = 0; player.pos.x !== pick.x && g < 60; g++) playerMove(Math.sign(pick.x - player.pos.x));
          const m = player.matrix;
          for (let g = 0; player.matrix === m && g < 400; g++) playerDrop();
          await sleep(5);
        }
      });
      await h.wait(300);
      await h.onlyMedia();
    },
    element: "canvas",
    crop: [0, 0.4, 1, 0.6],
  },

  martingale: {
    async play(h) {
      await h.wait(8000);                       // la courbe se dessine
      await h.css(".hud{visibility:hidden!important}");
    },
    element: ".chartbox",
    crop: [0.07, 0.04, 0.93, 0.9],              // sans les graduations de gauche
  },

  jobs: {
    dpr: 2,
    async play(h) {
      await h.wait(1500);
      await h.css("#map-svg text{visibility:hidden!important}");
    },
    element: "#map-svg",
    crop: [0.26, 0.12, 0.48, 0.76],
  },

  ai: { image: "/ai/julia-androide.png", crop: [0, 0.06, 1, 0.42] },
};

// -------------------------------------------------------------- outils --

const helpers = (page) => {
  const h = {
    page,
    wait: (ms) => page.waitForTimeout(ms),
    // maintenu un instant : la plupart des jeux lisent le clavier à chaque image
    async hold(key, ms = 150) { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); },
    async click(text) { await page.getByText(text, { exact: false }).first().click(); await page.waitForTimeout(1200); },
    js: (fn) => page.evaluate(fn),
    // attend qu'une condition soit vraie dans la page (en jouant entre deux essais)
    async until(pred, ms = 15000, between = () => page.waitForTimeout(200)) {
      for (const end = Date.now() + ms; Date.now() < end;) {
        if (await page.evaluate(pred).catch(() => false)) return true;
        await between();
      }
      return false;
    },
    css: (content) => page.addStyleTag({ content }),
    // ne laisse visibles que les images du projet : les HUD en HTML disparaissent
    onlyMedia: () => page.addStyleTag({ content: "*{visibility:hidden!important}canvas,video,img{visibility:visible!important}" }),
    // se déplacer de gauche à droite en tirant
    async weave(ms, fire = "Space") {
      if (fire) await page.keyboard.down(fire);
      for (let t = 0; t < ms; t += 900) {
        await h.hold((h.side = !h.side) ? "ArrowLeft" : "ArrowRight", 450);
        await page.waitForTimeout(450);
      }
      if (fire) await page.keyboard.up(fire);
    },
    async shmup(start, busy, ms = 45000) {
      await start();
      await page.waitForTimeout(1500);
      await page.keyboard.down("Space");
      await h.until(busy, ms, () => h.weave(900, null));
      await page.keyboard.up("Space");
    },
  };
  return h;
};

// PNG → 16:10 → WebP, dans le navigateur lui-même (aucune autre dépendance)
async function encode(page, png, crop = [0, 0, 1, 1], filter = "") {
  const src = "data:image/png;base64," + png.toString("base64");
  const url = await page.evaluate(async ({ src, crop, filter, W, H, QUALITY }) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    let [x, y, w, h] = crop.map((v, i) => v * (i % 2 ? img.naturalHeight : img.naturalWidth));
    const r = W / H;
    if (w / h > r) { const nw = h * r; x += (w - nw) / 2; w = nw; }
    else { const nh = w / r; y += (h - nh) / 2; h = nh; }
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const ctx = c.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    if (filter) ctx.filter = filter;
    ctx.drawImage(img, x, y, w, h, 0, 0, W, H);
    return c.toDataURL("image/webp", QUALITY);
  }, { src, crop, filter, W, H, QUALITY });
  return Buffer.from(url.split(",")[1], "base64");
}

// ---------------------------------------------------------------- prises --

const wanted = process.argv.slice(2);
const todo = wanted.length ? wanted : Object.keys(RECETTES);
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  channel: "chrome",
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--autoplay-policy=no-user-gesture-required", "--mute-audio"],
});
const blank = await browser.newPage();
let failed = 0;

for (const path of todo) {
  const r = RECETTES[path] ?? { play: (h) => h.wait(3000).then(() => h.onlyMedia()) };
  const file = join(OUT, path.replace(/\//g, "-") + ".webp");
  const ctx = await browser.newContext({ viewport: r.viewport ?? { width: 1920, height: 1200 }, deviceScaleFactor: r.dpr ?? 1 });
  try {
    let png, crop = r.crop;
    if (r.image) {
      const res = await fetch(BASE + r.image);
      if (!res.ok) throw new Error(`${r.image} : HTTP ${res.status}`);
      png = Buffer.from(await res.arrayBuffer());
    } else {
      const page = await ctx.newPage();
      if (r.init) await page.addInitScript(r.init);
      await page.goto(`${BASE}/${path}/`, { waitUntil: "load" });
      await page.waitForTimeout(2500);
      await r.play(helpers(page));
      if (r.focus) {
        const f = await page.evaluate(r.focus);
        const [, , w, hh] = r.crop;
        const at = (v, size, keep) => (v == null ? keep : Math.min(Math.max(v - size / 2, 0), 1 - size));
        crop = [at(f.x, w, r.crop[0]), at(f.y, hh, r.crop[1]), w, hh];
      }
      png = await (r.element ? page.locator(r.element).first().screenshot() : page.screenshot());
    }
    writeFileSync(file, await encode(blank, png, crop, r.filter));
    console.log(`✓ ${path} → vignettes/${path.replace(/\//g, "-")}.webp`);
  } catch (e) {
    failed++;
    console.error(`✗ ${path} : ${e.message.split("\n")[0]}`);
  }
  await ctx.close();
}

await browser.close();
process.exit(failed ? 1 : 0);
