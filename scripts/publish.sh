#!/usr/bin/env bash
# Push this repo to GitHub. Two paths:
#
#   A) You have the GitHub CLI and are logged in:
#        gh auth login        # once
#        REPO=mlbox ./scripts/publish.sh gh
#
#   B) Plain git + a personal access token (fine-grained, "Contents: read and write"):
#        GITHUB_USER=you GITHUB_TOKEN=ghp_... REPO=mlbox ./scripts/publish.sh token
#
# The repo name defaults to "mlbox" — override with REPO=.
set -euo pipefail
cd "$(dirname "$0")/.."

REPO="${REPO:-mlbox}"
MODE="${1:-auto}"

if [ "$MODE" = "auto" ]; then
  if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then MODE=gh; else MODE=token; fi
fi

echo "→ mode: $MODE, repo name: $REPO"

if [ "$MODE" = "gh" ]; then
  # create the repo on GitHub (private first; you can publicise it later) and push
  gh repo create "$REPO" --private --source=. --remote=origin --push \
    --description "Four ML tools in one static page: tokenizer lens, browser playground, no-GPU recipes, live LLM prices. No install, no API key, no GPU."
  echo "✓ pushed via gh"
else
  : "${GITHUB_USER:?set GITHUB_USER}"
  : "${GITHUB_TOKEN:?set GITHUB_TOKEN (fine-grained PAT with Contents read+write)}"
  # create the repo through the API, then push over HTTPS with the token
  curl -fsS -X POST https://api.github.com/user/repos \
    -H "Authorization: Bearer $GITHUB_TOKEN" -H "Accept: application/vnd.github+json" \
    -d "{\"name\":\"$REPO\",\"private\":true,\"description\":\"Four ML tools in one static page\"}" >/dev/null \
    || echo "(repo may already exist — continuing)"
  git remote remove origin 2>/dev/null || true
  git remote add origin "https://x-access-token:${GITHUB_TOKEN}@github.com/${GITHUB_USER}/${REPO}.git"
  git branch -M main
  git push -u origin main
  git remote set-url origin "https://github.com/${GITHUB_USER}/${REPO}.git"
  echo "✓ pushed via token"
fi

echo
echo "Then on GitHub: Settings → Pages → Deploy from branch → main → / (root) → Save."
echo "Your site will be live at: https://<you>.github.io/${REPO}/"
