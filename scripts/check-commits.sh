#!/usr/bin/env bash
set -euo pipefail
# Validate the current branch, including its root commit. Actual merge commits
# are excluded; every ordinary commit must have a Conventional Commit subject.
pattern='^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([[:alnum:]_./-]+\))?!?: .+'
failed=0
while IFS= read -r commit; do
  subject=$(git show -s --format=%s "$commit")
  if [[ ! "$subject" =~ $pattern ]]; then
    printf 'Invalid Conventional Commit: %s %s\n' "$commit" "$subject" >&2
    failed=1
  fi
done < <(git rev-list --no-merges HEAD)
exit "$failed"
