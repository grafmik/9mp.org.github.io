# 9mp.org

Site publié sur https://9mp.org via GitHub Pages.

Le site est **assemblé en CI**, pas stocké tel quel. Ce repo contient :

- le contenu dont il est la source : `index.html` (la vitrine du studio), `ai/`,
  `flat/`, `guillaumesync/`, `tetris/`, `worldtimesync/`, `CNAME`, `robots.txt` ;
- `sites.json` : la carte des projets qui vivent dans **leur propre repo** et
  sont clonés/buildés au moment de la publication ;
- `portfolio.json` : ce que la page d'accueil raconte de chaque projet ;
- `tools/build-site.sh` : l'assemblage (utilisable en local) ;
- `tools/render-home.mjs` : la grille du portfolio, régénérée à la fin du build ;
- `.github/workflows/build.yml` : build + déploiement Pages.

La page d'accueil ne se tient pas à jour à la main : à la fin du build, le
portfolio est reconstruit à partir des dossiers réellement publiés (ceux du
site assemblé et ceux de `sites.json`). Un projet oublié dans `portfolio.json`
apparaît quand même, avec le titre de sa page — et le build le signale.

## Publier

| Ce que tu modifies | Ce que tu fais |
|---|---|
| Un projet externe (`motopeter`, `hellochat`, …) | push dans **son** repo — le site se reconstruit tout seul |
| Le contenu local (`index.html`, `flat/`, …) | push ici |
| Rien ne bouge et tu veux forcer | `gh workflow run 'Build & deploy 9mp.org'` |

Aucune copie manuelle : un projet n'existe qu'à un seul endroit.

## Essayer en local

```sh
tools/build-site.sh          # assemble tout dans _site/ (clones en SSH)
python3 -m http.server -d _site 8000
```

## Ajouter un projet

Trois lignes dans `sites.json` (`path`, `repo`, `ref` ; plus `build` / `output`
/ `as` / `exclude` si besoin), puis :

```sh
SITES_TOKEN=<pat_lecture> DISPATCH_TOKEN=<pat_ecriture> tools/setup-sources.sh
```

`setup-sources.sh` est ré-exécutable sans risque : il (re)pose le secret
`PAGES_DISPATCH_TOKEN` et le workflow de notification dans chaque repo source,
et vérifie que Pages est bien en mode « GitHub Actions ».

Sa carte sur la page d'accueil apparaîtra toute seule. Pour lui écrire une
vraie présentation (titre, texte, tags, teinte, glyphe), ajoute une entrée à
`portfolio.json` — l'ordre des clés y est l'ordre d'affichage — puis :

```sh
tools/render-home.mjs        # met à jour l'index.html versionné
```

Un dossier interdit dans `robots.txt` reçoit automatiquement le tag
« non indexé » et un lien en `rel="nofollow"` : rien à déclarer ailleurs.

Pour qu'un projet reste publié **sans** figurer au portfolio, mets `"masque":
true` dans sa fiche : il garde son URL, il quitte simplement la vitrine.

## Les tokens

Deux PAT fine-grained, chacun au strict nécessaire :

| PAT | Permission | Stocké comme | Sert à |
|---|---|---|---|
| lecture | Contents = Read sur les repos sources | secret `SITES_TOKEN` ici | cloner les projets en CI |
| écriture | Contents = Read and write sur `9mp.org.github.io` | secret `PAGES_DISPATCH_TOKEN` dans chaque repo source | déclencher un build ici |

À leur expiration, le site cesse simplement de se reconstruire (l'ancien reste
servi) : régénérer les tokens et relancer `setup-sources.sh` suffit.
