import {strings, STEPS_PER_BAR, STEPS_PER_BEAT} from "./exercises.js";

export function countLabel(step) {
  return step % STEPS_PER_BEAT === 0
    ? String(Math.floor(step / STEPS_PER_BEAT) + 1)
    : ["", "e", "&", "a"][step % STEPS_PER_BEAT];
}

export function stepLabel(step) {
  const bar = Math.floor(step / STEPS_PER_BAR) + 1;
  const slot = step % STEPS_PER_BAR;
  const beat = Math.floor(slot / STEPS_PER_BEAT) + 1;
  const subdivision = slot % STEPS_PER_BEAT;
  return "第 " + bar + " 小节 · " + beat + (subdivision ? " " + countLabel(slot) : "") + " 拍";
}

export function makeWindow(bars, first, last) {
  const total = bars.length * STEPS_PER_BAR;
  const length = (last - first + total) % total + 1;
  return Array.from({length}, (_, index) => {
    const absolute = (first + index) % total;
    const bar = Math.floor(absolute / STEPS_PER_BAR);
    const slot = absolute % STEPS_PER_BAR;
    const event = bars[bar].find(([start, duration]) => start <= slot && slot < start + duration);
    const starts = index === 0 || event[0] === slot;
    const duration = Math.min(event[0] + event[1] - slot, length - index);
    return {absolute, bar, slot, event, starts, duration};
  });
}

const noteNames = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];

export function pitchName(midi) {
  return noteNames[midi % 12] + (Math.floor(midi / 12) - 1);
}

export const customTabExample = [
  "G|--------|--------|",
  "D|--------|0-------|",
  "A|----0-2-|--3-2-0-|",
  "E|0-3-----|--------|"
].join("\n");

export function parseTab(tab, timing) {
  const rows = tab.trim().split(/\r?\n/).filter(line => line.trim()).map(line => {
    const match = /^\s*([GDAE])\s*\|([0-9| -]+)\|?\s*$/i.exec(line);
    if (!match) throw new Error("请输入以 G|、D|、A|、E| 开头的四行简谱，使用 -、品位数字和 |。");
    return [match[1].toUpperCase(), match[2].replace(/\|$/, "").split("|")];
  });
  const barCount = rows[0]?.[1].length;
  const tracks = new Map(rows);
  if (rows.length !== 4 || tracks.size !== 4 || !barCount || barCount > 16 ||
      rows.some(([, bars]) => bars.length !== barCount)) {
    throw new Error("需要 G、D、A、E 各一行，1 到 16 小节。每行的小节数要一致。");
  }

  const timingBars = timing.trim() ? timing.trim().replace(/^\||\|$/g, "").split("|") : null;
  if (timingBars && timingBars.length !== barCount) throw new Error("时值栏和 TAB 的小节数需要一致。");

  const bars = Array.from({length: barCount}, (_, barIndex) => {
    const barLabel = "第 " + (barIndex + 1) + " 小节";
    const widths = new Set([...tracks.values()].map(track => track[barIndex].length));
    if (widths.size !== 1) throw new Error(barLabel + "的四根弦需要等宽，让数字按列对齐。");
    const notes = strings.flatMap(({name}, string) =>
      [...tracks.get(name)[barIndex].matchAll(/\d+/g)].map(match => ({
        string, column: match.index, fret: Number(match[0])
      }))
    ).sort((a, b) => a.column - b.column);
    if (notes.some((note, index) => note.fret > 24 || note.column === notes[index - 1]?.column)) {
      throw new Error(barLabel + "需要逐个单音，品位范围为 0–24。");
    }
    const tokens = timingBars?.[barIndex].trim().split(/\s+/) ?? defaultTiming(notes.length);
    const durations = {"0.25": 1, "0.5": 2, "1": 4, "2": 8, "4": 16};
    if (!tokens || tokens.filter(token => !token.startsWith("r")).length !== notes.length) {
      throw new Error(barLabel + "的音数无法匹配时值，请为每个音写一个时值。");
    }
    let cursor = 0;
    let noteIndex = 0;
    const events = tokens.map(token => {
      const rest = token.startsWith("r");
      const length = durations[rest ? token.slice(1) : token];
      if (!length) throw new Error(barLabel + "的时值只能是 0.25、0.5、1、2、4，可加 r 表示休止。");
      const event = [cursor, length];
      cursor += length;
      if (!rest) {
        const {string, fret} = notes[noteIndex++];
        event.push(string, fret);
      }
      return event;
    });
    if (cursor !== STEPS_PER_BAR) throw new Error(barLabel + "的时值总和需要正好是 4 拍。");
    return events;
  });
  if (!bars.some(bar => bar.some(event => event.length === 4))) throw new Error("请至少添加一个音。");
  return bars;
}

function defaultTiming(noteCount) {
  if (!noteCount) return ["r4"];
  if (![1, 2, 4, 8, 16].includes(noteCount)) return null;
  return Array(noteCount).fill(String(4 / noteCount));
}
