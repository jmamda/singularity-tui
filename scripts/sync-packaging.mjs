#!/usr/bin/env node
/**
 * Sync the version (and tarball URL/SHA where applicable) from package.json
 * into every packaging manifest, so brew/scoop/choco/AUR can't drift from the
 * published version again.
 *
 * Usage: node scripts/sync-packaging.mjs
 *
 * The tarball SHA256 can only be computed once the version exists on npm; if
 * the registry fetch fails (private package, pre-publish run, offline) the
 * existing placeholder is left in place.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { name, version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const tarballUrl = `https://registry.npmjs.org/${name}/-/${name}-${version}.tgz`;

async function tarballSha256() {
  try {
    const res = await fetch(tarballUrl);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return createHash('sha256').update(buf).digest('hex');
  } catch {
    return null;
  }
}

const sha = await tarballSha256();
if (!sha) {
  console.warn(`! ${version} not on npm yet — leaving SHA256 placeholders untouched`);
}

const edits = [
  {
    file: 'packaging/scoop/singularity-tui.json',
    apply(text) {
      const json = JSON.parse(text);
      json.version = version;
      json.url = tarballUrl;
      if (sha) json.hash = sha;
      return JSON.stringify(json, null, 2) + '\n';
    },
  },
  {
    file: 'brew/Formula/singularity-tui.rb',
    apply(text) {
      let out = text.replace(/url "https:\/\/registry\.npmjs\.org\/[^"]+"/, `url "${tarballUrl}"`);
      if (sha) out = out.replace(/sha256 "[^"]*"/, `sha256 "${sha}"`);
      return out;
    },
  },
  {
    file: 'packaging/aur/PKGBUILD',
    apply(text) {
      let out = text.replace(/^pkgver=.*$/m, `pkgver=${version}`);
      if (sha) out = out.replace(/^sha256sums=\('.*'\)$/m, `sha256sums=('${sha}')`);
      return out;
    },
  },
  {
    file: 'packaging/chocolatey/singularity-tui.nuspec',
    apply(text) {
      return text.replace(/<version>[^<]*<\/version>/, `<version>${version}</version>`);
    },
  },
];

for (const { file, apply } of edits) {
  const path = join(root, file);
  const before = readFileSync(path, 'utf8');
  const after = apply(before);
  if (after !== before) {
    writeFileSync(path, after);
    console.log(`✓ ${file} → ${version}`);
  } else {
    console.log(`· ${file} already at ${version}`);
  }
}
