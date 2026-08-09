#!/usr/bin/env bash
#
# Configure la publication automatique (à lancer une fois, ré-exécutable sans risque).
#
# Pour chaque repo listé dans sites.json :
#   - dépose le secret PAGES_DISPATCH_TOKEN
#   - installe .github/workflows/publish-9mp.yml sur chaque branche publiée,
#     qui prévient 9mp.org.github.io à chaque push
# Puis, pour le repo du site :
#   - dépose le secret SITES_TOKEN (lecture des repos sources depuis la CI)
#   - bascule GitHub Pages de « deploy from branch » vers « GitHub Actions »
#
# Usage :
#   SITES_TOKEN=github_pat_xxx tools/setup-sources.sh
#
# Le PAT doit avoir : Contents=Read sur les repos sources, Contents=Read+Write
# sur 9mp.org.github.io (requis pour repository_dispatch).

set -euo pipefail

PAGES_REPO="${PAGES_REPO:-grafmik/9mp.org.github.io}"
WF_PATH=".github/workflows/publish-9mp.yml"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MANIFEST="$ROOT/sites.json"

# ------------------------------------------------------------- vérifications --
command -v gh >/dev/null || { echo "gh est requis (brew install gh)" >&2; exit 1; }
command -v jq >/dev/null || { echo "jq est requis" >&2; exit 1; }

if [ -z "${SITES_TOKEN:-}" ]; then
  echo "SITES_TOKEN est vide." >&2
  echo "Crée un fine-grained PAT sur github.com/settings/tokens?type=beta puis :" >&2
  echo "  SITES_TOKEN=github_pat_xxx $0" >&2
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "gh n'est pas authentifié : gh auth login" >&2
  exit 1
fi

if ! gh auth status 2>&1 | grep -q "workflow"; then
  echo "Le token gh n'a pas le scope 'workflow', impossible d'écrire des workflows." >&2
  echo "Lance :  gh auth refresh -s workflow" >&2
  exit 1
fi

b64() { openssl base64 -A; }
unb64() { tr -d '\n' | openssl base64 -d -A; }

WF_TMP="$(mktemp)"
trap 'rm -f "$WF_TMP"' EXIT

# --------------------------------------------------------------- repos sources --
repos="$(jq -r '.sites[].repo' "$MANIFEST" | sort -u)"

for repo in $repos; do
  branches="$(jq -r --arg r "$repo" '.sites[] | select(.repo == $r) | .ref' "$MANIFEST" | sort -u)"
  branch_list="$(printf '%s' "$branches" | tr '\n' ',' | sed 's/,$//' | sed 's/,/, /g')"

  echo "── $repo  (branches publiées : $branch_list)"

  gh secret set PAGES_DISPATCH_TOKEN --repo "$repo" --body "$SITES_TOKEN"
  echo "   secret PAGES_DISPATCH_TOKEN posé"

  # (heredoc vers un fichier : bash 3.2, celui de macOS, ne sait pas les imbriquer
  # dans une substitution de commande)
  cat > "$WF_TMP" <<EOF
# Généré par 9mp.org.github.io/tools/setup-sources.sh — ne pas éditer à la main.
# Prévient le site 9mp.org qu'il doit se reconstruire avec cette version.
name: Publier sur 9mp.org

on:
  push:
    branches: [$branch_list]
  workflow_dispatch:

jobs:
  dispatch:
    runs-on: ubuntu-latest
    steps:
      - env:
          GH_TOKEN: \${{ secrets.PAGES_DISPATCH_TOKEN }}
        run: |
          gh api -X POST repos/$PAGES_REPO/dispatches \\
            -f event_type=source-updated \\
            -f "client_payload[repo]=\$GITHUB_REPOSITORY"
EOF
  wanted="$(cat "$WF_TMP")"

  for branch in $branches; do
    current="$(gh api "repos/$repo/contents/$WF_PATH?ref=$branch" --jq .content 2>/dev/null | unb64 || true)"
    if [ "$current" = "$wanted" ]; then
      echo "   $branch : workflow déjà à jour"
      continue
    fi

    sha="$(gh api "repos/$repo/contents/$WF_PATH?ref=$branch" --jq .sha 2>/dev/null || true)"
    args=(-X PUT "repos/$repo/contents/$WF_PATH"
          -f "message=CI : prévenir 9mp.org à chaque push"
          -f "content=$(printf '%s\n' "$wanted" | b64)"
          -f "branch=$branch")
    if [ -n "$sha" ]; then args+=(-f "sha=$sha"); fi

    gh api "${args[@]}" --jq '.commit.sha' >/dev/null
    echo "   $branch : workflow installé"
  done
done

# ------------------------------------------------------------------ repo du site --
echo "── $PAGES_REPO"
gh secret set SITES_TOKEN --repo "$PAGES_REPO" --body "$SITES_TOKEN"
echo "   secret SITES_TOKEN posé"

build_type="$(gh api "repos/$PAGES_REPO/pages" --jq .build_type 2>/dev/null || echo none)"
if [ "$build_type" = "workflow" ]; then
  echo "   Pages déjà en mode GitHub Actions"
else
  gh api -X PUT "repos/$PAGES_REPO/pages" -f build_type=workflow
  echo "   Pages basculé de '$build_type' vers GitHub Actions"
fi

echo
echo "✓ Terminé. Lancer un build :  gh workflow run 'Build & deploy 9mp.org' --repo $PAGES_REPO"
