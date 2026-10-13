# Named environments (`gentle-shell envs` / `--env`)

## Objective
Let the user declare named, isolated agent homes ("envs") and pick one to open a session in, either directly (`gentle-shell --env <name>`) or from a full-terminal manager (`gentle-shell envs`).

## Problem and why
Today a separate home needs `--home <path>` every time, with no registry, no names, and no way to see what each home holds. Users juggling work/personal/client setups want named envs plus a manager.

## Decisions (user, 2026-05)
- Surface: `gentle-shell envs` subcommand (TUI on a TTY, plain list otherwise) plus `--env <name>` launch flag.
- Storage: managed directories `~/.gentle-shell/envs/<name>/` (override root with `GENTLE_SHELL_ENVS_DIR`); the directory is the registry.
- v1 TUI scope: list/create/rename/delete, launch + set default, per-env info (provisioning, packages, auth providers, sessions), setup/install/auth actions.
- Delivery: local prototype on branch `feat/named-envs` in worktree `../gentle-shell-envs` (from origin/main a3a268ec3). No remote action authorized.

## Design
- An env is an ordinary `path` home; `ResolvedHome` gains an optional `env` name so remediation and resume hints reproduce `--env <name>`.
- `--env` is mutually exclusive with `--link`, `--isolated`, `--home`. An unknown env fails with a hint instead of silently creating a typo'd home.
- Names: lowercase `[a-z0-9][a-z0-9._-]{0,39}`, never `.`/`..`.
- Default env reuses the persisted `home` config key (the env dir path); a config path inside the envs root resolves back to its env name.
- Rename/delete keep `config.json` coherent: `provisioned` keys and the default `home` follow the env; deleting requires typing the env name.
- TUI is dependency-free (ANSI + raw stdin) so it works whichever Pi runtime is resolved: pure state/reducer/renderer in `lib/gentle-shell-envs.ts`, IO in `bin/gentle-shell.mjs`.
- Auth info lists provider ids only, never credential values.

## Tasks
- [x] T1 — Pure env model and argument parsing (`--env`, `envs`), config mutations. Test-first (RED: module missing → GREEN 16 tests).
- [x] T2 — Pure TUI reducer and renderer. Test-first (RED: module missing → GREEN 14 tests).
- [x] T3 — Bin wiring: `--env`, `envs [list|new <name>]`, TUI IO loop (serialized input queue) and actions; 4 bin integration tests.
- [x] T4 — Docs (`readme-reference.md` Named envs section), help text, runtime modules regenerated and `--check` clean.

## Delivery and review workload
- Forecast ~900 authored lines; over 400, so a future upstream PR would need chaining (T1+T3 launch flag, then T2 TUI) or a size exception. Local prototype only for now.

## Evidence and progress
- PTY smoke via `script` against a temp HOME: create, set default, rename (default + config follow), delete with typed confirmation (wrong name rejected, config cleaned), enter launches pi with `PI_CODING_AGENT_DIR=<env dir>`, `i` runs `install` in the env and returns to the manager.
- Found and fixed during smoke: pty reporting 0x0 size rendered a blank screen (fallback to 80x24).
- User report: setup from the manager looked hung in a fresh worktree (package-local gentle-ai v4.1.1 missing, ~18 KB/s download with no output). Added TTY-only download progress (installer `onProgress`, `scripts/download-progress.mjs`) plus a Ctrl-C hint; verified in a pty with a simulated installer (bar to 100%, cleared, then the usual line) and unchanged non-TTY output.
- Active env in the session UI: GENTLE_SHELL_ENV from the launcher (cleared for non-env homes); header `env <name>` after the brand in every stage, Status card `Env <name>`. Verified in a real Pi 1.2.0 session in a pty (both visible). tests/gentle-shell.test.ts has 14 pre-existing failures, the same count with and without this change.
- Standalone (bundled) install: an end-to-end bundled-prefix test covers envs new/list, `--env` through the bundled Pi with GENTLE_SHELL_ENV set, the unlabelled default home, and self-uninstall keeping envs. Uninstall plans list the envs root as "your named envs" and refuse overlapping removals; this fixed a real gap where GENTLE_SHELL_HOME pointing into an env could be removed. 414 related tests pass.
- Known limits: the bundled `node_modules` pi is 1.0.0 (< required 1.2.0), so manual smoke used `GENTLE_SHELL_PI=~/.pi/agent/bin/pi`; `pnpm` refuses in the symlinked worktree, scripts run with `node` directly; Windows TTY path untested.
- Explored `lib/gentle-shell-launcher.ts` (parse/resolve/config), `bin/gentle-shell.mjs` (main flow, home bootstrap, auto-provision, setup), docs `readme-reference.md` launcher section.
