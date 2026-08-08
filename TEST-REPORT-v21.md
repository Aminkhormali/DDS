# Amin's Dent Study v21 Validation Report

Validated on the complete v20 baseline plus the v21 quiz-focus changes.

## Passed checks

- JavaScript syntax: `app.js`, `storage.js`, and `github-sync.js`.
- Persistent course/session ordering tests.
- Immutable chunked synchronization round-trip test.
- No Git ref PATCH/update in the current synchronization path.
- IndexedDB durable storage and atomic cloud-restore markers.
- Existing course/session creation, randomization, review, flag, navigator, and hide/show controls remain present.
- Quiz-specific v21 checks:
  - global application header is omitted while actively answering questions;
  - separate quiz progress strip is removed;
  - session title is shown in the upper Previous/Next bar;
  - `Question X of Y` is shown in that bar;
  - completion percentage and mini progress indicator are shown in that bar;
  - bottom centered Flag control remains present;
  - sidebar toggle remains accessible from the upper question bar.

## Cache/deployment

- Static asset query version: v21.
- Service-worker cache: `dds-amins-dent-study-v21`.
