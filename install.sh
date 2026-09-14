#!/usr/bin/env bash
# Build and install the Pegboard extension (this folder → pegboard.vsix → your editor).
#
# Usage (from anywhere):
#   ./install.sh
#
# Installs into every editor CLI it can find (macOS Cursor app, `cursor` on PATH,
# `code` on PATH). To target one editor only:
#   PEGBOARD_INSTALL_CLI=code ./install.sh
#   PEGBOARD_INSTALL_CLI=/path/to/cursor ./install.sh
set -euo pipefail

EXT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VSIX_PATH="$EXT_DIR/pegboard.vsix"

# Node via nvm if present; harmless if npm is already on PATH.
export NVM_DIR="$HOME/.nvm"
for f in /opt/homebrew/opt/nvm/nvm.sh /usr/local/opt/nvm/nvm.sh "$HOME/.nvm/nvm.sh"; do
  [[ -s "$f" ]] && { . "$f"; break; }
done
type nvm >/dev/null 2>&1 && nvm use 20.19.0 >/dev/null 2>&1 || true
command -v npm >/dev/null 2>&1 || { echo "install.sh: npm not found (install Node 20 via nvm)" >&2; exit 1; }

collect_install_clis() {
  local -a clis=()
  if [[ -n "${PEGBOARD_INSTALL_CLI:-}" ]]; then
    clis+=("$PEGBOARD_INSTALL_CLI")
  else
    local mac_cursor="/Applications/Cursor.app/Contents/Resources/app/bin/cursor"
    [[ -x "$mac_cursor" ]] && clis+=("$mac_cursor")
    if command -v cursor >/dev/null 2>&1; then
      local p; p="$(command -v cursor)"
      [[ "$p" != "$mac_cursor" ]] && clis+=("$p")
    fi
    command -v code >/dev/null 2>&1 && clis+=("$(command -v code)")
  fi
  printf '%s\n' "${clis[@]}"
}

INSTALL_CLIS=()
while IFS= read -r cli; do [[ -n "$cli" ]] && INSTALL_CLIS+=("$cli"); done < <(collect_install_clis)
if [[ ${#INSTALL_CLIS[@]} -eq 0 ]]; then
  echo "install.sh: no Cursor/VS Code CLI found; set PEGBOARD_INSTALL_CLI to the full path of \`code\` or \`cursor\`." >&2
  exit 1
fi

echo "install.sh: extension dir=$EXT_DIR"
echo "install.sh: editors: ${INSTALL_CLIS[*]}"

cd "$EXT_DIR"
if [[ ! -d node_modules ]]; then
  echo "install.sh: npm install…"
  npm install --no-audit --no-fund
fi
echo "install.sh: npm test (parser)…"
npm test --silent 2>&1 | grep -E "^# (pass|fail)" || true
echo "install.sh: npm run package…"
npm run package --silent 2>&1 | grep -E "DONE|ERR|error" || true
[[ -f "$VSIX_PATH" ]] || { echo "install.sh: packaging failed — no $VSIX_PATH" >&2; exit 1; }

failures=0
for cli in "${INSTALL_CLIS[@]}"; do
  if "$cli" --install-extension "$VSIX_PATH" --force >/dev/null 2>&1; then
    echo "install.sh: ✓ installed via $cli"
  else
    echo "install.sh: ✗ failed for $cli" >&2; (( failures++ )) || true
  fi
done

echo ""
if [[ $failures -eq 0 ]]; then
  echo "Done. Reload each editor: Command Palette → \"Developer: Reload Window\"."
else
  echo "Done with $failures install failure(s)."
fi
echo "VSIX: $VSIX_PATH"
[[ $failures -eq 0 ]]
