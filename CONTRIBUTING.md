# Contributing

Use [Conventional Commits](https://www.conventionalcommits.org/) for every
ordinary commit and pull request title:

```text
feat(gpu): add a sensor reader
fix(dashboard): preserve history across a missed poll
test(zfs): cover missing replacement drives
docs(nix): explain agent access restrictions
```

Accepted types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`,
`build`, `ci`, `chore`, and `revert`. A scope is optional. Mark a breaking change
with `!` after the type/scope and explain it in the commit body.

Run `scripts/check-commits.sh` before pushing; CI checks commit messages and
pull request titles. Normal merge commits are excluded from the history check.

Run Go tests/vet in `collector`, and `npm ci` followed by `npm run check`
in `web`. The dashboard uses strict TypeScript, Oxlint with React Doctor rules,
Oxfmt, and Vitest/Testing Library. `npm run format` fixes formatting; the check
command runs typechecking, linting, formatting verification, coverage, and the
production build. Coverage requires at least 90% statements, functions, and
lines, and 85% branches per source file. Test user-visible behavior, including
unknown and stale telemetry, rather than snapshotting component internals.
Preserve the established layout and spacing when changing components;
keep missing readings distinct from real zero values. Never add host addresses,
credentials, or private machine configuration to this repository.
