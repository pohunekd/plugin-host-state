# plugin-host-state

`moc.host-state` is a Pohunek plugin that probes the machine it runs on and
prints one `HostCapacity` JSON document: idle state and reason, seconds since
input, AC power and battery, CPU, memory, GPU, local model servers and the
configured policy window. It ships as a native Rust binary (`moc-host-state`,
version 0.6.0) with a `package-commands-v1` command named `host-state`.

## Provenance

Extracted from `pohunekd/means-of-compute` at 71f3bf3. Paths it came from:

- `crates/moc-host-state/`, `Cargo.toml`, `Cargo.lock`
- `config/plugin.json`, `config/probe.json`, `config/scenarios/`; the `package`
  section of `config/host-state.json` became `config/package.json`
- `scripts/host-state-build.ts`, `scripts/host-state-digest.ts`
- `.github/workflows/host-state-package.yml`
- `contracts/v1/host-capacity.schema.json` and the `host-capacity*.json` fixtures
- `tests/fixtures/{loginctl,macos-tools,probe}`
- `docs/host-state.md` (collector, adapter and placement parts stay there)

## Build

```sh
bun install --frozen-lockfile
bun run plugin:digest
bun run plugin:build --out <dir> --target x86_64-unknown-linux-musl   # or aarch64-apple-darwin
cargo test --locked -- --test-threads=1
```

`plugin:build` runs in a git checkout (it records `git rev-parse HEAD` in
`build.json`) and refuses to build when the source digest in
`config/package.json` does not match. See `docs/host-state.md` for the package
layout, the digest rules and the version rule.

## Install

On each host (plugin commands are local only):

```sh
pohunek plugin link <dir>
# compare the printed digest with other hosts of the same target
pohunek plugin link <dir> --yes
pohunek plugin enable moc.host-state --version 0.6.0
pohunek plugin select moc.host-state --version 0.6.0
```

The host alias is read from `/etc/means-of-compute/host.json`; see "Host
precondition" in `docs/host-state.md`.

## Output contract

The plugin prints a `HostCapacity` document that validates against
`contracts/v1/host-capacity.schema.json`. Check a document with:

```sh
dist/moc-host-state-0.6.0-<target>/bin/moc-host-state --scenario desktop-mains | bun run contract:check -
```

## License

MIT, Copyright (c) 2026 Martin Zajíc. The code was extracted from
`pohunekd/means-of-compute` at 71f3bf3 and is released here under MIT by its
author. See `LICENSE`.
