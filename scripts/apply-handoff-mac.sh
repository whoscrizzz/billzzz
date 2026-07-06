#!/usr/bin/env bash
# Aplica en ~/Projects/bills-pwa el handoff PR #31 (rama o main tras merge).
# Uso: ./scripts/apply-handoff-mac.sh
set -euo pipefail

REPO="${BILLS_PWA_ROOT:-$HOME/Projects/bills-pwa}"
BRANCH="${BILLS_PWA_BRANCH:-main}"
REMOTE="${BILLS_PWA_REMOTE:-origin}"
FALLBACK_BRANCH="cursor/bills-pwa-improvements-0d18"

if [[ ! -d "$REPO/.git" ]]; then
  echo "No existe repo en $REPO"
  echo "Clona: git clone https://github.com/whoscrizzz/bills-pwa.git \"$REPO\""
  exit 1
fi

cd "$REPO"

echo "== bills-pwa handoff apply =="
echo "Repo: $REPO"
git fetch "$REMOTE" main "$FALLBACK_BRANCH" 2>/dev/null || git fetch "$REMOTE" main

apply_branch() {
  local target="$1"
  if git show-ref -q "refs/remotes/$REMOTE/$target"; then
    if git rev-parse --verify "$target" >/dev/null 2>&1; then
      git checkout "$target"
    else
      git checkout -b "$target" "$REMOTE/$target"
    fi
    return 0
  fi
  return 1
}

# Estrategia A: main (tras merge del PR)
if apply_branch "$BRANCH"; then
  if ! git merge-base --is-ancestor "$REMOTE/$BRANCH" HEAD 2>/dev/null; then
    git pull "$REMOTE" "$BRANCH" --no-rebase || {
      echo "Pull con conflictos. Opciones:"
      echo "  git stash -u && git pull $REMOTE $BRANCH && git stash pop"
      echo "  git pull $REMOTE $BRANCH -X theirs   # priorizar remoto"
      exit 1
    }
  else
    git pull "$REMOTE" "$BRANCH" --ff-only || git pull "$REMOTE" "$BRANCH" --no-rebase
  fi
# Estrategia B: rama del PR si main aún no está actualizado
elif apply_branch "$FALLBACK_BRANCH"; then
  echo "Usando rama $FALLBACK_BRANCH (main remoto puede estar atrás)."
  git pull "$REMOTE" "$FALLBACK_BRANCH" --no-rebase || true
  if ! git merge "$REMOTE/main" --no-edit 2>/dev/null; then
    echo "Conflictos merge main←rama. Resuelve archivos marcados, luego:"
    echo "  git add -A && git merge --continue"
    echo "O abortar: git merge --abort && git checkout main && git pull $REMOTE main"
    exit 1
  fi
else
  echo "No se encontró main ni $FALLBACK_BRANCH en $REMOTE"
  exit 1
fi

if command -v fnm >/dev/null 2>&1; then
  eval "$(fnm env)"
elif [[ -s "$HOME/.nvm/nvm.sh" ]]; then
  # shellcheck source=/dev/null
  source "$HOME/.nvm/nvm.sh"
fi
if [[ -f .nvmrc ]]; then
  nvm use 2>/dev/null || true
fi

echo "== npm ci =="
rm -rf node_modules
npm ci

echo "== validate =="
npm run validate

echo "== build =="
npm run build

echo ""
echo "Listo. Dev:"
echo "  npm run dev:api   # :8787"
echo "  npm run dev       # :5173"
echo "Handoff: docs/handoff/2026-07-06-pr31-cursor-chat.md"
