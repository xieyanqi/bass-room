import {digitShapes} from "./digits.js";

const barSteps = 16;
const symbolWidth = 8;
const symbolHeight = 12;
const templates = digitShapes.map(versions => versions.map(([aspect, pixels]) => ({
  aspect, pixels: Uint8Array.from(pixels, Number)
})));

function lineSupport(data, width, y, edge) {
  let count = 0;
  const center = y * width, above = center - edge * width, below = center + edge * width;
  for (let x = 0; x < width; x++) {
    const pixel = data[center + x];
    if (pixel < 246 && Math.min(data[above + x], data[below + x]) - pixel >= 7) count++;
  }
  return count;
}

function findSystems({data, width, height}) {
  const rows = [];
  const minimum = Math.max(54, width * 0.22);
  const edge = Math.max(2, Math.ceil(width / 840));
  for (let y = edge; y < height - edge; y++) {
    const length = lineSupport(data, width, y, edge);
    if (length < minimum) continue;
    const previous = rows.at(-1);
    if (previous && y - previous.last <= Math.max(2, Math.round(width / 1300))) {
      previous.last = y;
      if (length > previous.length) Object.assign(previous, {y, length});
      continue;
    }
    rows.push({y, last: y, length});
  }

  const systems = [];
  for (let index = 0; index < rows.length - 3; index++) {
    const first = rows[index];
    let match;
    // Allow a nearby layout rule or annotation to appear between real strings.
    for (let j = index + 1; j < Math.min(rows.length - 2, index + 5); j++) {
      const gap = rows[j].y - first.y;
      if (gap < Math.max(5, width * 0.003) || gap > width * 0.04) continue;
      const tolerance = Math.max(2.1, gap * 0.17);
      const lines = [first, rows[j]];
      for (const factor of [2, 3]) {
        const expected = first.y + factor * gap;
        const next = rows.find((row, k) => k > j && !lines.includes(row) && Math.abs(row.y - expected) <= tolerance);
        if (next) lines.push(next);
      }
      if (lines.length !== 4) continue;
      if (rows.some(row => Math.abs(row.y - first.y - 4 * gap) <= tolerance ||
          Math.abs(row.y - first.y + gap) <= tolerance)) continue; // A five-line staff.
      match = {lines: lines.map(line => line.y), gap: (lines[3].y - first.y) / 3};
      break;
    }
    if (match) {
      systems.push(match);
      while (index + 1 < rows.length && rows[index + 1].y <= match.lines[3]) index++;
    }
  }
  return systems;
}

function findMeasures({data, width}, {lines, gap}) {
  const [top, , , bottom] = lines;
  const columnHits = new Uint8Array(width);
  for (let x = 0; x < width; x++) {
    columnHits[x] = lines.reduce((n, y) => n + Number(data[y * width + x] < 238), 0);
  }
  const buffer = Math.max(6, Math.round(gap * 2));
  let left = -1, right = -1;
  for (let x = 0; x < width; x++) {
    if (columnHits[x] < 3) continue;
    if (left === -1 && x + buffer < width && countHits(columnHits, x, x + buffer) >= buffer * 0.65) left = x;
    if (x >= buffer && countHits(columnHits, x - buffer, x) >= buffer * 0.65) right = x;
  }
  if (right - left < width * 0.22) return null;

  const bars = [left];
  const minSeparation = Math.max(4, gap * 1.65);
  for (let x = left + Math.round(gap * 3.30); x < right; x++) {
    let dark = 0;
    for (let y = top; y <= bottom; y++) if (data[y * width + x] < 238) dark++;
    if (dark >= (bottom - top + 1) * 0.79 && x - bars.at(-1) > minSeparation) bars.push(x);
  }
  if (right - bars.at(-1) < gap * 0.9) bars[bars.length - 1] = right;
  else bars.push(right);
  return {left, right, bars};
}

function countHits(columns, from, to) {
  let total = 0;
  for (let x = from; x < to; x++) if (columns[x] >= 3) total++;
  return total;
}

function getComponents(raster, region, cutoff, staffLines = []) {
  const {data, width, height} = raster;
  const {x0, x1, y0, y1} = region;
  const left = Math.max(0, Math.floor(x0)), top = Math.max(0, Math.floor(y0));
  const right = Math.min(width, Math.ceil(x1)), bottom = Math.min(height, Math.ceil(y1));
  const w = right - left, h = bottom - top;
  if (w < 2 || h < 2) return [];
  const pixels = new Uint8Array(w * h);
  const reach = Math.max(3, Math.round(region.gap * 0.53));
  for (let y = top; y < bottom; y++) {
    const onLine = staffLines.some(line => Math.abs(line - y) <= Math.max(0.6, region.gap * 0.045));
    for (let x = left; x < right; x++) {
      if (data[y * width + x] >= cutoff) continue;
      const alongRule = onLine && x - reach >= left && x + reach < right &&
        data[y * width + x - reach] < cutoff && data[y * width + x + reach] < cutoff;
      if (alongRule && (y - 2 < top || y + 2 >= bottom ||
          data[(y - 2) * width + x] >= cutoff || data[(y + 2) * width + x] >= cutoff)) continue;
      pixels[(y - top) * w + x - left] = 1;
    }
  }
  const components = [];
  const queue = new Int32Array(w * h);
  for (let seed = 0; seed < pixels.length; seed++) {
    if (pixels[seed] !== 1) continue;
    pixels[seed] = 2;
    let size = 1;
    queue[0] = seed;
    let minX = w, minY = h, maxX = 0, maxY = 0;
    for (let head = 0; head < size; head++) {
      const id = queue[head];
      const cx = id % w, cy = Math.floor(id / w);
      minX = Math.min(minX, cx);
      maxX = Math.max(maxX, cx);
      minY = Math.min(minY, cy);
      maxY = Math.max(maxY, cy);
      for (let yy = Math.max(0, cy - 1); yy <= Math.min(h - 1, cy + 1); yy++) {
        for (let xx = Math.max(0, cx - 1); xx <= Math.min(w - 1, cx + 1); xx++) {
          const neighbor = yy * w + xx;
          if (pixels[neighbor] === 1) {
            pixels[neighbor] = 2;
            queue[size++] = neighbor;
          }
        }
      }
    }
    const bw = maxX - minX + 1, bh = maxY - minY + 1;
    if (size < 3 || bw > region.gap * 3.1 || bh > region.gap * 2.8) continue;
    const glyph = new Uint8Array(bw * bh);
    for (let i = 0; i < size; i++) {
      const id = queue[i];
      glyph[(Math.floor(id / w) - minY) * bw + id % w - minX] = 1;
    }
    components.push({
      x: left + minX, y: top + minY, width: bw, height: bh,
      centerX: left + (minX + maxX) / 2, centerY: top + (minY + maxY) / 2, fill: size / (bw * bh), glyph
    });
  }
  return components;
}

function classifyDigit(component) {
  const {width, height, glyph} = component;
  const pixels = new Float32Array(symbolWidth * symbolHeight);
  // Subpixel area sampling keeps low-resolution screenshots comparable to the templates.
  for (let y = 0; y < symbolHeight; y++) {
    for (let x = 0; x < symbolWidth; x++) {
      let dark = 0;
      for (let sy = 0; sy < 4; sy++) {
        for (let sx = 0; sx < 4; sx++) {
          const iy = Math.floor((y + (sy + 0.5) / 4) * height / symbolHeight);
          const ix = Math.floor((x + (sx + 0.5) / 4) * width / symbolWidth);
          dark += glyph[iy * width + ix];
        }
      }
      pixels[y * symbolWidth + x] = dark * 9 / 16;
    }
  }
  let best = 1, next = 1, digit = -1;
  for (const [value, variations] of templates.entries()) {
    let score = 1;
    for (const variation of variations) {
      let difference = Math.min(0.42, Math.abs(Math.log(width / height / variation.aspect)) * 0.15);
      let n = 0;
      for (let i = 0; i < pixels.length; i++) n += Math.abs(pixels[i] - variation.pixels[i]);
      difference += n / (9 * pixels.length);
      score = Math.min(score, difference);
    }
    if (score < best) {
      next = best;
      best = score;
      digit = value;
    } else next = Math.min(next, score);
  }
  return {digit, score: best, margin: next - best};
}

function detectGlyphs(raster, {lines, gap}, measures) {
  const top = lines[0], bottom = lines[3];
  const components = getComponents(raster, {
    x0: measures.left + 0.1 * gap, x1: measures.right, y0: top - 0.59 * gap,
    y1: bottom + 0.61 * gap, gap
  }, 154, lines);
  const digits = [], rests = [];
  for (const glyph of components) {
    if (measures.bars.some(x => Math.abs(x - glyph.centerX) <= gap * 0.16)) continue;
    let string = 0;
    for (let n = 1; n < lines.length; n++) {
      if (Math.abs(glyph.centerY - lines[n]) < Math.abs(glyph.centerY - lines[string])) string = n;
    }
    const deviation = Math.abs(glyph.centerY - lines[string]) / gap;
    const digitSize = glyph.height >= 0.46 * gap && glyph.height < 1.11 * gap &&
      glyph.width >= 0.16 * gap && glyph.width < 0.88 * gap && deviation <= 0.28;
    if (digitSize) {
      const {digit, score, margin} = classifyDigit(glyph);
      if (digit >= 0 && (score < 0.285 || (score < 0.34 && margin > 0.063))) {
        digits.push({...glyph, string, fret: digit, confidence: score < 0.26 && margin > 0.022});
        continue;
      }
    }
    if (glyph.centerY <= top + gap * 0.58 || glyph.centerY >= bottom - gap * 0.53) continue;
    const blockRest = glyph.width >= gap * 0.60 && glyph.width < gap * 1.55 &&
      glyph.height >= gap * 0.24 && glyph.height <= gap * 0.58 && glyph.fill > 0.74;
    const tallRest = glyph.height >= gap * 1.38 && glyph.height <= gap * 2.25 &&
      glyph.width >= gap * 0.30 && glyph.width <= gap * 0.92;
    const shortRest = deviation > 0.24 && glyph.height >= gap * 0.73 && glyph.height < gap * 1.38 &&
      glyph.width >= gap * 0.44 && glyph.width < gap * 0.87;
    if (!blockRest && !tallRest && !shortRest) continue;
    const dotted = tallRest && components.some(dot => dot.height < gap * 0.31 && dot.width < gap * 0.31 &&
      dot.centerX > glyph.x + glyph.width && dot.centerX - glyph.x < gap * 1.18 &&
      Math.abs(dot.centerY - glyph.centerY) < gap * 0.36);
    rests.push({x: glyph.centerX, rest: true, hint: blockRest ? 8 : tallRest ? (dotted ? 6 : 4) : 2});
  }

  digits.sort((a, b) => a.x - b.x);
  const notes = [];
  for (const [index, digit] of digits.entries()) {
    if (digit.used) continue;
    const next = digits[index + 1];
    const join = next && next.string === digit.string && digit.fret > 0 &&
      next.x - digit.x - digit.width <= Math.max(1.5, gap * 0.18) &&
      next.x - digit.x > gap * 0.19 && digit.fret * 10 + next.fret <= 24;
    const fret = join ? digit.fret * 10 + next.fret : digit.fret;
    let x = digit.centerX;
    if (join) {
      next.used = true;
      x = (digit.x + next.x + next.width - 1) / 2;
    }
    const end = join ? next.x + next.width : digit.x + digit.width;
    const brackets = components.filter(part => part.height >= 0.57 * gap && part.height <= 1.24 * gap &&
      part.width <= gap * 0.33 && Math.abs(part.centerY - lines[digit.string]) <= gap * 0.32);
    const parenthesized = brackets.some(part => digit.x - part.x - part.width >= 0 &&
      digit.x - part.x - part.width <= gap * 0.27) && brackets.some(part => part.x >= end &&
      part.x - end <= gap * 0.27);
    notes.push({x, string: digit.string, fret, parenthesized, confidence: digit.confidence && (!join || next.confidence)});
  }
  return [...notes, ...rests].sort((a, b) => a.x - b.x);
}

function stemDuration(raster, {lines, gap}, symbol) {
  const {data, width, height} = raster;
  const baseline = lines[3];
  const from = Math.min(height, Math.round(baseline + gap * 0.77));
  const until = Math.min(height, Math.round(baseline + gap * 3.25));
  let best = 0, stem = null;
  for (let x = Math.max(0, Math.round(symbol.x - gap * 0.24)); x <= Math.min(width - 1, symbol.x + gap * 0.28); x++) {
    let length = 0, end = 0;
    for (let y = from; y < until; y++) {
      if (data[y * width + x] < 217) length++;
      else if (length) {
        if (length > best) {best = length; stem = {x, end};}
        length = 0;
      }
      end = y;
    }
    if (length > best) {best = length; stem = {x, end};}
  }
  if (!stem || best < gap * 0.69) return null;
  let beams = 0, inBeam = false;
  for (let y = Math.max(from, Math.round(stem.end - gap * 0.64)); y <= Math.min(until - 1, stem.end + 2); y++) {
    const reaches = [-1, 1].some(sign => {
      const a = Math.round(stem.x + sign * gap * 0.17), b = Math.round(stem.x + sign * gap * 0.43);
      return a >= 0 && b >= 0 && a < width && b < width && data[y * width + a] < 212 && data[y * width + b] < 217;
    });
    if (reaches && !inBeam) beams++;
    inBeam = reaches;
  }
  return beams >= 2 ? 1 : beams === 1 ? 2 : 4;
}

export function fitMeasure(symbols, left, right, gap) {
  if (!symbols.length) return {events: [[0, 16]], estimated: true};
  const only = symbols.length === 1 ? symbols[0] : null;
  if (only?.rest) return {events: [[0, 16]], estimated: true};
  const voices = [];
  for (const symbol of symbols) {
    const previous = voices.at(-1);
    if (previous && symbol.x - previous.x < gap * 0.34) {
      if (previous.rest && !symbol.rest) voices[voices.length - 1] = symbol;
    } else voices.push(symbol);
  }
  if (voices.length > barSteps) return null;
  const hinted = voices.reduce((sum, symbol) => sum + (symbol.hint ?? 0), 0);
  const allHinted = voices.every(symbol => symbol.hint);
  const leading = Math.min(gap * 1.65, (right - left) * 0.13, voices[0].x - left);
  const startX = left + leading;
  const width = Math.max(gap, right - startX - gap * 0.45);
  const preference = new Map([[1, 0], [2, 0], [3, 0.2], [4, 0], [6, 0.12], [8, 0.08], [12, 0.28], [16, 0.1]]);
  const cost = (symbol, steps) => {
    if (!symbol.hint) return preference.get(steps) ?? 0.72;
    if (steps === symbol.hint) return 0;
    if (steps === symbol.hint * 1.5) return 0.30;
    if (symbol.hint === 4 && steps === 8) return 0.46;
    return 0.9 + Math.abs(steps - symbol.hint) * 0.38;
  };

  let options = Array.from({length: barSteps}, (_, at) => ({at, cost: at * 0.29, starts: []}));
  for (const [index, symbol] of voices.entries()) {
    const result = new Array(barSteps + 1);
    const projected = (symbol.x - startX) / width * barSteps;
    const exactHint = allHinted && hinted === barSteps;
    for (const option of options) {
      const remaining = voices.length - index - 1;
      const last = index === voices.length - 1;
      const ends = last ? [barSteps] : Array.from({length: Math.max(0, barSteps - remaining - option.at)}, (_, j) => option.at + j + 1);
      for (const end of ends) {
        const duration = end - option.at;
        if (duration < 1 || (exactHint && duration !== symbol.hint)) continue;
        const total = option.cost + cost(symbol, duration) + Math.abs(projected - option.at) * (allHinted ? 0.12 : 0.30);
        if (!result[end] || result[end].cost > total) {
          result[end] = {at: end, cost: total, starts: [...option.starts, option.at]};
        }
      }
    }
    options = result.filter(Boolean);
  }
  const starts = options[0]?.starts ?? [];
  if (starts.length !== voices.length) return null;
  const events = starts[0] ? [[0, starts[0]]] : [];
  let previous = null;
  for (const [i, onset] of starts.entries()) {
    const symbol = voices[i];
    const duration = (starts[i + 1] ?? barSteps) - onset;
    const isTie = symbol.parenthesized && (!previous || (
      previous.string === symbol.string && previous.fret === symbol.fret
    ));
    const event = [onset, duration];
    if (!symbol.rest) {
      event.push(symbol.string, symbol.fret);
      if (isTie) event.push("tie");
    }
    events.push(event);
    previous = symbol;
  }
  return {
    events,
    estimated: !allHinted || hinted !== barSteps || starts[0] !== 0 ||
      voices.some((symbol, i) => events.at(starts[0] ? i + 1 : i)[1] !== symbol.hint || symbol.confidence === false)
  };
}

function detectTempo(raster, systems) {
  for (const {lines, gap} of systems.slice(0, 5)) {
    const parts = getComponents(raster, {
      x0: 0, x1: raster.width, y0: lines[0] - gap * 4.2, y1: lines[0] - gap * 0.16, gap
    }, 192);
    const linesOfEquals = parts.filter(glyph => glyph.width >= gap * 0.30 && glyph.width < gap * 0.9 &&
      glyph.height <= gap * 0.23 && glyph.fill > 0.65);
    for (const dash of linesOfEquals) {
      if (!linesOfEquals.some(other => Math.abs(other.x - dash.x) <= gap * 0.17 &&
        other.y > dash.y && other.y - dash.y <= gap * 0.47)) continue;
      const digits = parts.filter(glyph => glyph.x >= dash.x + dash.width &&
        glyph.x - dash.x <= gap * 3.4 && Math.abs(glyph.centerY - dash.y) < gap * 0.42 &&
        glyph.height >= gap * 0.55 && glyph.height < gap * 1.5)
        .sort((a, b) => a.x - b.x).slice(0, 3);
      if (digits.length < 2) continue;
      const recognized = digits.map(classifyDigit);
      if (recognized.some(digit => digit.digit < 0 || digit.score > 0.36)) continue;
      const bpm = Number(recognized.map(digit => digit.digit).join(""));
      if (bpm >= 40 && bpm <= 220) return bpm;
    }
  }
  return null;
}

function correctTilt(raster) {
  const {data, width, height} = raster;
  const edge = Math.max(2, Math.round(width / 750));
  const stride = Math.max(3, Math.round(width / 260));
  const points = [];
  for (let y = edge; y < height - edge; y++) {
    for (let x = 0; x < width; x += stride) {
      const pixel = data[y * width + x];
      if (pixel < 240 && Math.min(data[(y - edge) * width + x], data[(y + edge) * width + x]) - pixel >= 10) {
        points.push(x, y);
      }
    }
  }
  const rows = new Uint16Array(height);
  let best = 0, slope = 0;
  for (let step = -20; step <= 20; step++) {
    const candidate = step * 0.003;
    rows.fill(0);
    for (let n = 0; n < points.length; n += 2) {
      const row = Math.round(points[n + 1] - candidate * (points[n] - width / 2));
      if (row >= 0 && row < height) rows[row]++;
    }
    let score = 0;
    for (const count of rows) if (count >= width / stride * 0.22) score += count ** 2;
    if (score > best) {
      best = score;
      slope = candidate;
    }
  }
  if (!slope) return null;
  const result = new Uint8Array(data.length);
  for (let x = 0; x < width; x++) {
    const offset = Math.round(slope * (x - width / 2));
    for (let y = 0; y < height; y++) {
      const sourceRow = y + offset;
      result[y * width + x] = sourceRow >= 0 && sourceRow < height ? data[sourceRow * width + x] : 255;
    }
  }
  return {data: result, width, height};
}

export function readTabImage(raster) {
  const {width, height, data} = raster;
  if (width < 240 || height < 60 || data.length !== width * height) return {bars: [], bpm: null};
  const original = readSystems(raster);
  if (original.bars.length) return original;
  const straight = correctTilt(raster);
  return straight ? readSystems(straight) : original;
}

function readSystems(raster) {
  const systems = findSystems(raster);
  const bars = [];
  for (const system of systems) {
    const measures = findMeasures(raster, system);
    if (!measures || measures.bars.length < 2) continue;
    const symbols = detectGlyphs(raster, system, measures);
    if (!symbols.some(symbol => symbol.fret !== undefined)) continue;
    for (const symbol of symbols) {
      if (!symbol.rest) symbol.hint = stemDuration(raster, system, symbol);
    }
    for (let index = 1; index < measures.bars.length; index++) {
      const left = measures.bars[index - 1], right = measures.bars[index];
      if (right - left < system.gap * 1.2) continue;
      const inBar = symbols.filter(symbol => symbol.x > left && symbol.x <= right);
      const converted = fitMeasure(inBar, left, right, system.gap);
      if (converted) bars.push(converted);
    }
  }
  return {bars, bpm: detectTempo(raster, systems)};
}
