# Homebrew formula template. After publishing to npm, the tarball URL + SHA
# below need to be regenerated for each release:
#
#   curl -sL https://registry.npmjs.org/singularity-cli | jq -r '.versions["VERSION"].dist.tarball'
#   curl -sL <tarball> | shasum -a 256
#
# Then update VERSION, url, and sha256, and `brew bump-formula-pr`.
class SingularityCli < Formula
  desc "Code-red TUI dispatcher for AI coding CLIs"
  homepage "https://github.com/singularity-cli/singularity-cli"
  url "https://registry.npmjs.org/singularity-cli/-/singularity-cli-0.3.0.tgz"
  sha256 "REPLACE_WITH_TARBALL_SHA256"
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
