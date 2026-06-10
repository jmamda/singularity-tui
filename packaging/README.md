# Packaging

Installer/distribution recipes for Singularity CLI.

| Platform | File | Notes |
|---|---|---|
| npm | `package.json` | `npm i -g singularity-tui` (published from CI on tag) |
| Docker | `Dockerfile` | `docker run -it singularity-tui` |
| Homebrew (tap) | `brew/Formula/singularity-tui.rb` | submit to a tap; `brew install <tap>/singularity-tui` |
| Scoop | `packaging/scoop/singularity-tui.json` | submit to a scoop bucket |
| Chocolatey | `packaging/chocolatey/*.nuspec` | `choco install singularity-tui` |
| Arch (AUR) | `packaging/aur/PKGBUILD` | submit to AUR as `singularity-tui` |
| Nix | `flake.nix` | `nix run github:owner/singularity-tui` |
| AppImage | `packaging/appimage/build.sh` | requires `appimagetool` locally |
| Debian/RPM | (TODO) | fpm-based packaging is straightforward from `dist/` |

Each release should:
1. Bump version in `package.json` + relevant manifest.
2. `npm publish` (via release workflow).
3. Update SHA in `brew/Formula/singularity-tui.rb`, `packaging/scoop/singularity-tui.json`, `packaging/aur/PKGBUILD` with the new tarball hash.
4. Submit PRs to the respective taps/repos.

The recipes are templates — replace `OWNER/REPO` placeholders with the project's GitHub coordinates after the first push.
