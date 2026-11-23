#!/usr/bin/env bash
set -euo pipefail
# Run with the versions pinned in release.yml. Files contain no build timestamps
# or VCS working-tree state, so local checksums can be verified by release CI.
release_version=${1:?Usage: scripts/build-release.sh vX.Y.Z [output-directory]}
[[ "$release_version" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo 'Invalid version' >&2; exit 1; }
release_root=$(cd "$(dirname "$0")/.." && pwd)
release_output=${2:-"$release_root/dist-release"}
mkdir -p "$release_output"
release_output=$(cd "$release_output" && pwd)
(cd "$release_root/web" && npm run check)
cp "$release_root/web/dist/index.html" "$release_output/fleet-monitor-dashboard.html"
for release_target in x86_64-linux aarch64-linux x86_64-darwin aarch64-darwin; do
  case "$release_target" in x86_64-*) release_arch=amd64;; *) release_arch=arm64;; esac
  release_os=${release_target#*-}
  (cd "$release_root/collector" && GOOS="$release_os" GOARCH="$release_arch" CGO_ENABLED=0 go build -trimpath -buildvcs=false -ldflags='-s -w' -o "$release_output/fleet-monitor-$release_target" .)
done
node "$release_root/scripts/release-manifest.mjs" "$release_version" "$release_output"
