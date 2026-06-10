# Homebrew formula template. After publishing to npm, the tarball URL + SHA
# below need to be regenerated for each release:
#
#   curl -sL https://registry.npmjs.org/singularity-tui | jq -r '.versions["VERSION"].dist.tarball'
#   curl -sL <tarball> | shasum -a 256
#
# Then update VERSION, url, and sha256, and `brew bump-formula-pr`.
class SingularityTui < Formula
  desc "Code-red TUI dispatcher for AI coding CLIs"
  homepage "https://github.com/jmamda/singularity-tui"
  url "https://registry.npmjs.org/singularity-tui/-/singularity-tui-0.7.1.tgz"
  sha256 "b598360282a3af4773d8890bc2f8b2c3c002da37a93d09f69d0bb7f84d5a06b9"
  license "MIT"

  depends_on "node"

  def install
    system "npm", "install", *Language::Node.std_npm_install_args(libexec)
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  test do
    assert_match "Singularity", shell_output("#{bin}/singularity help")
  end
end
