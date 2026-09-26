#!/usr/bin/env node
//
// Régénère la grille du portfolio dans index.html à partir de ce qui est
// réellement publié — pour qu'un projet ajouté à sites.json apparaisse en
// page d'accueil sans que personne ait à y penser.
//
// Usage :
//   tools/render-home.mjs [dossier]     (défaut : la racine du dépôt)
//
// Le dossier passé en argument est à la fois la source (ses sous-dossiers
// sont les projets) et la cible (son index.html est réécrit entre les
// balises <!-- auto:… -->). build-site.sh l'appelle sur _site/ ; on peut
// aussi le lancer sur le dépôt pour garder l'index.html versionné à jour.

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = resolve(process.argv[2] ?? ROOT);

// Dossiers de travail : jamais des projets.
const IGNORE = new Set(["tools", "node_modules"]);

const read = (p) => readFileSync(p, "utf8");
const json = (p) => JSON.parse(read(p).replace(/^﻿/, ""));
const pad = (n) => String(n).padStart(2, "0");

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// *entre astérisques* → italique, le reste échappé
const rich = (s) =>
  esc(s).replace(/\*([^*]+)\*/g, "<em>$1</em>");

// Teinte de repli, stable pour un nom donné.
const hueOf = (name) => {
  let h = 0;
  for (const c of name) h = (h * 31 + c.codePointAt(0)) % 360;
  return h;
};

// ------------------------------------------------------------- les projets --

const portfolio = json(join(ROOT, "portfolio.json"));
const sites = json(join(ROOT, "sites.json"));

// Un projet = un dossier publié qui a une page. On le découvre soit sur le
// disque, soit dans sites.json (le dossier n'existe que dans le site assemblé).
const dirs = readdirSync(DIR, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .filter((n) => !n.startsWith(".") && !n.startsWith("_") && !IGNORE.has(n))
  .filter((n) => existsSync(join(DIR, n, "index.html")));

// Les projets masqués restent publiés : ils sortent seulement de la vitrine.
const paths = [...new Set([...dirs, ...sites.sites.map((s) => s.path)])]
  .filter((p) => !portfolio.projets[p]?.masque);

// Ordre d'affichage : celui de portfolio.json, les inconnus à la suite.
const known = Object.keys(portfolio.projets);
paths.sort((a, b) => {
  const ia = known.indexOf(a), ib = known.indexOf(b);
  if (ia === -1 && ib === -1) return a.localeCompare(b, "fr");
  if (ia === -1) return 1;
  if (ib === -1) return -1;
  return ia - ib;
});

// --------------------------------------------------------- les désindexés --

// robots.txt fait foi : ce qui y est interdit ne se fait pas suivre non plus.
const robotsFile = [join(DIR, "robots.txt"), join(ROOT, "robots.txt")].find(existsSync);
const blocked = new Set(
  (robotsFile ? read(robotsFile) : "")
    .split("\n")
    .map((l) => l.match(/^\s*Disallow:\s*\/(.+?)\/?\s*$/i)?.[1])
    .filter(Boolean)
);

// Titre de repli : celui de la page du projet.
const titleOf = (path) => {
  const file = join(DIR, path, "index.html");
  const raw = existsSync(file) ? read(file).match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] : null;
  if (!raw) return path;
  return raw
    .replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"')
    .split(/\s+[—|–|-]\s+/)[0]
    .trim() || path;
};

const cats = new Map(portfolio.categories.map((c) => [c.id, c]));

// Vignette : l'image vignettes/<chemin>.webp, si elle existe (les « / » du
// chemin deviennent des « - »). tools/capture-vignettes.mjs la fabrique ;
// une image posée à la main fait aussi bien l'affaire.
const vignetteOf = (path) => {
  const rel = `vignettes/${path.replace(/\//g, "-")}.webp`;
  return existsSync(join(DIR, rel)) ? `/${rel}` : null;
};
const fallbackCat = portfolio.categories.at(-1).id;

// Une fiche qui déclare des "versions" donne une carte par version : même
// projet, un modèle par carte.
const fiches = paths.flatMap((path) => {
  const meta = portfolio.projets[path];
  if (!meta?.versions?.length) return [{ path, meta }];
  return meta.versions.map((v) => ({
    path: [path, v.chemin].filter(Boolean).join("/"),
    racine: path,
    meta: { ...meta, ...v },
  }));
});

// Une fiche qui déclare "apres" se range juste après la carte de ce chemin
// (utile pour intercaler une version entre deux projets distincts).
for (const f of fiches.filter((f) => f.meta?.apres)) {
  const cible = fiches.findIndex((g) => g.path === f.meta.apres);
  if (cible === -1) { console.warn(`  ! ${f.path} : "apres" inconnu (${f.meta.apres})`); continue; }
  fiches.splice(fiches.indexOf(f), 1);
  fiches.splice(fiches.findIndex((g) => g.path === f.meta.apres) + 1, 0, f);
}

const projets = fiches.map(({ path, racine, meta }, i) => {
  if (!meta) {
    console.warn(`  ! ${path} n'a pas de fiche dans portfolio.json (carte par défaut)`);
  }
  const cat = cats.has(meta?.cat) ? meta.cat : fallbackCat;
  return {
    path,
    num: pad(i + 1),
    cat,
    hue: meta?.hue ?? hueOf(path),
    vignette: vignetteOf(path),
    titre: meta?.titre ?? titleOf(path),
    texte: meta?.texte ?? "Tout juste publié sur 9mp.org — présentation à venir.",
    modele: meta?.modele ?? null,
    prive: blocked.has(racine ?? path),
  };
});

// ------------------------------------------------------------------- rendu --

// Une ligne de l'écran de sélection, sa vignette en fond. Le script de la
// page y lit aussi de quoi construire l'affiche du projet (image, teinte,
// modèle, texte).
const carte = (p) => `        <li class="w${p.vignette ? "" : " sans-image"}" data-cat="${p.cat}" style="--h:${p.hue}">
          <a href="/${p.path}/"${p.prive ? ' rel="nofollow"' : ""}>${p.vignette ? `
            <img class="w-img" src="${p.vignette}" alt="" width="1200" height="750" loading="lazy" decoding="async">` : ""}
            <span class="w-t"><span>${esc(p.titre)}</span></span>${p.modele ? `
            <span class="w-m">${esc(p.modele)}</span>` : ""}
            <span class="w-d">${rich(p.texte)}</span>
            <span class="w-n" aria-hidden="true">${p.num}</span>
          </a>
        </li>`;

// ----------------------------------------------------------- réécriture --

const page = join(DIR, "index.html");
let html = read(page);

const remplace = (nom, contenu) => {
  // L'indentation de la balise ouvrante est rendue à la fermante.
  const re = new RegExp(`( *)(<!-- auto:${nom} -->)[\\s\\S]*?<!-- /auto:${nom} -->`);
  if (!re.test(html)) {
    console.error(`index.html : balises <!-- auto:${nom} --> introuvables`);
    process.exit(1);
  }
  html = html.replace(re, (_, indent, ouvrante) =>
    `${indent}${ouvrante}\n${contenu}\n${indent}<!-- /auto:${nom} -->`);
};

remplace("projets", projets.map(carte).join("\n"));
const sans = projets.filter((p) => !p.vignette).map((p) => p.path);
if (sans.length) console.warn(`  ! sans vignette : ${sans.join(", ")} (tools/capture-vignettes.mjs)`);
html = html.replace(/(<b data-auto="total">)[^<]*(<\/b>)/g, `$1${projets.length}$2`);

writeFileSync(page, html);
console.log(`✓ ${page} — ${projets.length} projets`);
