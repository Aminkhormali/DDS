# DentStudy Visual System

## 2026 redesign

- Fixed deep-navy desktop sidebar with Dashboard, Courses, Review, Flagged, and Progress destinations
- Sticky light search/header bar with local-save status, private GitHub sync access, and profile controls
- Warm ivory workspace and restrained teal clinical accents
- Georgia-based academic display typography paired with system sans-serif interface text
- Dashboard welcome area, progress ring, compact learning metrics, and editable course cards
- Course hero, session-bank tiles, in-page Add course/Add session controls, and cross-session custom review builder
- Session setup screen with Study, Exam, Practice, and Mastery entry points
- Review center showing all, correct, incorrect, unanswered, and flagged questions across banks
- Responsive mobile bottom navigation while preserving every original quiz function

# Design and Architecture

## Visual direction

The interface uses a calm academic and clinical style:

- Deep navy sticky header for persistent navigation
- Light gray-blue page background
- White content cards with subtle borders and shadows
- Blue for primary actions and navigation
- Green for correct answers and completion
- Red for incorrect answers
- Amber for flags, caution states, and medium difficulty
- Rounded cards and large touch targets for desktop, tablet, and phone use

The main design variables are declared at the top of `assets/css/styles.css`.

## Main screens

1. Dashboard and course browser
2. Course sessions
3. Session summary and mode selection
4. Study or exam question workspace
5. Question navigator and review filters
6. Results and topic analytics
7. Settings
8. Help and content-author instructions
9. GitHub synchronization dialog

## Application architecture

- `index.html`: application entry point
- `courses.json`: editable course/session catalog
- `questions/*.json`: independent question banks
- `assets/js/app.js`: routing, rendering, quiz engine, grading, review, import/export
- `assets/js/storage.js`: local persistence and file-download helpers
- `assets/js/github-sync.js`: optional GitHub Contents API synchronization
- `assets/css/styles.css`: responsive visual system
- `service-worker.js`: offline cache

## Content management principle

Question content is never hard-coded into the interface. To add or update ordinary course content, edit only `courses.json` and the relevant file in `questions/`.

## Privacy model

- Normal progress remains in browser storage.
- Export/import moves progress manually between devices.
- Optional GitHub synchronization writes a progress document to a user-selected private repository.
- GitHub tokens are stored in session storage only and are not committed or exported.


## Browser content-management layer

The dashboard now supports adding courses and uploading session banks without modifying repository files. These additions are stored in `progress.managedContent` and `progress.customBanks`, then merged with the static `courses.json` catalog at runtime. This preserves the simplicity of GitHub Pages while allowing routine management from the interface.

## Cross-session course reviews

A course review builder lets the learner choose sessions and include flagged questions, incorrect questions, or both. The generated review stores lightweight references to source questions rather than duplicating full banks. Review records synchronize back to their original session records.

## Question navigation placement

The Previous/Next navigation component is rendered twice inside the question card: above the question metadata and after the answer tools, immediately before the explanation panel.

## Deployment target

- Repository: `https://github.com/Aminkhormali/DDS`
- Published site: `https://aminkhormali.github.io/DDS/`
- Project base path: `/DDS/`

The manifest, service worker, canonical metadata, and public navigation links are scoped to this project path.


## Version 4 refinement

The dark theme now uses neutral charcoal workspace surfaces instead of a fully blue page. Course and session hero banners use a dedicated layered background, contained illustration well, clearer border, and a subtle teal top accent. Session tiles expose total, tackled, and completion values. Custom cross-session reviews initialize clean retest records, so previous answers and grading are not revealed. The Review Center keeps all filters but replaces its Confidence display column with the correct answer.


## Version 5 managed presentation data

Course presentation preferences are stored in the same managed-content overlay as browser-created courses. `managedContent.courseOrder` stores the visible course order. Each course overlay may contain a compressed `thumbnail` data URL. Both values travel with progress exports and private GitHub synchronization, so the public repository remains static while the user retains cross-device course organization and imagery.

Review Center answer content uses native HTML disclosure elements. The outer disclosure hides saved and correct answers until opened; the nested Takeaways disclosure presents structured learning points without exposing them during self-testing.
