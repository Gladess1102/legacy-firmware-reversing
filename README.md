# legacy-firmware-reversing

**A field-tested Agent Skill + DSH plugin for reverse engineering, localizing, and safely
re-flashing black-box legacy embedded firmware.**

Distilled from a multi-agent, 26-firmware-cycle live campaign against a 2004 Sharp MP-B300
(SigmaTel STMP3560 SoC · Motorola DSP56004 core · Sanyo LV24002 FM tuner) — a device with no
source code, no public flashing docs, and a vendor that no longer exists.

[中文说明（README.zh-CN.md）](./README.zh-CN.md) · [CREDITS](./CREDITS.md) · [License: MIT](./LICENSE)

---

## What's inside

```
├── SKILL.md                  Agent Skill entry (open Agent-Skills frontmatter format)
├── references/               Deep-dive guides for the five methodology pillars
│   ├── protocol_and_safe_flashing.md        BOT short-packet trap, sector-tail integrity, zero-brick gates
│   ├── font_and_resource_injection.md       24-bit resource tree, private glyph dictionary, GB2312 full injection
│   ├── dsp_and_jit_emulation.md             DSP56004 disasm, surrogate stubs, peripheral mocking, whole-memory diff
│   ├── hardware_vs_software_falsification.md  single-variable falsification, the do-a0 trap, 4-step hardware-boundary test
│   └── multi_agent_collaboration_protocol.md  PROJECT-STATE.md single-source-of-truth discipline
├── templates/
│   ├── PROJECT-STATE.template.md   multi-agent single source of truth
│   ├── EXPERIMENTS.template.md     falsification logbook discipline
│   ├── safe_flasher.py             zero-brick flashing skeleton (asserts BEFORE touching the device)
│   └── surrogate_stub.S            DSP56300 stub template (div/message-log/blanket-rts) + known landmines
├── dsh-plugin/               DSH (DeepSeek Harness) cordis plugin, zero dependencies
│   ├── lib/core.js           safety gate / twin-image diff / experiment formatter (pure functions)
│   ├── lib/index.js          cordis service registration
│   └── bin/cli.js            standalone CLI: fw-recon check|diff|log
├── case-studies/MP-B300.md   the campaign this came from
└── CREDITS.md                real-name attributions (see below)
```

## The five pillars

1. **Protocol reverse engineering with a zero-brick guarantee** — vendor SCSI commands,
   the USB BOT short-packet termination trap, flash sector-tail whitelisting,
   protected-page assertions, and a rollback chain that is *preset before every flash*.
2. **Proprietary resource-tree reconstruction & full localization** — 24-bit binary
   descriptors, glyph-ID recovery by visual anchoring, zero-growth full-charset injection
   (6,763 GB2312 glyphs injected into a Japanese font with **zero** byte-size change).
3. **Heterogeneous DSP disassembly + PC JIT emulation with surrogate stubs** — don't reverse
   the whole kernel; stub its call sites, run the extracted module on
   [xemu-project/dsp56300](https://github.com/xemu-project/dsp56300), and diff entire
   memory spaces between two critical inputs (89.9 vs 90.0 MHz → one variable).
4. **Falsification over inference** — 26 firmware cycles, every hypothesis tested by a
   single-variable change and a human-observed result; the discipline that separates
   "the cliff moved" from "the cliff is physical".
5. **Multi-agent anti-drift collaboration** — a PROJECT-STATE.md single source of truth
   with a falsification matrix, so three different AI agents (DeepSeek, Gemini, GLM)
   could relay the same campaign without repeating each other's dead ends.

## Using it

### As an Agent Skill (Claude / ZCode / any Agent-Skills-compatible harness)

Copy or symlink this repo into your skills directory, or just feed `SKILL.md` to your agent
as context when facing a black-box firmware task. The references are loaded on demand.

### As a DSH plugin

```bash
# link into DSH local-packages (see your DSH profile's cordis.patch.yml insert list)
ln -s "$PWD/dsh-plugin" ~/.dsh/profiles/desktop/local-packages/dsh-fw-recon
```

### As a standalone CLI (no DSH needed)

```bash
# safety gate before any flash — asserts size, protected pages, sector-tail whitelist
fw-recon check  --img new.bin --baseline factory.bin

# twin-image diff, sector tails stripped so code diffs stay clean
fw-recon diff   v10.bin v27.bin --strip

# falsification logbook (enforces expected-before-observed discipline)
fw-recon log    --id E27 --hypothesis "upper-limit checks gate the mute" \
                --action "NOP 2 jlt at 0x16b03/0x16b2d" \
                --expected "cliff moves above 108MHz" \
                --observed "cliff still at 90.0, boot normal" \
                --verdict falsified
```

## Results this methodology delivered (MP-B300)

- Full Chinese localization (280 UI strings + 6,763-glyph GB2312 font) with zero image growth
- 1 GB full-NAND dump and 431 MB user-music recovery
- Complete SCSI vendor-command protocol, 3-wire tuner pinout, tuning-formula and AFC-model recovery
- A definitive verdict: the 90 MHz cliff's handler lives in a **runtime-constructed RAM table** —
  out of reach of any static patch, documented with a hardware escape route

Full campaign log: `case-studies/MP-B300.md`.

## Attribution

This stands on real people's work: [mborgerson](https://github.com/xemu-project/dsp56300)
(DSP56300 JIT emulator), [Ivan Zupan](https://github.com/Rockbox/rockbox/blob/master/firmware/drivers/tuner/lv24020lp.c)
(Rockbox LV24020LP driver), the Rockbox community (hosting Sanyo's AN2400S04 appnote), and
public SigmaTel/Sanyo documentation — plus three AI agents (DSH/DeepSeek, Antigravity/Gemini,
ZCode/GLM) and one human operator who ran every experiment.
**Full real-name credits: [CREDITS.md](./CREDITS.md)** — please keep them intact in forks.

## License

MIT — see [LICENSE](./LICENSE). Not affiliated with Sharp, SigmaTel/Freescale, or Sanyo.
Vendor documents are cited, not redistributed.
