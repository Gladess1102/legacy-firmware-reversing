# Changelog

## 0.2.1 — 2026-11-04

**Two silent safety-gate bypasses closed, plus seven general defects.**

### Fixed — severe

- `bin/cli.js` `parsePages`: a bare page number (`--pages 5`) produced `[a, a)` — an empty array that silently disarmed the protected-page gate. Now `[a, a+1)`, and an empty spec is a hard error instead of a pass.
- `lib/core.js` `checkImage`: `--image-size` without `--pages` left the default protected range (876–896) entirely out of bounds and the loop broke out silently. `imageSize` overrides now require `protectedPages`, and an out-of-range protected page is an error rather than a skip.

### Fixed — general

- `protectedPages` must be an array of non-negative integers; a string used to be iterated per character (`'8' * 2048 = 16384`), protecting the wrong pages.
- Tail-violation page number derives from `sectorSize / pageSize` instead of a hardcoded 4.
- Plugin `workDir` no longer defaults to the author's Desktop path; it is unset (or `FW_RECON_WORKDIR`) and the first write refuses until configured.
- README (en/zh): the plugin registers a cordis service for other plugins via `ctx.get("fw-recon")`; it does not add tools to the model's tool list.
- CLI exit codes: `ENOENT/EACCES/EISDIR/ENOSPC/EPERM/EROFS` → 2 (was: only `ENOENT`).
- `readState()` used `this.statePath()`, which threw when destructured; state path resolution is now a module-level function, and `setSource` echoes the live `workDir`.
- README (en/zh): document that the CLI rejects the desktop profile since `0.2.1-rc.2` (use the GUI plugin page, or `pnpm` + `dsh.profile.bundles`).

### Docs

- `SKILL.md` plugin row points at the repo root, where the package now lives.

## 0.2.0 — 2026-11-04

- **Installable DSH bundle.** The cordis plugin moved from `dsh-plugin/` to the repo root; `package.json` declares `dsh.bundle.patch` and the bundled `cordis.patch.yml` mounts the plugin on install. Replaces the manual `ln -s` + profile-patch instructions with:

      dsh plugin --profile <profile> add github:Gladess1102/legacy-firmware-reversing

## 0.1.0 — 2026-10-28

- Initial public release: Agent Skill, cordis plugin, and the `fw-recon` CLI (flash-image safety gates, twin-image diff, falsification logbook).
