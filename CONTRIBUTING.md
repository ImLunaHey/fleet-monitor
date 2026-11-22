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

Run Go tests/vet in `collector`, and `npm ci`, `npm test`, and `npm run build`
in `web`. Preserve the established layout and spacing when changing components;
keep missing readings distinct from real zero values. Never add host addresses,
credentials, or private machine configuration to this repository.
