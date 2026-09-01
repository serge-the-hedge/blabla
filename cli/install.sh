#!/usr/bin/env sh
set -eu

repository="${BLABLA_REPOSITORY:-serge-the-hedge/flutte}"
version="${BLABLA_VERSION:-latest}"
install_directory="${BLABLA_INSTALL_DIR:-${HOME}/.local/bin}"

case "$(uname -s)-$(uname -m)" in
  Darwin-arm64) asset="blabla-macos-arm64" ;;
  Linux-x86_64) asset="blabla-linux-x64" ;;
  *)
    echo "Blabla CLI supports macOS arm64 and Linux x64." >&2
    exit 1
    ;;
esac

if [ "$version" = "latest" ]; then
  download_url="https://github.com/${repository}/releases/latest/download/${asset}"
else
  download_url="https://github.com/${repository}/releases/download/${version}/${asset}"
fi

temporary_file="$(mktemp)"
trap 'rm -f "$temporary_file"' EXIT
curl -fsSL --retry 3 "$download_url" -o "$temporary_file"
mkdir -p "$install_directory"
chmod +x "$temporary_file"
mv "$temporary_file" "$install_directory/blabla"
trap - EXIT
echo "Installed blabla at $install_directory/blabla"
