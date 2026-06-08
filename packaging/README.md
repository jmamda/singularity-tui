# Packaging

Installer/distribution recipes for Singularity CLI.

| Platform | File | Notes |
|---|---|---|
| npm | `package.json` | `npm i -g singularity-cli` (published from CI on tag) |
| Docker | `Dockerfile` | `docker run -it singularity-cli` |
| Homebrew (tap) | `brew/Formula/singularity-cli.rb` | submit to a tap; `brew install <tap>/singularity-cli` |
| Scoop | `packaging/scoop/singularity-cli.json` | submit to a scoop bucket |
| Chocolatey | `packaging/chocolatey/*.nuspec` | `choco install singularity-cli` |
| Arch (AUR) | `packaging/aur/PKGBUILD` | submit to AUR as `singularity-cli` |
| Nix | `flake.nix` | `nix run github:owner/singularity-cli` |
| AppImage | `packaging/appimage/build.sh` | requires `appimagetool` locally |
| Debian/RPM | (TODO) | fpm-based packaging is straightforward from `dist/` |

Each release should:
1. Bump version in `package.json` + relevant manifest.
2. `npm publish` (via release workflow).
3. Update SHA in `brew/Formula/singularity-cli.rb`, `packaging/scoop/singularity-cli.json`, `packaging/aur/PKGBUILD` with the new tarball hash.
4. Submit PRs to the respective taps/repos.

The recipes are templates — replace `OWNER/REPO` placeholders with the project's GitHub coordinates after the first push.
