// dsh-fw-recon core — pure functions, zero dependencies.
//
// All constants are the Sharp MP-B300 battle defaults; override per device
// via the options object. Design rules distilled from 26 real flash cycles:
//   1. Image size is sacred: 1 byte more or less than the physical partition
//      size is a brick.
//   2. Sector tails (last 2 bytes of every 512B sector) are NOT free space —
//      some carry filler (0xDEDE/0xFFFF), some carry real data. A blanket
//      rewrite of tails corrupted live calibration sectors once.
//   3. Protected pages (boot / calibration) must be byte-identical to the
//      baseline, asserted before any write.
// SPDX-License-Identifier: MIT

/** Per-device layout. Override via options in every call. */
export const DEFAULT_LAYOUT = {
  pageSize: 2048,          // NAND page = 4 × 512B sectors
  sectorSize: 512,
  sectorData: 510,         // payload bytes; last 2 = tail
  imageSize: 896 * 2048,   // 1,835,008 for MP-B300 target 08
  protectedPages: range(876, 896),
  fillerTails: [Buffer.from([0xde, 0xde]), Buffer.from([0xff, 0xff])],
};

function range(a, b) {
  const out = [];
  for (let i = a; i < b; i++) out.push(i);
  return out;
}

/**
 * Safety gate: validate a candidate image against its baseline dump.
 * @param {Buffer} img
 * @param {Buffer} baseline
 * @param {Partial<typeof DEFAULT_LAYOUT>} [opts]
 * @returns {{ ok: boolean, problems: string[], summary: object }}
 */
export function checkImage(img, baseline, opts = {}) {
  const L = { ...DEFAULT_LAYOUT, ...opts };
  const problems = [];
  const summary = { changedBytes: 0, changedPages: [], tailViolations: 0 };

  if (img.length !== L.imageSize) {
    problems.push(`image size ${img.length} != ${L.imageSize} (1 byte off = brick)`);
    return { ok: false, problems, summary };
  }
  if (baseline.length !== L.imageSize) {
    problems.push(`baseline size ${baseline.length} != ${L.imageSize}`);
    return { ok: false, problems, summary };
  }

  // 1) protected pages must be byte-identical
  for (const page of L.protectedPages) {
    const s = page * L.pageSize;
    const e = s + L.pageSize;
    if (e > img.length) break;
    if (!img.subarray(s, e).equals(baseline.subarray(s, e))) {
      problems.push(`protected page ${page} (0x${s.toString(16)}) modified — forbidden`);
    }
  }

  // 2) sector tails: filler tails may follow data; special tails must match baseline
  const nSectors = Math.floor(img.length / L.sectorSize);
  for (let sec = 0; sec < nSectors; sec++) {
    const base = sec * L.sectorSize;
    const tail = img.subarray(base + L.sectorData, base + L.sectorSize);
    const orig = baseline.subarray(base + L.sectorData, base + L.sectorSize);
    const isFiller = L.fillerTails.some((f) => tail.equals(f));
    if (!isFiller && !tail.equals(orig)) {
      summary.tailViolations++;
      problems.push(
        `sector ${sec} (page ${Math.floor(sec / 4)}) special tail ` +
        `${orig.toString("hex")} -> ${tail.toString("hex")} tampered`
      );
    }
  }

  // 3) diff summary for human eyeballing
  for (let p = 0; p < L.imageSize / L.pageSize; p++) {
    const s = p * L.pageSize;
    if (!img.subarray(s, s + L.pageSize).equals(baseline.subarray(s, s + L.pageSize))) {
      summary.changedPages.push(p);
      for (let i = 0; i < L.pageSize; i++) {
        if (img[s + i] !== baseline[s + i]) summary.changedBytes++;
      }
    }
  }
  if (summary.changedBytes === 0) {
    problems.push("image is identical to baseline — nothing to flash");
  }

  return { ok: problems.length === 0, problems, summary };
}

/**
 * Twin-image diff with (optional) sector-tail stripping before comparison.
 * Stripping avoids tail noise polluting a code-region diff.
 * @param {Buffer} a
 * @param {Buffer} b
 * @param {{strip?: boolean, pageSize?: number, sectorSize?: number, sectorData?: number}} [opts]
 * @returns {{ bytes: number, regions: Array<{start:number,end:number}> }}
 */
export function diffImages(a, b, opts = {}) {
  const { strip = false, pageSize = 2048, sectorSize = 512, sectorData = 510 } = opts;
  if (a.length !== b.length) throw new Error(`size mismatch ${a.length} vs ${b.length}`);
  let A = a, B = b;
  if (strip) {
    const n = Math.floor(a.length / sectorSize);
    const ua = Buffer.alloc(Math.floor(n * sectorData));
    const ub = Buffer.alloc(ua.length);
    for (let s = 0; s < n; s++) {
      a.subarray(s * sectorSize, s * sectorSize + sectorData)
        .copy(ua, s * sectorData);
      b.subarray(s * sectorSize, s * sectorSize + sectorData)
        .copy(ub, s * sectorData);
    }
    A = ua; B = ub;
  }
  const regions = [];
  let bytes = 0;
  const regionGap = pageSize; // merge diffs closer than one page
  let cur = null;
  for (let i = 0; i < A.length; i++) {
    if (A[i] !== B[i]) {
      bytes++;
      const start = strip ? Math.floor((i / sectorData) * sectorSize) : i;
      if (cur && start - cur.end <= regionGap) cur.end = start;
      else { cur = { start, end: start }; regions.push(cur); }
    }
  }
  for (const r of regions) r.end += 1;
  return { bytes, regions };
}

/**
 * Falsification logbook entry (JSONL line, PROJECT-STATE discipline).
 * Fields mirror templates/EXPERIMENTS.template.md.
 */
export function formatExperiment(e) {
  const req = ["id", "hypothesis", "action", "expected", "observed", "verdict"];
  for (const k of req) {
    if (e[k] === undefined) throw new Error(`experiment missing field: ${k}`);
  }
  const verdicts = ["confirmed", "falsified", "insufficient", "regression"];
  if (!verdicts.includes(e.verdict)) {
    throw new Error(`verdict must be one of ${verdicts.join(", ")}`);
  }
  return JSON.stringify({
    id: String(e.id),
    date: e.date ?? new Date().toISOString().slice(0, 10),
    version: e.version ?? "",
    hypothesis: e.hypothesis,
    action: e.action,     // byte-level: offsets + old->new
    expected: e.expected, // written BEFORE running, not after
    observed: e.observed, // raw device/simulator phenomena only
    verdict: e.verdict,
    attribution: e.attribution ?? "",
    cost: e.cost ?? "",
  });
}
