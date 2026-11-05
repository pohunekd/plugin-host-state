# Host state plugin

The host probe from `crates/moc-host-state` ships to fleet hosts as a Rust `moc-host-state` binary (0.6.0) bundled as a plugin package.
A Pohunek daemon from 0.38.1 on runs the plugin as a package command
(`package-commands-v1`) on each host and carries its `HostCapacity` output back
to the coordinator. The coordinator side (collector, adapter, placement) stays in
`pohunekd/means-of-compute` and is not part of this repository.

## Package contents

`plugin:build` assembles one per-target directory:

```text
moc-host-state-<version>-<target>/
  runtime.toml                package manifest consumed by the host daemon
  bin/moc-host-state          Rust binary (crates/moc-host-state)
  config/plugin.json          fleet-wide host file path
  config/probe.json           fleet-wide probe policy and macOS tool paths
  config/scenarios/*.json     scenario inputs (tests and diagnosis only)
  build.json                  { packageId, version, command, gitCommit, sourceDigest, rustcVersion, cargoTarget, binarySha256 }
```

A per-host file such as a hostname map is never copied into the package: a
digest-pinned package is identical on every host and cannot carry a per-host fact,
and a fleet-wide hostname map would put private hostnames into a distributed artifact.

## Building and checking the digest

```sh
bun run plugin:digest
bun run plugin:build --out <dir> --target <triple>
```

`--out` and `--target` are required. `--out` must be absent or an empty
directory; the script never overwrites. `--target` is `x86_64-unknown-linux-musl`
or `aarch64-apple-darwin` and must match the build host OS (`linux` or `darwin`);
otherwise the build exits 2 before running cargo.
`plugin:build` refuses to build when `plugin:digest` does not match, so a stale
digest cannot be built.

The source digest pins the source inputs of the Rust crate: `Cargo.toml`,
`Cargo.lock`, `crates/moc-host-state/Cargo.toml`, every file under
`crates/moc-host-state/src/` (recursive), `config/plugin.json`, `config/probe.json`
and every `config/scenarios/*.json` file. The toolchain is recorded separately as
`rustcVersion` and `cargoTarget` in `build.json`.
`plugin:digest` prints the digest and exits 0 only when it equals
`sourceDigest` in `config/package.json`. It exits 2 with
`plugin:digest: <file>: include_str!/include_bytes! is not allowed` when a crate
source file matches `/\binclude_(str|bytes)\b/`, and as a fast early check with
`plugin:digest: <file>: include!/#[path] is not allowed` when a crate source file
matches `/\binclude\b/`, `/\bcfg_attr\b/` or `/#\s*!?\s*\[\s*path\b/` (text regexes cannot cover every Rust
token spelling, so the authoritative guard is the compiler's dep-info in
`plugin:build`). It also exits 2 with `plugin:digest: <file>: <key> is not allowed`
when `crates/moc-host-state/Cargo.toml` or `Cargo.toml` parsed with `Bun.TOML.parse`
has `package.build` not `false`, `lib.path` or `bin[].path` not under `src/` or containing a `..` segment, any
`dependencies`/`dev-dependencies`/`build-dependencies` (including `target.*` and
`workspace.dependencies` in the root manifest) entry with a `path` key, or the root
manifest has `patch` or `replace`, and exits 2 with `plugin:digest: <file>: cannot parse manifest` when `Bun.TOML.parse` fails. It also exits 2 with
`plugin:digest: <path> is not allowed (it changes the build outside the digest inputs)`
when any of `crates/moc-host-state/build.rs`, `.cargo/config.toml`, `.cargo/config`,
`rust-toolchain` or `rust-toolchain.toml` exists.
`plugin:build` is the authoritative guard: after a successful cargo build it reads
`<root>/target/<triple>/release/moc-host-state.d`, ignores empty and `#` lines,
takes the rule whose target is the built binary (first line with an unescaped `:` after
the target path), splits prerequisites on unescaped whitespace handling `\ `, and exits
2 with `plugin:build: <file> is not a digest input` for any prerequisite not in the
digest inputs or under `<cargoHome>/registry/src/`; a missing `.d` file exits 2 with
`plugin:build: <path>: dep-info not found` and exits 2 with `plugin:build: <path>: no rule for <builtBinary>` when no rule's target matches the built binary.

## Version rule

Any change that alters the digest must also bump `version` in `config/package.json`
and, in the coordinator repository, add the new version to its accepted versions.
The coordinator keeps old versions only while hosts are being upgraded; removing
one makes those hosts unavailable, which is the intended way to retire a build
whose idle rule is outdated.

## Host precondition

Every fleet host carries its alias in `/etc/means-of-compute/host.json`:

```json
{ "hostAlias": "laptop-a" }
```

The fleet-wide path lives in the package as `config/plugin.json`; the host file
itself stays outside the package, outside `HOME`, and outside the
digest-pinned inputs. Writing it needs `sudo` once on every host.

The host file may carry an optional `unattended` window `{ "start": "HH:MM", "end": "HH:MM" }`
in host local time, where equal values mean the whole day. Writing it needs `sudo`, like the alias. It is Linux only:
inside a host's unattended window a local login without an active graphical
session is judged by its logind idle hint instead of reporting activity
unknown. A bad value fails the plugin run (`plugin-failed`).

The plugin reads this file for a live run (never the hostname). A missing file or an invalid alias fails the plugin run,
which the coordinator reports as `plugin-failed`.

The launch `PATH` the daemon gives the plugin no longer needs `bun` for `0.6.0`,
because the package ships a native binary.

## Idle detection and agent runtime

- On Linux the probe reads the logind `IdleHint` and `IdleSinceHint` of the active local graphical session. A compositor that never sets the hint (such as sway) makes the host report recent input forever, so it is never idle. Run an idle daemon that sets the hint, for example swayidle with `idlehint 60`. `secondsSinceInput` then counts from the moment the hint was set, so the host turns idle `idleMinutes` (`config/probe.json`) plus the `idlehint` timeout after the last input: 16 minutes with `idleMinutes: 15` and `idlehint 60`.
- A local login without an active graphical session, such as a TTY-only login, reports activity unknown and is never idle. Inside a host's `unattended` window, such a login is judged by its logind idle hint instead, and the reason names the window. Remote (SSH) sessions are ignored: a host with only SSH sessions counts as logged out and can be reported idle.
- The Pohunek daemon resolves agent programs (`pi`, and `node` for the `pi` shebang) on its own process `PATH`. That `PATH` is fixed when the Pohunek service is installed (the launchd job on macOS, the systemd user manager environment on Linux). Place the agent where that `PATH` already looks, or reinstall the service after installing the agent: editing `search_path` in the service config takes effect only at a version-changing service upgrade or a reinstall.
- The daemon's version probe runs the agent with a minimal environment, so an agent wrapper script must use absolute paths instead of `$HOME`.
- Check a host with `pohunek host inspect <host> --json`: the agent's runtime entry must show `available: true`, `supported: true` and a version.

## Artifacts

Built packages are never committed (`dist/` is gitignored). The owner builds each per-target package from the package
workflow (`.github/workflows/host-state-package.yml`) via `workflow_dispatch`; only
a `workflow_dispatch` run uploads the tarballs (`actions/upload-artifact@v4` with
`if: github.event_name == 'workflow_dispatch'`). A pull request that touches the
workflow or `scripts/host-state-build.ts` only checks the build (no upload). Download
artifacts from a `workflow_dispatch` run with `gh run download`, then extract on the
host with `tar -xzf` (keeps `0755`).

Install on each host locally (plugin commands are local only; `--host` is rejected):

```sh
pohunek plugin link <dir>
# compare the printed digest with other hosts of the same target
pohunek plugin link <dir> --yes
pohunek plugin enable moc.host-state --version 0.6.0
pohunek plugin select moc.host-state --version 0.6.0
```

Rollback is `pohunek plugin select moc.host-state --version <previous>` (for example `0.5.0`).

## Rust probe

The probe lives in `crates/moc-host-state/` and is checked with `cargo fmt --all -- --check`, `cargo clippy --all-targets --locked -- -D warnings` and `cargo test --locked -- --test-threads=1` (the two tests in `tests/binary.rs` race on exec of a freshly written file when run in parallel). Behaviour notes are in `crates/moc-host-state/src/lib.rs`. Packaging uses the Rust binary as `moc-host-state-0.6.0-<target>/` with `bin/moc-host-state` and `build.json` fields `rustcVersion`, `cargoTarget` and `binarySha256`.
