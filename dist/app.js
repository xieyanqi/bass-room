import {exercises, rhythms, strings, durationNames, makeBars, STEPS_PER_BAR, STEPS_PER_BEAT} from "./exercises.js";

import {countLabel, stepLabel, makeWindow, pitchName, customTabExample, parseTab} from "./practice.js";
import {createNoteTracker, monitorInput} from "./pitch.js";

const $ = id => document.getElementById(id);
const score = $("score");
const playButton = $("play");
const tempoNumber = $("tempo-number");
const tempoRange = $("tempo-range");
const rhythmSelect = $("rhythm-select");
const rangeSelect = $("loop-range");
const loop = $("loop");
const beatLights = Array.from($("beats").children);
const audioError = $("audio-error");
const announcement = $("play-announcement");
const pickButton = $("pick-beats");
const micButton = $("mic-button");
const subdivision = $("subdivision");
const customStorage = "bass-room.custom-tab.v1";

const minTempo = Number(tempoRange.min);
const maxTempo = Number(tempoRange.max);
const lookahead = 0.09;
const schedulerPeriod = 22;

let exercise = exercises[0];
let bars = [];
let section = [];
let customRange = null;
let picking = false;
let anchor = null;
let mode = "follow";
let tempo = exercise.bpm;
let gridInterval = 2;
let measureNodes = [];
let activeMeasure, activeSlot;
let highlightedBeat = -1;
let lastPosition = "";
let cueText = "";
let micTargets = [];
let micCleanup, micPending = false, micGeneration = 0;
let micCursor = 0, micRound = 1, trackNote;
let micTargetSlot, micMatchedSlot;
let playing = false;
let generation = 0;
let schedulerId = null;
let frameId = null;
let resumeStep = null;
let currentFrame = null;
let nextStep = 0;
let nextTime = 0;
let stopAtStep = Infinity;
let queuedFrames = [];

let context;
let masterBus, clickBus, bassBus;
const voices = new Set();

function renderLibrary() {
  const library = customExercise ? [...exercises, customExercise] : exercises;
  $("exercise-count").textContent = library.length + " 段练习";
  const list = $("exercise-list");
  list.replaceChildren();
  for (const group of new Set(library.map(item => item.group))) {
    const section = document.createElement("section");
    section.className = "exercise-group";
    section.innerHTML = '<h3></h3><div class="exercise-buttons"></div>';
    section.querySelector("h3").textContent = group;
    const buttons = section.querySelector(".exercise-buttons");
    for (const item of library.filter(entry => entry.group === group)) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "exercise-item";
      button.dataset.exercise = item.id;
      button.innerHTML = '<span class="exercise-icon" aria-hidden="true"></span><span class="exercise-text"><b></b><small></small></span>';
      button.querySelector(".exercise-icon").textContent = item.icon;
      button.querySelector("b").textContent = item.name;
      button.querySelector("small").textContent = item.level + " · " + item.focus;
      button.addEventListener("click", () => {
        if (exercise.id !== item.id) selectExercise(item);
      });
      buttons.append(button);
    }
    list.append(section);
  }
}

function selectExercise(item) {
  stopTransport(false);
  exercise = item;
  $("exercise-title").textContent = item.name;
  $("exercise-description").textContent = item.description;
  $("exercise-style").textContent = item.style;
  $("exercise-level").textContent = item.level;
  for (const button of document.querySelectorAll(".exercise-item")) {
    button.setAttribute("aria-pressed", String(button.dataset.exercise === item.id));
  }
  rhythmSelect.value = "written";
  customRange = null;
  setPicking(false);
  rangeSelect.replaceChildren(new Option("整段", "all"));
  for (let index = 0; index < item.bars.length; index++) {
    rangeSelect.add(new Option("第 " + (index + 1) + " 小节", String(index)));
  }
  setTempo(item.bpm);
  renderScore();
  if (micCleanup) resetMicProgress();
}

function renderScore() {
  clearMicMarks();
  bars = makeBars(exercise, rhythmSelect.value);
  gridInterval = bars.some(bar => bar.some(([step, length]) => step % 2 || length === 1)) ? 1 : 2;
  const bar = Number(rangeSelect.value);
  const all = rangeSelect.value === "all";
  const first = customRange && rangeSelect.value === "custom" ? customRange.first : all ? 0 : bar * STEPS_PER_BAR;
  const last = customRange && rangeSelect.value === "custom" ? customRange.last : all ? bars.length * STEPS_PER_BAR - 1 : first + STEPS_PER_BAR - 1;
  section = makeWindow(bars, first, last);
  const included = new Set(section.map(entry => entry.absolute));
  score.classList.toggle("many-bars", bars.length > 2);
  $("score-detail").textContent = "· " + bars.length + " 小节";
  $("rhythm-hint").textContent = gridInterval === 1 ? "数拍 1 e & a" : "数拍 1 & 2 & 3 & 4 &";
  $("practice-tip").textContent = rhythmSelect.value === "written"
    ? exercise.tip
    : "先数出每个小格的拍点，再听节拍器对齐落音。R 表示休止，变换节奏型时音高沿用这一段的走向。";

  score.replaceChildren();
  measureNodes = bars.map((bar, measureIndex) => {
    const measure = document.createElement("div");
    measure.className = "measure";
    const barStart = measureIndex * STEPS_PER_BAR;
    measure.classList.toggle("out-of-range", !section.some(entry => entry.bar === measureIndex));
    measure.innerHTML = '<div class="measure-title"></div><div class="measure-rows"><div class="string-labels" aria-hidden="true"></div><div class="measure-grid"></div></div>';
    const title = "第 " + (measureIndex + 1) + " 小节";
    measure.querySelector(".measure-title").textContent = title
      + (exercise.sections ? " · " + exercise.sections[measureIndex] : "");
    measure.querySelector(".string-labels").replaceChildren(...strings.map(({name}) => {
      const label = document.createElement("span");
      label.textContent = name;
      return label;
    }));
    const grid = measure.querySelector(".measure-grid");
    grid.style.setProperty("--slots", STEPS_PER_BAR / gridInterval);
    const events = new Map(bar.map(event => [event[0], event]));
    const slots = [];
    for (let step = 0; step < STEPS_PER_BAR; step += gridInterval) {
      const slot = document.createElement("div");
      const onBeat = step % STEPS_PER_BEAT === 0;
      slot.className = onBeat ? "slot on-beat" : "slot";
      const absolute = barStart + step;
      slot.dataset.step = absolute;
      if (rangeSelect.value === "custom") {
        const overlaps = Array.from({length: gridInterval}, (_, index) => absolute + index).some(index => included.has(index));
        slot.classList.toggle("in-range", overlaps);
      }
      const count = document.createElement("button");
      count.type = "button";
      count.className = "slot-count";
      count.disabled = !picking;
      count.textContent = countLabel(step);
      count.setAttribute("aria-label", stepLabel(absolute));
      count.addEventListener("click", () => chooseStep(absolute));
      slot.append(count, rhythmMark(events.get(step)));
      const eventAtSlot = bar.find(([start, duration]) => start <= step && step < start + duration);
      if (eventAtSlot[1] > gridInterval) {
        const rail = document.createElement("span");
        rail.className = "duration-track";
        rail.classList.toggle("silent", eventAtSlot.length === 2);
        rail.classList.toggle("tail", step + gridInterval >= eventAtSlot[0] + eventAtSlot[1]);
        rail.setAttribute("aria-hidden", "true");
        slot.append(rail);
      }
      for (let string = 0; string < strings.length; string++) {
        const row = document.createElement("span");
        row.className = "string-cell";
        const event = events.get(step);
        if (event?.[2] === string) {
          const fret = document.createElement("span");
          fret.className = "fret";
          fret.textContent = event[3];
          fret.title = strings[string].name + " 弦 " + event[3] + " 品 · " + durationNames[event[1]];
          fret.setAttribute("aria-label", fret.title);
          row.append(fret);
        }
        slot.append(row);
      }
      grid.append(slot);
      slots.push(slot);
    }
    score.append(measure);
    return {measure, slots};
  });
  paint(null);
  showRangeHint();
}

function showRangeHint() {
  const hint = $("range-hint");
  hint.hidden = !picking && rangeSelect.value !== "custom";
  if (picking) {
    hint.textContent = anchor === null
      ? "在谱面点起点，再点终点。可以从末尾接回开头。"
      : "起点 " + stepLabel(anchor) + "。现在选择最后一个拍点。";
  } else if (customRange && !hint.hidden) {
    hint.textContent = stepLabel(customRange.first) + " → " + stepLabel(customRange.last)
      + (customRange.last < customRange.first ? "（跨段末）" : "");
  }
}

function setPicking(value) {
  picking = value;
  anchor = null;
  score.classList.toggle("is-picking", picking);
  pickButton.setAttribute("aria-pressed", String(picking));
  pickButton.textContent = picking ? "取消选拍" : "选拍循环";
  for (const slot of score.querySelectorAll(".slot")) {
    slot.classList.remove("anchor");
    slot.firstElementChild.disabled = !picking;
  }
  showRangeHint();
}

function chooseStep(absolute) {
  if (!picking) return;
  if (anchor === null) {
    anchor = absolute;
    score.querySelector('[data-step="' + absolute + '"]').classList.add("anchor");
    showRangeHint();
    return;
  }
  customRange = {first: anchor, last: absolute + gridInterval - 1};
  if (![...rangeSelect.options].some(option => option.value === "custom")) {
    rangeSelect.add(new Option("自选拍点", "custom"));
  }
  rangeSelect.value = "custom";
  loop.checked = true;
  setPicking(false);
  restartForSetting();
  pickButton.focus();
}

function rhythmMark(event) {
  const mark = document.createElement("span");
  mark.className = "rhythm-mark";
  if (!event) return mark;
  const [, duration, string] = event;
  if (string === undefined) {
    mark.classList.add("rest-mark");
    mark.textContent = "R";
    mark.title = (duration / STEPS_PER_BEAT) + " 拍休止";
  } else {
    mark.classList.add("note-mark");
    mark.title = durationNames[duration];
    if (duration === 8) mark.classList.add("half");
    if (duration === 16) mark.classList.add("whole");
    if (duration <= 2) {
      const flag = document.createElement("span");
      flag.className = "flag";
      mark.append(flag);
    }
    if (duration === 1) mark.classList.add("sixteenth");
  }
  return mark;
}

function setTempo(value) {
  const next = Math.min(maxTempo, Math.max(minTempo, Math.round(value)));
  const old = tempo;
  tempo = next;
  tempoNumber.value = String(tempo);
  tempoRange.value = String(tempo);
  $("tempo-down").disabled = tempo === minTempo;
  $("tempo-up").disabled = tempo === maxTempo;
  $("practice-up").disabled = tempo === maxTempo;
  if (tempo !== old && playing) reschedule(old);
}

function secondsPerStep(bpm = tempo) {
  return 60 / bpm / STEPS_PER_BEAT;
}

function loopLength() {
  return section.length;
}

function location(step) {
  const offset = step % loopLength();
  return {
    ...section[offset],
    round: Math.floor(step / loopLength()) + 1
  };
}

function paint(frame) {
  const step = frame?.step;
  const isCountIn = step !== undefined && step < 0;
  const place = step >= 0 ? location(step) : null;
  const beat = isCountIn ? Math.floor((step + STEPS_PER_BAR) / STEPS_PER_BEAT)
    : place ? Math.floor(place.slot / STEPS_PER_BEAT) : -1;
  if (highlightedBeat !== beat) {
    beatLights.forEach((light, index) => light.classList.toggle("current", index === beat));
    highlightedBeat = beat;
  }
  beatLights[0].classList.toggle("ready", beat === -1);

  const reveal = place && mode !== "read" && !micCleanup;
  const measure = reveal ? measureNodes[place.bar]?.measure : null;
  const slot = reveal ? measureNodes[place.bar]?.slots[Math.floor(place.slot / gridInterval)] : null;
  if (activeMeasure !== measure) {
    activeMeasure?.classList.remove("in-play");
    measure?.classList.add("in-play");
    if (measure) keepInView(measure);
    activeMeasure = measure;
  }
  if (activeSlot !== slot) {
    activeSlot?.classList.remove("active", "rest-active", "held-active");
    slot?.classList.add("active");
    activeSlot = slot;
  }
  if (slot) {
    slot.classList.toggle("rest-active", place.event.length === 2);
    slot.classList.toggle("held-active", place.event.length === 4 && place.event[0] !== place.slot && !place.starts);
  }
  if (!micCleanup) setCue(isCountIn ? "听完预备拍，再开始弹。" : cueFor(reveal ? place : null));

  let label = "准备就绪";
  if (isCountIn) label = "预备 · " + (beat + 1);
  if (place) {
    label = "第 " + (place.bar + 1) + " 小节";
    if (loop.checked || place.round > 1) label += " · 第 " + place.round + " 遍";
  }
  if (lastPosition !== label) {
    $("position").textContent = label;
    lastPosition = label;
  }
}

function keepInView(measure) {
  if (!score.classList.contains("many-bars")) return;
  const visible = score.getBoundingClientRect();
  const bounds = measure.getBoundingClientRect();
  if (bounds.top < visible.top) score.scrollTop -= visible.top - bounds.top;
  if (bounds.bottom > visible.bottom) score.scrollTop += bounds.bottom - visible.bottom;
}

function cueFor(place) {
  if (mode === "read") return "独立读谱 · 保留节拍，按 TAB 自己数拍。";
  if (!place) return "播放时看拨弦、延音和消音提示。";
  const [start, length, string, fret] = place.event;
  if (string === undefined) return "休止 · 消音，继续数拍";
  if (start !== place.slot && !place.starts) return "延音 · 保持当前音";
  return "拨弦 · " + strings[string].name + " 弦 " + fret + " 品 · " + durationNames[length];
}

function setCue(text) {
  if (cueText !== text) $("note-cue").textContent = text;
  cueText = text;
}

function prepareAudio() {
  if (!context) {
    const Audio = window.AudioContext || window.webkitAudioContext;
    context = new Audio();
    masterBus = context.createGain();
    clickBus = context.createGain();
    bassBus = context.createGain();
    masterBus.gain.value = 0.7;
    clickBus.connect(masterBus);
    bassBus.connect(masterBus);
    masterBus.connect(context.destination);
    updateMix();
  }
  return context.resume();
}

function updateMix() {
  if (!context) return;
  clickBus.gain.setTargetAtTime($("metronome").checked ? 1 : 0, context.currentTime, 0.009);
  const bassGain = !$("bass-audio").checked || mode === "read" ? 0 : mode === "listen" ? 1 : 0.55;
  bassBus.gain.setTargetAtTime(bassGain, context.currentTime, 0.009);
}

function keepVoice(nodes, source, volume, starts, ends) {
  const voice = {nodes, volume, starts, ends};
  voices.add(voice);
  source.onended = () => {
    voices.delete(voice);
    for (const node of nodes) node.disconnect();
    volume.disconnect();
  };
}

function playClick(time, first, accent) {
  const osc = context.createOscillator();
  const volume = context.createGain();
  const end = time + 0.055;
  const frequency = first ? 1130 : accent ? 780 : 510;
  osc.frequency.setValueAtTime(frequency, time);
  osc.frequency.exponentialRampToValueAtTime(frequency * 0.72, end);
  volume.gain.setValueAtTime(0.0001, time);
  volume.gain.exponentialRampToValueAtTime(first ? 0.23 : accent ? 0.13 : 0.072, time + 0.002);
  volume.gain.exponentialRampToValueAtTime(0.0001, end);
  osc.connect(volume);
  volume.connect(clickBus);
  osc.start(time);
  osc.stop(end);
  keepVoice([osc], osc, volume, time, end);
}

function playBass(time, duration, string, fret) {
  const frequency = 440 * 2 ** ((strings[string].midi + fret - 69) / 12);
  const oscillators = [context.createOscillator(), context.createOscillator()];
  const filter = context.createBiquadFilter();
  const volume = context.createGain();
  const release = time + duration;
  const end = release + 0.045;
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(1380, time);
  filter.frequency.exponentialRampToValueAtTime(340, time + Math.min(duration, 0.23));
  oscillators[0].type = "triangle";
  oscillators[0].frequency.value = frequency;
  oscillators[1].type = "sine";
  // A quiet-feeling upper harmonic keeps the pitch audible on laptop speakers.
  oscillators[1].frequency.value = frequency * 2;
  volume.gain.setValueAtTime(0.0001, time);
  volume.gain.exponentialRampToValueAtTime(0.22, time + 0.009);
  volume.gain.exponentialRampToValueAtTime(0.10, release);
  volume.gain.exponentialRampToValueAtTime(0.0001, end);
  for (const osc of oscillators) {
    osc.connect(filter);
    osc.start(time);
    osc.stop(end);
  }
  filter.connect(volume);
  volume.connect(bassBus);
  keepVoice([...oscillators, filter], oscillators[0], volume, time, end);
}

function cancelVoices(includeActive, at = context?.currentTime) {
  if (!context) return;
  const now = context.currentTime;
  for (const voice of voices) {
    if (voice.starts >= at) {
      voice.volume.gain.cancelScheduledValues(now);
      voice.volume.gain.setValueAtTime(0, now);
    } else if (includeActive && voice.ends > now) {
      const gain = voice.volume.gain;
      if (typeof gain.cancelAndHoldAtTime === "function") gain.cancelAndHoldAtTime(now);
      else gain.cancelScheduledValues(now);
      gain.setTargetAtTime(0, now, 0.006);
    }
  }
}

function schedule() {
  if (!playing) return;
  // A delayed tab can skip obsolete subdivisions so returning to it does not bunch up clicks.
  const lateBy = context.currentTime - nextTime - 0.02;
  if (lateBy > 0 && nextStep < stopAtStep) {
    const missed = Math.min(stopAtStep - nextStep, Math.ceil(lateBy / secondsPerStep()));
    nextStep += missed;
    nextTime += missed * secondsPerStep();
  }
  while (nextTime <= context.currentTime + lookahead) {
    const endReached = nextStep >= stopAtStep;
    queuedFrames.push({step: nextStep, time: nextTime, end: endReached});
    if (endReached) {
      nextTime = Infinity;
      return;
    }
    const time = Math.max(context.currentTime, nextTime);
    const place = nextStep >= 0 ? location(nextStep) : null;
    const slot = place?.slot ?? nextStep + STEPS_PER_BAR;
    const interval = place ? Number(subdivision.value) : STEPS_PER_BEAT;
    if (slot % interval === 0) playClick(time, slot === 0, slot % STEPS_PER_BEAT === 0);
    if (place?.starts && place.event.length === 4) {
      playBass(time, place.duration * secondsPerStep() * 0.92, place.event[2], place.event[3]);
    }
    nextStep++;
    nextTime += secondsPerStep();
  }
}

function consumeFrames(now) {
  while (queuedFrames.length && queuedFrames[0].time <= now) {
    currentFrame = queuedFrames.shift();
  }
}

function animate() {
  if (!playing) return;
  consumeFrames(context.currentTime);
  if (currentFrame?.end) {
    stopTransport(false);
    announcement.textContent = "播放完成";
    return;
  }
  paint(currentFrame);
  frameId = requestAnimationFrame(animate);
}

function reschedule(oldTempo) {
  const now = context.currentTime;
  consumeFrames(now);
  if (currentFrame?.end) return;
  const upcoming = queuedFrames[0];
  const next = upcoming?.step ?? nextStep;
  const oldNextTime = upcoming?.time ?? nextTime;
  const remaining = Math.max(0, oldNextTime - now);
  cancelVoices(false, upcoming ? Math.max(now, upcoming.time - 0.001) : now);
  queuedFrames = [];
  nextStep = next;
  nextTime = now + remaining * oldTempo / tempo;
  schedule();
}

async function startTransport() {
  if (micCleanup || micPending) return;
  const requested = ++generation;
  audioError.hidden = true;
  try {
    await prepareAudio();
  } catch {
    if (requested === generation) audioError.hidden = false;
    return;
  }
  if (requested !== generation) return;
  playing = true;
  nextStep = resumeStep ?? ($("count-in").checked ? -STEPS_PER_BAR : 0);
  setStopStep(nextStep);
  nextTime = context.currentTime + 0.055;
  queuedFrames = [];
  currentFrame = null;
  playButton.classList.add("is-playing");
  $("play-label").textContent = "暂停";
  announcement.textContent = nextStep < 0 ? "开始预备拍" : "开始播放";
  schedule();
  schedulerId = setInterval(schedule, schedulerPeriod);
  animate();
}

function stopTransport(pause) {
  generation++;
  if (playing) consumeFrames(context.currentTime);
  if (pause) resumeStep = currentFrame && !currentFrame.end ? currentFrame.step : nextStep;
  else resumeStep = null;
  playing = false;
  clearInterval(schedulerId);
  cancelAnimationFrame(frameId);
  cancelVoices(true);
  queuedFrames = [];
  playButton.classList.remove("is-playing");
  $("play-label").textContent = "播放";
  if (!pause) currentFrame = null;
  paint(currentFrame);
}

function restartForSetting() {
  const wasPlaying = playing;
  stopTransport(false);
  renderScore();
  if (micCleanup) resetMicProgress();
  else if (wasPlaying) startTransport();
}

function togglePlayback() {
  if (!playing) {
    startTransport();
  } else {
    stopTransport(true);
    announcement.textContent = "已暂停";
  }
}

$("reset").addEventListener("click", () => {
  if (micCleanup) return resetMicProgress();
  stopTransport(false);
  announcement.textContent = "已回到开头";
});
playButton.addEventListener("click", togglePlayback);
tempoRange.addEventListener("input", () => setTempo(Number(tempoRange.value)));
function commitTempoInput() {
  const value = tempoNumber.valueAsNumber;
  setTempo(Number.isFinite(value) ? value : tempo);
}

tempoNumber.addEventListener("change", commitTempoInput);
tempoNumber.addEventListener("blur", commitTempoInput);
tempoNumber.addEventListener("keydown", event => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  commitTempoInput();
  tempoNumber.blur();
});
$("tempo-down").addEventListener("click", () => setTempo(tempo - 5));
$("tempo-up").addEventListener("click", () => setTempo(tempo + 5));
$("practice-up").addEventListener("click", () => setTempo(tempo + 3));
pickButton.addEventListener("click", () => setPicking(!picking));
subdivision.addEventListener("change", () => { if (playing) reschedule(tempo); });

for (const rhythm of rhythms) rhythmSelect.add(new Option(rhythm.name, rhythm.id));
rhythmSelect.addEventListener("change", () => {
  setPicking(false);
  restartForSetting();
});
rangeSelect.addEventListener("change", () => {
  setPicking(false);
  restartForSetting();
});
function setStopStep(step) {
  const passIndex = Math.floor(Math.max(step, 0) / loopLength());
  stopAtStep = loop.checked ? Infinity : (passIndex + 1) * loopLength();
}

loop.addEventListener("change", () => {
  if (!playing) return;
  consumeFrames(context.currentTime);
  setStopStep(currentFrame?.step ?? nextStep);
  reschedule(tempo);
});
for (const id of ["metronome", "bass-audio"]) $(id).addEventListener("change", updateMix);
document.addEventListener("keydown", event => {
  if (event.code !== "Space" || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.target.closest?.("button, input, select, textarea, a, [contenteditable]")) return;
  event.preventDefault();
  togglePlayback();
});



for (const button of document.querySelectorAll("[data-mode]")) {
  button.addEventListener("click", () => {
    const next = button.dataset.mode;
    if (next === mode && !micCleanup && !micPending) return;
    const fromMic = Boolean(micCleanup || micPending);
    if (fromMic) stopMicrophone();
    $("mic-panel").hidden = true;
    mode = next;
    $("bass-audio").disabled = mode === "read";
    $("bass-audio").checked = mode !== "read";
    updateModes();
    updateMix();
    paint(currentFrame);
  });
}

function updateModes() {
  const mic = Boolean(micCleanup || micPending);
  for (const button of document.querySelectorAll("[data-mode]")) {
    button.setAttribute("aria-pressed", String(!mic && button.dataset.mode === mode));
  }
  micButton.setAttribute("aria-pressed", String(mic));
  micButton.textContent = mic ? (micPending ? "取消麦克风授权" : "关闭麦克风跟谱") : "打开麦克风跟谱";
  playButton.disabled = mic;
}

function clearMicMarks() {
  micTargetSlot?.classList.remove("mic-target");
  micMatchedSlot?.classList.remove("mic-hit");
  micTargetSlot = null;
  micMatchedSlot = null;
}

function noteTargets() {
  return section.filter(entry => entry.starts && entry.event.length === 4);
}

function resetMicProgress() {
  micTargets = noteTargets();
  micCursor = 0;
  micRound = 1;
  trackNote = createNoteTracker();
  clearMicMarks();
  if (!micTargets.length) {
    stopMicrophone("选区只有休止。请选择包含音符的选区。");
    return;
  }
  $("mic-progress-row").hidden = false;
  const progress = $("mic-progress");
  progress.max = micTargets.length;
  showTarget("准备好了");
}

function showTarget(message) {
  const target = micTargets[micCursor];
  micTargetSlot?.classList.remove("mic-target");
  $("mic-progress").value = micCursor;
  $("mic-count").textContent = micCursor + " / " + micTargets.length + " · 第 " + micRound + " 遍";
  if (!target) return;
  const [, , string, fret] = target.event;
  const measure = measureNodes[target.bar];
  micTargetSlot = measure.slots[Math.floor(target.slot / gridInterval)];
  micTargetSlot.classList.add("mic-target");
  keepInView(measure.measure);
  const instruction = "下一音 " + strings[string].name + " 弦 " + fret + " 品 · " + pitchName(strings[string].midi + fret);
  $("mic-status").textContent = message + "。 " + instruction;
  $("position").textContent = "等待你弹 · 第 " + micRound + " 遍";
  lastPosition = "";
  setCue(instruction);
}

function listenToNote(frame, time) {
  $("mic-input").style.setProperty("--input-level", Math.min(100, Math.sqrt(frame.level) * 310) + "%");
  const midi = trackNote(frame, time);
  const target = micTargets[micCursor];
  if (midi === undefined || !target) return;
  const [, , string, fret] = target.event;
  if (midi !== strings[string].midi + fret) {
    $("mic-status").textContent = "听到 " + pitchName(midi) + "，再试一次 " + strings[string].name + " 弦 " + fret + " 品。";
    return;
  }

  micMatchedSlot?.classList.remove("mic-hit");
  micMatchedSlot = micTargetSlot;
  micMatchedSlot.classList.add("mic-hit");
  micCursor++;
  if (micCursor === micTargets.length && !loop.checked) {
    showTarget("");
    stopMicrophone("这一遍完成，已识别 " + micTargets.length + " 个音。", true);
  } else {
    if (micCursor === micTargets.length) {
      micRound++;
      micCursor = 0;
    }
    showTarget("已识别 " + pitchName(midi));
  }
}

async function startMicrophone() {
  if (!noteTargets().length) {
    stopMicrophone("选区只有休止。请选择包含音符的选区。");
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    stopMicrophone("当前页面无法使用麦克风。请在 Chrome 或 Edge 中直接打开 HTTPS 站点。");
    return;
  }
  stopTransport(false);
  const requested = ++micGeneration;
  micPending = true;
  $("mic-panel").hidden = false;
  $("mic-progress-row").hidden = true;
  $("mic-status").textContent = "等待浏览器允许使用麦克风…";
  updateModes();
  let stream;
  try {
    await prepareAudio();
    if (requested !== micGeneration) return;
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1}
    });
    if (requested !== micGeneration) {
      for (const track of stream.getTracks()) track.stop();
      return;
    }
    micCleanup = monitorInput(context, stream, listenToNote);
    for (const track of stream.getAudioTracks()) {
      track.addEventListener("ended", () => {
        if (requested === micGeneration) stopMicrophone("麦克风连接已中断。可以重新开启。");
      }, {once: true});
    }
    micPending = false;
    updateModes();
    resetMicProgress();
  } catch (error) {
    for (const track of stream?.getTracks() ?? []) track.stop();
    if (requested !== micGeneration) return;
    const message = error.name === "NotAllowedError"
      ? "麦克风权限未开启。可在浏览器地址栏的网站设置里允许后重试。"
      : error.name === "NotFoundError"
        ? "没找到麦克风。连接输入设备或检查系统输入设置后重试。"
        : "麦克风启动失败。检查系统输入设置后重试。";
    stopMicrophone(message);
  }
}

function stopMicrophone(message, keepProgress = false) {
  micGeneration++;
  micPending = false;
  micCleanup?.();
  micCleanup = null;
  clearMicMarks();
  $("mic-panel").hidden = !message;
  $("mic-progress-row").hidden = !keepProgress;
  $("mic-status").textContent = message ?? "";
  $("mic-input").style.removeProperty("--input-level");
  updateModes();
  paint(null);
}

micButton.addEventListener("click", () => {
  if (micCleanup || micPending) stopMicrophone();
  else startMicrophone();
});
window.addEventListener("pagehide", () => {
  if (micCleanup || micPending) stopMicrophone();
});

function buildCustom(input) {
  return {
    id: "custom-tab", group: "自定义 TAB", icon: "♪", name: input.name || "我的 TAB 谱段",
    level: "自定义", style: "四弦 TAB", focus: "当前浏览器中保存", bpm: 70,
    description: "从你导入的四线谱生成，可以直接选拍、调速或用麦克风跟谱。",
    tip: "先用原节奏检查音和休止的位置。需要改时值时，点「导入自定义 TAB」重新编辑。",
    bars: parseTab(input.tab, input.timing)
  };
}

let customSource, customExercise;
try {
  const saved = JSON.parse(localStorage.getItem(customStorage));
  if (saved) {
    customExercise = buildCustom(saved);
    customSource = saved;
  }
} catch {
  // An unavailable or invalid local entry should never prevent opening the exercises.
}

const dialog = $("tab-dialog");
$("import-tab").addEventListener("click", () => {
  $("tab-name").value = customSource?.name ?? "";
  $("tab-input").value = customSource?.tab ?? "";
  $("tab-input").placeholder = customTabExample;
  $("tab-timing").value = customSource?.timing ?? "";
  $("tab-error").hidden = true;
  dialog.showModal();
});
$("tab-cancel").addEventListener("click", () => dialog.close());
$("tab-example").addEventListener("click", () => {
  $("tab-input").value = customTabExample;
  $("tab-timing").value = "";
  $("tab-error").hidden = true;
});
$("tab-form").addEventListener("submit", event => {
  event.preventDefault();
  const input = {name: $("tab-name").value.trim(), tab: $("tab-input").value, timing: $("tab-timing").value};
  try {
    const imported = buildCustom(input);
    customSource = input;
    customExercise = imported;
    try {
      localStorage.setItem(customStorage, JSON.stringify(input));
    } catch {
      announcement.textContent = "谱段已载入本页，但当前浏览器无法永久保存。";
    }
    renderLibrary();
    selectExercise(customExercise);
    dialog.close();
  } catch (error) {
    $("tab-error").textContent = error.message;
    $("tab-error").hidden = false;
  }
});

renderLibrary();
selectExercise(exercise);
