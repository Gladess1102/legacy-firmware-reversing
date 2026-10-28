# Report: 60s bilingual intro for legacy-firmware-reversing

## Task
One-minute bilingual (zh narration + zh/en subtitles) introduction video for the
open-source repo, using the user's on-device photos and extracted-UI renders.

## Assumptions
- Static-image Ken Burns style (no footage of the reverse-engineering process exists).
- Chinese TTS narration (cloud_tts) since the operator/audience primary language is zh;
  English subtitles for GitHub's international audience.
- No BGM: narration-only keeps the hacker-documentary tone; also avoids BGM licensing.

## Materials
- s1: user photo, v6 firmware FM 89.8MHz Chinese UI (best device shot)
- s2: user photo, 90.8MHz cliff state (the mystery)
- s3: UI resources rendered from archived t08_full.bin (CID capsules, normal+inverted)
- s4: real `fw-recon check/diff` CLI output rendered as terminal card
- s5: GitHub endcard (rendered)

## Pipeline
ffmpeg-full (libass) per-segment Ken Burns burn-in with per-segment ASS (fixing the
initial global-ASS subtitle misalignment found in self-review), then video-agent-kit
timeline (5 video clips + 5 voiceover clips) -> validate -> render_preview -> qc_preview.

## QC
- qc_preview: PASS. Only warning = narration inter-sentence silences (0.5-1.8s) — intended pacing.
- Visual self-review via video_ingest + video_watch_segment: subtitles aligned per scene after repair;
  seg3 fills frame after rebuild; endcard URL/license verified.

## Output
- out/preview.mp4 (56.84s, 1920x1080@30, h264+aac) -> copied to docs/assets/intro.mp4

## Remaining risks
- GitHub user-attachment URL placeholder in READMEs needs replacing after upload release asset.
