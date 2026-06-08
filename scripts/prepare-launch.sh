#!/usr/bin/env bash
# Walks through the pre-publish checklist. Run from repo root.
# Doesn't actually publish — the release workflow handles that on tag.

set -euo pipefail

echo "── Singularity CLI — pre-launch check ──"
echo ""

step() { printf "● %s\n" "$1"; }
ok()   { printf "  \033[32m✓\033[0m %s\n" "$1"; }
warn() { printf "  \033[33m⚠\033[0m %s\n" "$1"; }
fail() { printf "  \033[31m✗\033[0m %s\n" "$1"; }

# 1. Gates
step "Build + tests"
npm run typecheck > /dev/null && ok "typecheck clean" || { fail "typecheck failed"; exit 1; }
npm test > /dev/null 2>&1 && ok "tests passing" || { fail "tests failing"; exit 1; }
npm run build > /dev/null && ok "build clean" || { fail "build failed"; exit 1; }

# 2. Files
step "Files allowlist"
ls dist/cli.js > /dev/null && ok "dist/cli.js exists"
test -x dist/cli.js && ok "dist/cli.js is executable" || warn "dist/cli.js not executable (chmod +x)"
ls README.md LICENSE PATTERNS.md CONTROL.md > /dev/null && ok "docs present"

# 3. Placeholder scan
step "Placeholder scan"
if grep -rn "OWNER/REPO" --include="*.md" --include="*.rb" --include="*.json" --include="*.yml" --include="*.ts" --include="*.tsx" --include="*.html" . | grep -v node_modules | grep -v dist | grep -v docs/internal; then
  warn "OWNER/REPO placeholders found above — replace before publish"
else
  ok "no OWNER/REPO placeholders"
fi
if grep -rn "REPLACE_WITH_TARBALL_SHA256" --include="*.rb" --include="*.json" packaging brew; then
  warn "tarball SHA placeholders — fill from \`npm pack && shasum -a 256 *.tgz\`"
else
  ok "no SHA placeholders"
fi

# 4. npm pack preview
step "npm pack preview"
npm pack --dry-run 2>&1 | grep -E "(filename|size|files)" | head -10

# 5. Version
step "Version"
ver=$(node -p "require('./package.json').version")
ok "package.json version: ${ver}"

echo ""
echo "Ready to launch:"
echo "  git tag v${ver} && git push --tags    # release workflow handles npm publish"
echo "  Then post: docs/launch/{HN,REDDIT,TWITTER,BLOG}.md"
echo "  Strategy:  docs/launch/STRATEGY.md"
