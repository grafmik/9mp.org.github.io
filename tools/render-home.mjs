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
const fallbackCat = portfolio.categories.at(-1).id;

const projets = paths.map((path, i) => {
  const meta = portfolio.projets[path];
  if (!meta) {
    console.warn(`  ! ${path} n'a pas de fiche dans portfolio.json (carte par défaut)`);
  }
  const cat = cats.has(meta?.cat) ? meta.cat : fallbackCat;
  return {
    path,
    num: pad(i + 1),
    cat,
    badge: meta?.badge ?? cats.get(cat).badge,
    hue: meta?.hue ?? hueOf(path),
    glyphe: meta?.glyphe ?? "✧",
    titre: meta?.titre ?? titleOf(path),
    texte: meta?.texte ?? "Tout juste publié sur 9mp.org — présentation à venir.",
    tags: meta?.tags ?? [],
    prive: blocked.has(path),
  };
});

// ------------------------------------------------------------------- rendu --

const carte = (p) => {
  const tags = [...p.tags, ...(p.prive ? ["Non indexé"] : [])];
  return `      <article class="card rv" data-cat="${p.cat}" style="--h:${p.hue}">
        <a href="/${p.path}/"${p.prive ? ' rel="nofollow"' : ""}>
          <div class="sigil" aria-hidden="true">${esc(p.glyphe)}</div>
          <div>
            <div class="c-meta"><span class="mono num">${p.num}</span><span class="badge">${esc(p.badge)}</span></div>
            <h3>${esc(p.titre)}</h3>
            <p>${rich(p.texte)}</p>${
    tags.length
      ? `\n            <ul class="tags">${tags.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>`
      : ""
  }
          </div>
          <span class="arrow" aria-hidden="true">↗</span>
        </a>
      </article>`;
};

const bouton = (id, label, n, actif) =>
  `      <button type="button" data-filter="${id}" aria-pressed="${actif}">${esc(label)} <span class="count">${pad(n)}</span></button>`;

const filtres = [
  bouton("all", "Tout", projets.length, true),
  ...portfolio.categories
    .map((c) => [c, projets.filter((p) => p.cat === c.id).length])
    .filter(([, n]) => n > 0)
    .map(([c, n]) => bouton(c.id, c.label, n, false)),
].join("\n");

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

remplace("projets", projets.map(carte).join("\n\n"));
remplace("filtres", filtres);
html = html.replace(/(<b data-auto="total">)[^<]*(<\/b>)/, `$1${projets.length}$2`);

writeFileSync(page, html);
console.log(`✓ ${page} — ${projets.length} projets`);
