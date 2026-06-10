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
  url "https://registry.npmjs.org/singularity-tui/-/singularity-tui-0.7.0.tgz"
  sha256 "f359c03ab74c628acc3f40cd225e825c3019f3b04d76d9fe7b69b715c2874a48"
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
