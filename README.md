# Amin's Dent Study

Complete static study application configured for:

- Repository: `Aminkhormali/DDS`
- Site: `https://aminkhormali.github.io/DDS/`
- GitHub Pages base path: `/DDS/`

This package is a complete website, not a patch. Upload the contents of this folder directly to the root of the `DDS` repository so that `index.html` is at repository root.

## Main capabilities

- Add and customize courses entirely from the webpage.
- Upload custom thumbnails for courses.
- Drag courses to create a persistent manual order.
- Sort courses alphabetically, by date added, or by date modified.
- Add JSON-backed sessions inside any course.
- Drag sessions within a course and retain their manual order.
- Sort sessions alphabetically, by date added, or by date modified.
- Import image questions using either embedded image data/URLs or separate image files referenced from JSON.
- Randomize questions within a session and reshuffle on demand.
- Study mode, exam mode, progress tracking, notes, flags, reviews, and custom cross-session retests.
- Custom retests hide old answers and explanations until the question is answered again.
- Review Center keeps answer/status/correct answer/takeaway/summary in one collapsed panel per question.
- Collapsible sidebar and quiz panels for maximum question-space on iPad and smaller screens.
- IndexedDB-backed local persistence for large banks and images.
- Private cross-browser synchronization with immutable chunked snapshots.

## Deploy to GitHub Pages

1. Extract the ZIP.
2. Upload **everything inside the extracted folder** to the root of `Aminkhormali/DDS`.
3. Confirm `index.html`, `courses.json`, `assets/`, `questions/`, and `service-worker.js` are directly at repository root.
4. In repository **Settings → Pages**, use the existing Pages configuration. The included `.github/workflows/pages.yml` also supports GitHub Actions deployment.
5. After deployment, open:
   `https://aminkhormali.github.io/DDS/?v=20`
6. Perform one hard refresh after upgrading from an older build.

## Important: preserve your current data during upgrade

Before replacing an older site version, use **Backup & transfer → Export backup** in the browser that currently has your most complete study database. Keep that file until the new version is verified.

The new version attempts to migrate older locally saved data into IndexedDB automatically. A backup remains the safest recovery option if the newest changes were only present in an old open tab.

## Private synchronization repository requirements

Use a separate private repository for study synchronization if possible.

The repository must already contain at least one commit/branch. The simplest setup is to create the repository with a README so that the `main` branch exists.

Use a fine-grained personal access token limited to that private repository with:

- Repository permissions → **Contents: Read and write**

Do not put the token into the public `DDS` repository. The app keeps the token in session storage for the current browser session.

### Why synchronization no longer gets non-fast-forward errors

A save does **not** update `main` or an existing sync branch. It:

1. Reads the base branch commit.
2. Splits the study database into 4 MiB pieces.
3. Creates Git blobs for the pieces.
4. Creates a manifest with byte count and checksum.
5. Creates a new Git tree and commit.
6. Creates a brand-new unique `amins-sync-...` reference pointing directly to that completed commit.

Because no existing reference is updated, competing browsers do not fight over one branch tip.

### Why large databases work

The full database is never sent as one large repository-content file. Git blobs are used for small chunks, and the loader restores them using the blob SHAs stored in the manifest.

### Snapshot history

The newest 10 synchronization snapshots are retained. Incomplete saves never receive a completed manifest/reference and therefore are not treated as valid saved data.

## Image questions

Recommended JSON format:

```json
{
  "id": "q014",
  "type": "single-choice",
  "stem": "Which diagnosis best matches this radiograph?",
  "image": {
    "src": "images/lesion-01.jpg",
    "alt": "Panoramic radiograph",
    "caption": "Clinical image"
  },
  "options": [
    {"id": "a", "text": "Option A"},
    {"id": "b", "text": "Option B"}
  ],
  "correctAnswer": "a"
}
```

For repository-managed banks, keep the image as a separate file and use a relative path. For a session added through the webpage, select the JSON and the referenced image files together; the app compresses and embeds the uploaded images into the managed bank.

Embedded `data:` images and full HTTPS image URLs are also supported.

## Local persistence

Large data is saved in IndexedDB rather than localStorage. This includes custom banks and embedded images. Course/session layout is mirrored into the durable progress record so it can be restored across refreshes and synchronized browsers.

Avoid private/incognito mode for your primary study database because browsers may treat persistent site storage differently there.

## Validation included in this release

The `tests/` folder contains current v20 regression tests for:

- Course/session manual and automatic ordering logic.
- Large chunked synchronization round-trip.
- No synchronization `PATCH` ref update.
- No release-asset upload host.
- Required UI/data features and IndexedDB architecture.

See `TEST-REPORT-v20.md` for the validation summary.

## v21 quiz focus layout

While actively answering questions, the persistent application top bar is hidden to maximize vertical space. The previous separate question-progress strip is also removed. The upper Previous/Next navigation box now carries the session title, current question position, completion percentage, and a compact progress track. The lower navigation keeps the centered Flag control. A compact navigation toggle remains available in the upper bar so the sidebar can still be hidden or restored.
