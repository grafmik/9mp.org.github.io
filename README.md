# 9mp.org

Site publié sur https://9mp.org via GitHub Pages.

Le site est **assemblé en CI**, pas stocké tel quel. Ce repo contient :

- le contenu dont il est la source : `index.html`, `ai/`, `flat/`,
  `guillaumesync/`, `worldtimesync/`, `CNAME`, `robots.txt` ;
- `sites.json` : la carte des projets qui vivent dans **leur propre repo** et
  sont clonés/buildés au moment de la publication ;
- `tools/build-site.sh` : l'assemblage (utilisable en local) ;
- `.github/workflows/build.yml` : build + déploiement Pages.

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

## Les tokens

Deux PAT fine-grained, chacun au strict nécessaire :

| PAT | Permission | Stocké comme | Sert à |
|---|---|---|---|
| lecture | Contents = Read sur les repos sources | secret `SITES_TOKEN` ici | cloner les projets en CI |
| écriture | Contents = Read and write sur `9mp.org.github.io` | secret `PAGES_DISPATCH_TOKEN` dans chaque repo source | déclencher un build ici |

À leur expiration, le site cesse simplement de se reconstruire (l'ancien reste
servi) : régénérer les tokens et relancer `setup-sources.sh` suffit.
