#!/usr/bin/env bash
set -euo pipefail
release_tag=${1:?Usage: scripts/publish-release.sh vX.Y.Z [artifact-directory]}
[[ "$release_tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo 'Invalid version' >&2; exit 1; }
release_directory=${2:-dist-release}
release_draft=$(gh release view "$release_tag" --json isDraft --jq .isDraft)
release_existing=$(gh release view "$release_tag" --json assets --jq '.assets[].name')
release_temp=$(mktemp -d)
trap 'rm -rf "$release_temp"' EXIT
# A failed upload can be retried without replacing any published bytes.
for release_name in fleet-monitor-dashboard.html fleet-monitor-x86_64-linux fleet-monitor-aarch64-linux fleet-monitor-x86_64-darwin fleet-monitor-aarch64-darwin release.json SHA256SUMS; do
  if printf '%s\n' "$release_existing" | grep -Fxq "$release_name"; then
    gh release download "$release_tag" --pattern "$release_name" --dir "$release_temp"
    cmp "$release_directory/$release_name" "$release_temp/$release_name"
  else
    [[ "$release_draft" == true ]] || { echo "Published release is missing $release_name; refusing to modify it" >&2; exit 1; }
    gh release upload "$release_tag" "$release_directory/$release_name"
  fi
done
if [[ "$release_draft" == true ]]; then
  gh release edit "$release_tag" --draft=false --latest
fi
