#!/usr/bin/env node
// fw-recon CLI — the same gates the DSH plugin exposes, usable standalone.
//
//   fw-recon check   --img NEW.bin --baseline BASE.bin [--pages 876-896] [--image-size 1835008]
//   fw-recon diff    A.bin B.bin [--strip]
//   fw-recon log     --id E1 --hypothesis "..." --action "..." --expected "..." \
//                    --observed "..." --verdict falsified [--file EXPERIMENTS.jsonl]
//
// Exit codes: 0 ok, 1 gate failed / usage error, 2 I/O error.
// SPDX-License-Identifier: MIT

import { readFileSync, appendFileSync, existsSync } from "node:fs";
import { checkImage, diffImages, formatExperiment } from "../lib/core.js";

function parsePages(spec) {
  const out = [];
  for (const part of String(spec).split(",")) {
    const m = part.match(/^(\d+)(?:-(\d+))?$/);
    if (!m) throw new Error(`bad page spec: ${part}`);
    const a = +m[1], b = m[2] ? +m[2] : a;
    for (let i = a; i < b; i++) out.push(i);
  }
  return out;
}

function humanRegions(regions) {
  return regions
    .slice(0, 40)
    .map((r) => `0x${r.start.toString(16)}-0x${r.end.toString(16)}`)
    .join(", ") + (regions.length > 40 ? ` … (+${regions.length - 40})` : "");
}

const [cmd, ...args] = process.argv.slice(2);
const arg = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};
const has = (name) => args.includes(name);

try {
  if (cmd === "check") {
    const img = readFileSync(arg("--img"));
    const base = readFileSync(arg("--baseline"));
    const opts = {};
    if (arg("--image-size")) opts.imageSize = +arg("--image-size");
    if (arg("--pages")) opts.protectedPages = parsePages(arg("--pages"));
    const { ok, problems, summary } = checkImage(img, base, opts);
    console.log(`image md5(first12): ${img.subarray(0, 12).toString("hex")}`);
    console.log(`changed bytes : ${summary.changedBytes}`);
    console.log(`changed pages : ${summary.changedPages.length}${summary.changedPages.length ? ": " + summary.changedPages.slice(0, 30).join(",") : ""}`);
    console.log(`tail violations: ${summary.tailViolations}`);
    if (ok) {
      console.log("[OK] safety gates passed");
    } else {
      console.log("[GATE FAILED]");
      for (const p of problems) console.log("  -", p);
      process.exit(1);
    }
  } else if (cmd === "diff") {
    const A = readFileSync(args[0]);
    const B = readFileSync(args[1]);
    const { bytes, regions } = diffImages(A, B, { strip: has("--strip") });
    console.log(`differing bytes: ${bytes}${has("--strip") ? " (sector tails stripped)" : ""}`);
    console.log(`regions (${regions.length}): ${humanRegions(regions)}`);
  } else if (cmd === "log") {
    const entry = {
      id: arg("--id"),
      hypothesis: arg("--hypothesis"),
      action: arg("--action"),
      expected: arg("--expected"),
      observed: arg("--observed"),
      verdict: arg("--verdict"),
      version: arg("--version", ""),
      attribution: arg("--attribution", ""),
      date: arg("--date"),
    };
    const line = formatExperiment(entry);
    const file = arg("--file", "EXPERIMENTS.jsonl");
    appendFileSync(file, line + "\n");
    console.log(`[logged] ${file}`);
    console.log(line);
  } else {
    console.log(`usage:
  fw-recon check  --img NEW.bin --baseline BASE.bin [--pages 876-896] [--image-size N]
  fw-recon diff   A.bin B.bin [--strip]
  fw-recon log    --id E1 --hypothesis H --action A --expected E --observed O
                  --verdict confirmed|falsified|insufficient|regression
                  [--version vN] [--file EXPERIMENTS.jsonl]`);
    process.exit(cmd ? 1 : 0);
  }
} catch (err) {
  console.error(`[error] ${err.message}`);
  process.exit(err.code === "ENOENT" ? 2 : 1);
}
