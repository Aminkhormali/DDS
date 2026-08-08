import fs from 'node:fs';
import assert from 'node:assert/strict';

const app = fs.readFileSync(new URL('../assets/js/app.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../assets/css/styles.css', import.meta.url), 'utf8');

assert.ok(app.includes("layout(content, '', 'quiz-page', { hideHeader: true })"), 'quiz should hide global header');
assert.ok(!app.includes('<div class="card progress-card"><div class="progress-top"><span>Question ${index + 1} of ${ids.length}</span>'), 'old quiz progress strip should be removed');
assert.ok(app.includes('quiz-nav-progress-percent'), 'question percentage should be inside upper nav');
assert.ok(app.includes('Question ${index + 1} of ${total}'), 'question position should be inside upper nav');
assert.ok(app.includes('quiz-nav-session'), 'session title should remain in upper nav');
assert.ok(app.includes('quiz-nav-flag'), 'bottom centered flag should remain');
assert.ok(css.includes('.quiz-session-nav'), 'new focus nav styling should exist');
console.log('v21 quiz focus checks passed');
