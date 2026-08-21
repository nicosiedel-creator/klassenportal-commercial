import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LIVE_STUDY_QUESTIONS, publicQuestion } from '../dist/core/live-study-content.js';

assert.equal(LIVE_STUDY_QUESTIONS.length,48,'live study must contain exactly 48 quiz questions');
assert.equal(new Set(LIVE_STUDY_QUESTIONS.map(q=>q.id)).size,48,'question ids must be unique');
for(const q of LIVE_STUDY_QUESTIONS){
  assert.ok(q.topic&&q.question&&q.explanation,`question ${q.id} must be complete`);
  assert.equal(q.options.length,4,`question ${q.id} must have four options`);
  assert.equal(new Set(q.options.map(o=>o.id)).size,4,`question ${q.id} option ids must be unique`);
  assert.equal(q.options.filter(o=>o.id===q.correctOptionId).length,1,`question ${q.id} must have one valid answer key`);
  const pub=publicQuestion(q);
  assert.equal('correctOptionId' in pub,false,`public question ${q.id} must not expose answer key`);
  assert.equal('explanation' in pub,false,`public question ${q.id} must not expose solution text`);
}

const [presenter,participant,migration,html]=await Promise.all([
  readFile(new URL('../public/vfa-study-presenter.js',import.meta.url),'utf8'),
  readFile(new URL('../public/vfa-study-quiz.js',import.meta.url),'utf8'),
  readFile(new URL('../migrations/0085_live_study_sessions.sql',import.meta.url),'utf8'),
  readFile(new URL('../public/vfa-study-presenter.html',import.meta.url),'utf8'),
]);

assert.match(presenter,/youtube-nocookie\.com\/embed\/GD-D6ii9Q50/,'Bundestag video must be embedded directly');
assert.match(presenter,/youtube-nocookie\.com\/embed\/tesGVz6LbTY/,'Bundesbank video must be embedded directly');
assert.doesNotMatch(presenter,/Raumcode/i,'presenter must not show a room code');
assert.doesNotMatch(html,/Raumcode/i,'presenter HTML must not show a room code');
assert.match(html,/QR-Code scannen/,'quiz handoff must visibly use a QR code');
assert.match(html,/vfa-study-resume\.js/,'presenter must recover a running session after reload');
assert.doesNotMatch(participant,/correctOptionId/,'participant JavaScript must not contain the answer key field');
assert.match(participant,/vfa-live-study-progress/,'mobile quiz progress must survive refreshes');
assert.doesNotMatch(migration,/\bemail\b/i,'anonymous live-study storage must not persist email addresses');
assert.doesNotMatch(migration,/display_name|participant_name|full_name/i,'anonymous live-study storage must not persist participant names');
assert.match(migration,/participant_token_hash/,'participant tokens must be persisted only as hashes');
assert.match(migration,/presenter_token_hash/,'presenter token must be persisted only as a hash');

console.log('live-study tests: ok');
