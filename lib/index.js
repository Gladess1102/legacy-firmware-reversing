// dsh-fw-recon — DSH (DeepSeek Harness) cordis plugin host half.
//
// Registers a lightweight service that makes the recon toolkit discoverable
// from inside a DSH session, and keeps a session-scoped pointer to the
// project's PROJECT-STATE.md / EXPERIMENTS.md so the agent can append
// falsification-experiment entries without re-deriving the discipline.
//
// Cordis entry: named exports name / inject / apply (no default export),
// following the local-plugin conventions of dsh-web-search-tavily and
// session-archive-manager.
//
// SPDX-License-Identifier: MIT

import { existsSync, readFileSync, appendFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { checkImage, diffImages, formatExperiment } from "./core.js";

export const name = "fw-recon";

/** No hard service dependencies; everything is optional. */
export const inject = [];

const DEFAULT_STATE = {
  /** Directory holding PROJECT-STATE.md / EXPERIMENTS.md / artifacts. */
  workDir: join(homedir(), "Desktop", "legacy-firmware-reversing"),
};

export function apply(ctx) {
  const cfg = { ...DEFAULT_STATE };

  ctx.inject(["logger"], ({ logger }) => {
    logger.info(`[fw-recon] ready (workDir: ${cfg.workDir})`);
  });

  /**
   * Public surface for other code in the session:
   *   const fw = ctx.get("fw-recon");
   *   fw.check(imgPath, baselinePath)  -> { ok, problems, summary }
   *   fw.diff(aPath, bPath, opts)      -> { bytes, regions }
   *   fw.logExperiment(entry)          -> appends to EXPERIMENTS.jsonl
   *   fw.statePath()                   -> PROJECT-STATE.md absolute path
   */
  ctx.provide("fw-recon", {
    check(imgPath, baselinePath, opts) {
      const img = readFileSync(resolve(imgPath));
      const baseline = readFileSync(resolve(baselinePath));
      return checkImage(img, baseline, opts);
    },

    diff(aPath, bPath, opts) {
      return diffImages(readFileSync(resolve(aPath)), readFileSync(resolve(bPath)), opts);
    },

    logExperiment(entry) {
      const line = formatExperiment(entry);
      const dir = cfg.workDir;
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      appendFileSync(join(dir, "EXPERIMENTS.jsonl"), line + "\n");
      return line;
    },

    statePath() {
      const p = join(cfg.workDir, "PROJECT-STATE.md");
      return existsSync(p) ? p : null;
    },

    readState() {
      const p = this.statePath();
      return p ? readFileSync(p, "utf8") : null;
    },
  });

  // Optional settings card so the work dir can be changed without code edits.
  ctx.inject(["settings"], ({ settings }) => {
    try {
      const z = void 0; // schemastery intentionally not imported: zero-dep rule.
      // If the host exposes installSection with a plain object schema, use it.
      if (typeof settings?.installSection !== "function") return;
      settings.installSection(ctx, "fw-recon", {
        type: "object",
        properties: { workDir: { type: "string" } },
      }, {}, {
        setSource: (src) => {},
        onChange: (value) => {
          if (value && typeof value.workDir === "string") {
            cfg.workDir = value.workDir;
          }
        },
      });
    } catch {
      // settings seam shape differs across DSH versions — non-fatal.
    }
  });
}

// Re-export core so `import { checkImage } from "dsh-fw-recon"` works standalone.
export { checkImage, diffImages, formatExperiment };
export * from "./core.js";
