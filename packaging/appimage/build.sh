#!/usr/bin/env bash
# Builds an AppImage that bundles Node + Singularity CLI for portable Linux install.
# Requires: appimagetool, node, npm.
set -euo pipefail

VERSION=$(node -p "require('./package.json').version")
APP=Singularity-${VERSION}-x86_64.AppImage
ROOT="$(mktemp -d)/AppDir"

npm run build

mkdir -p "$ROOT/usr/bin" "$ROOT/usr/lib"
cp -r dist node_modules package.json "$ROOT/usr/lib/"

cat > "$ROOT/AppRun" <<'EOF'
#!/bin/sh
HERE="$(dirname "$(readlink -f "$0")")"
exec node "$HERE/usr/lib/dist/cli.js" "$@"
EOF
chmod +x "$ROOT/AppRun"

cat > "$ROOT/singularity.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Singularity CLI
Exec=AppRun
Icon=singularity
Categories=Development;
Terminal=true
EOF

touch "$ROOT/singularity.png"   # placeholder icon

appimagetool "$ROOT" "$APP"
echo "→ $APP"
