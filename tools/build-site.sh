#!/usr/bin/env bash
#
# Assemble le site complet de 9mp.org dans _site/ :
#   1. le contenu versionné ici (index.html, ai/, flat/, guillaumesync/, …)
#   2. chaque projet listé dans sites.json, cloné puis buildé au vol
#
# Usage :
#   SITES_TOKEN=<pat> tools/build-site.sh [dossier_de_sortie]
#
# SITES_TOKEN sert à cloner les repos privés en CI. En local, laisse-le vide :
# le script passe alors par SSH (git@github.com), donc par ta clé habituelle.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MANIFEST="$ROOT/sites.json"
OUT="${1:-$ROOT/_site}"

command -v jq >/dev/null    || { echo "jq est requis"    >&2; exit 1; }
command -v rsync >/dev/null || { echo "rsync est requis" >&2; exit 1; }

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# field <index> <clé> — vide si la clé est absente
field() {
  jq -r --argjson i "$1" --arg k "$2" '.sites[$i][$k] // empty' "$MANIFEST"
}

nsites="$(jq '.sites | length' "$MANIFEST")"

# ------------------------------------------------------------- contenu local --
echo "→ contenu local"
rm -rf "$OUT"
mkdir -p "$OUT"

local_excludes=(
  --exclude '/.git' --exclude '/.github' --exclude '/.gitignore'
  --exclude '/tools' --exclude '/sites.json' --exclude '/README.md'
  --exclude '/_site' --exclude '.DS_Store'
)
# Les dossiers pilotés par sites.json viennent toujours de leur repo, jamais
# d'ici — même s'il en traîne encore une copie dans l'arbre de travail.
i=0
while [ "$i" -lt "$nsites" ]; do
  local_excludes+=(--exclude "/$(field "$i" path)")
  i=$((i + 1))
done

rsync -a "${local_excludes[@]}" "$ROOT/" "$OUT/"
touch "$OUT/.nojekyll"

# ----------------------------------------------------------- projets externes --
i=0
while [ "$i" -lt "$nsites" ]; do
  path="$(field "$i" path)"
  repo="$(field "$i" repo)"
  ref="$(field "$i" ref)"
  build="$(field "$i" build)"
  output="$(field "$i" output)"
  as="$(field "$i" as)"

  echo "→ $path  ($repo@$ref)"

  if [ -n "${SITES_TOKEN:-}" ]; then
    url="https://x-access-token:${SITES_TOKEN}@github.com/$repo.git"
  else
    # Pas de token : on suppose un poste de dev avec une clé SSH GitHub.
    url="git@github.com:$repo.git"
  fi

  src="$WORK/$(printf '%s' "$path" | tr '/' '_')"
  git clone --quiet --depth 1 --branch "$ref" "$url" "$src"

  if [ -n "$build" ]; then
    ( cd "$src" && eval "$build" )
  fi

  dest="$OUT/$path"
  mkdir -p "$dest"
  from="$src/${output:-.}"

  if [ -f "$from" ]; then
    # output désigne un fichier : on le pose sous son nom de destination
    cp "$from" "$dest/${as:-$(basename "$from")}"
  else
    excludes=(--exclude '/.git' --exclude '/.github'
              --exclude '.gitignore' --exclude '.DS_Store')
    while IFS= read -r e; do
      if [ -n "$e" ]; then excludes+=(--exclude "/$e"); fi
    done < <(jq -r --argjson i "$i" '.sites[$i].exclude[]?' "$MANIFEST")
    rsync -a "${excludes[@]}" "$from/" "$dest/"
  fi

  i=$((i + 1))
done

echo "✓ $OUT prêt ($(du -sh "$OUT" | cut -f1))"
