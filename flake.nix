{
  description = "Singularity CLI — code-red TUI dispatcher for AI coding CLIs";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  inputs.flake-utils.url = "github:numtide/flake-utils";

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let pkgs = nixpkgs.legacyPackages.${system};
      in {
        packages.default = pkgs.buildNpmPackage {
          pname = "singularity-cli";
          version = "0.4.0";
          src = ./.;
          npmDepsHash = pkgs.lib.fakeHash; # replace with real hash via `nix-prefetch`
          nativeBuildInputs = [ pkgs.nodejs_20 ];
          installPhase = ''
            runHook preInstall
            mkdir -p $out
            cp -r dist $out/
            cp package.json $out/
            mkdir -p $out/bin
            ln -s $out/dist/cli.js $out/bin/singularity
            ln -s $out/dist/cli.js $out/bin/scli
            runHook postInstall
          '';
          meta = {
            description = "Code-red TUI dispatcher for AI coding CLIs";
            license = pkgs.lib.licenses.mit;
            mainProgram = "singularity";
            platforms = pkgs.lib.platforms.all;
          };
        };

        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [ nodejs_20 ];
        };
      });
}
