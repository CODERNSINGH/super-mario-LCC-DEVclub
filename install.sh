#!/usr/bin/env bash
# Sakai IDE installer (macOS, Apple Silicon).
#   curl -fsSL https://raw.githubusercontent.com/CODERNSINGH/super-mario-LCC-DEVclub/main/install.sh | bash
# Files fetched with curl are not marked "downloaded from the internet", so macOS Gatekeeper does not block the
# (not-yet-notarized) app. Testing overrides: SAKAI_DMG=/path/to.dmg  INSTALL_DIR=/some/dir  SAKAI_NO_OPEN=1
set -euo pipefail

REPO="CODERNSINGH/super-mario-LCC-DEVclub"
APP="Sakai IDE.app"
INSTALL_DIR="${INSTALL_DIR:-/Applications}"
say() { printf '\033[1m%s\033[0m\n' "$*"; }
die() { printf '\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(uname -s)" = "Darwin" ] || die "Sakai IDE is a macOS app."
[ "$(uname -m)" = "arm64" ] || die "This build is for Apple Silicon (M1 or newer). Build from source instead: git clone https://github.com/$REPO && cd super-mario-LCC-DEVclub && make setup && make run"

tmp="$(mktemp -d)"; trap 'hdiutil detach "$MP" -quiet >/dev/null 2>&1 || true; rm -rf "$tmp"' EXIT; MP=""
DMG="${SAKAI_DMG:-}"
if [ -z "$DMG" ]; then
  say "Finding the latest Sakai IDE release…"
  URL="$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" | grep -Eo '"browser_download_url": *"[^"]+arm64\.dmg"' | head -1 | cut -d'"' -f4 || true)"
  [ -n "$URL" ] || die "No downloadable release found yet. Build from source:  make install-app"
  say "Downloading $(basename "$URL")…"
  curl -fL --progress-bar "$URL" -o "$tmp/sakai.dmg"; DMG="$tmp/sakai.dmg"
fi

say "Installing to ${INSTALL_DIR}…"
MP="$(hdiutil attach -nobrowse -readonly "$DMG" | tail -1 | awk -F'\t' '{print $NF}')"
[ -d "$MP/$APP" ] || die "The installer image does not contain $APP"
mkdir -p "$INSTALL_DIR"; rm -rf "$INSTALL_DIR/$APP"; cp -R "$MP/$APP" "$INSTALL_DIR/"
xattr -cr "$INSTALL_DIR/$APP" 2>/dev/null || true
say "✓ Installed: $INSTALL_DIR/$APP   (search “Sakai IDE” in Spotlight)"
[ -n "${SAKAI_NO_OPEN:-}" ] || open "$INSTALL_DIR/$APP"
