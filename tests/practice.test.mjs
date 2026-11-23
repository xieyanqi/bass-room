import test from "node:test";
import assert from "node:assert/strict";
import {exercises, rhythms, makeBars} from "../dist/exercises.js";
import {makeWindow, parseTab, customTabExample} from "../dist/practice.js";
import {createPitchDetector, createNoteTracker} from "../dist/pitch.js";

test("all exercises and rhythm variations fill four beats", () => {
  for (const exercise of exercises) {
    for (const rhythm of rhythms) {
      for (const bar of makeBars(exercise, rhythm.id)) {
        let cursor = 0;
        for (const [offset, duration] of bar) {
          assert.equal(offset, cursor, exercise.name);
          cursor += duration;
        }
        assert.equal(cursor, 16, exercise.name);
      }
    }
  }
});

test("a custom range wraps from the final bar to the first", () => {
  const section = makeWindow(exercises[0].bars, 28, 1);
  assert.deepEqual(section.map(entry => entry.absolute), [28, 29, 30, 31, 0, 1]);
  assert.deepEqual(section.filter(entry => entry.starts).map(entry => entry.absolute), [28, 30, 0]);
});

test("a selected range clips a held note at both boundaries", () => {
  const section = makeWindow(exercises.find(item => item.id === "turnaround").bars, 2, 5);
  assert.equal(section[0].starts, true);
  assert.equal(section[0].duration, 4);
  assert.equal(section.filter(entry => entry.starts).length, 1);
});

test("TAB import uses equal durations, or reads explicit timings and rests", () => {
  const equal = parseTab(customTabExample, "");
  assert.deepEqual(equal[0].map(event => event[1]), [4, 4, 4, 4]);
  const explicit = parseTab(customTabExample, "r0.5 0.5 1 1 1 | 1 1 1 1");
  assert.deepEqual(explicit[0][0], [0, 2]);
  assert.deepEqual(explicit[0][1], [2, 2, 3, 0]);
  assert.throws(() => parseTab(customTabExample, "1 1 1 0.5 | 1 1 1 1"), /4 拍/);
  assert.throws(() => parseTab(customTabExample.replace("E|0-3", "E|0--3"), ""), /等宽/);
});

test("the pitch detector recognizes bass fundamentals in harmonic-rich signals", () => {
  for (const rate of [44100, 48000]) {
    const detect = createPitchDetector(rate, 4096);
    for (const midi of [28, 31, 33, 38, 43, 50, 67]) {
      const frequency = 440 * 2 ** ((midi - 69) / 12);
      const samples = Float32Array.from({length: 4096}, (_, sample) => {
        const phase = 2 * Math.PI * frequency * sample / rate;
        return 0.09 * Math.sin(phase) + 0.14 * Math.sin(2 * phase) + 0.025 * Math.sin(3 * phase);
      });
      assert.equal(detect(samples).midi, midi);
    }
    assert.equal(detect(new Float32Array(4096)).midi, undefined);
  }
});

test("a sustained note counts once and a fresh pluck counts again", () => {
  const track = createNoteTracker();
  const note = {level: 0.02, midi: 28};
  const silence = {level: 0};
  const detected = [];
  for (let frame = 0; frame < 14; frame++) detected.push(track(note, frame * 0.032));
  assert.equal(detected.filter(midi => midi === 28).length, 1);
  track(silence, 0.480);
  track(silence, 0.512);
  assert.equal(track(note, 0.544), undefined);
  assert.equal(track(note, 0.576), 28);
  assert.equal(track({level: 0.02, midi: 31}, 0.672), undefined);
  assert.equal(track({level: 0.02, midi: 31}, 0.704), 31);

  for (let frame = 0; frame < 8; frame++) track({level: 0.008, midi: 31}, 0.736 + frame * 0.032);
  assert.equal(track({level: 0.026, midi: 31}, 1.024), 31);
});
