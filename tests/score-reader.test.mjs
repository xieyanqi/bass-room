import test from "node:test";
import assert from "node:assert/strict";
import {digitShapes} from "../dist/digits.js";
import {fitMeasure, readTabImage} from "../dist/score-reader.js";
import {makeWindow} from "../dist/practice.js";

function practiceRaster(stringCount = 4) {
  const width = 800, height = 240;
  const data = new Uint8Array(width * height).fill(255);
  const line = (x0, y0, x1, y1, value) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) data[y * width + x] = value;
  };
  for (let n = 0; n < stringCount; n++) line(30, 78 + n * 19, 770, 78 + n * 19, 171);
  for (const x of [30, 400, 770]) line(x, 78, x, 78 + (stringCount - 1) * 19, 171);
  for (const [x, string, fret] of [[63,3,0],[153,3,3],[243,2,2],[333,2,5],[437,1,0],[527,1,2],[617,2,3],[707,3,5]]) {
    const y = 78 + string * 19;
    line(x - 7, y - 8, x + 7, y + 8, 255);
    const [aspect, shape] = digitShapes[fret][1];
    const h = 14, w = Math.round(h * aspect);
    for (let yy = 0; yy < h; yy++) {
      for (let xx = 0; xx < w; xx++) {
        const ink = Number(shape[Math.floor(yy * 12 / h) * 8 + Math.floor(xx * 8 / w)]);
        data[(y + yy - 7) * width + x + xx - Math.floor(w / 2)] = 255 - Math.round(ink / 9 * 255);
      }
    }
    line(x, 150, x, 174, 80);
  }
  return {data, width, height};
}

test("TAB raster separates strings and reads frets and printed quarter stems", () => {
  const result = readTabImage(practiceRaster());
  assert.deepEqual(result.bars.map(bar => bar.events), [
    [[0,4,3,0],[4,4,3,3],[8,4,2,2],[12,4,2,5]],
    [[0,4,1,0],[4,4,1,2],[8,4,2,3],[12,4,3,5]]
  ]);
});

test("small photo tilt can be corrected before reading the TAB", () => {
  const raster = practiceRaster();
  const data = new Uint8Array(raster.data.length).fill(255);
  for (let x = 0; x < raster.width; x++) {
    const shift = Math.round((x - 400) * 0.025);
    for (let y = 0; y < raster.height; y++) {
      const destination = y + shift;
      if (destination >= 0 && destination < raster.height) {
        data[destination * raster.width + x] = raster.data[y * raster.width + x];
      }
    }
  }
  assert.equal(readTabImage({...raster, data}).bars.length, 2);
});

test("a scan without a four-line TAB system produces no practice", () => {
  const raster = practiceRaster(5);
  assert.equal(readTabImage(raster).bars.length, 0);
  assert.equal(readTabImage({...raster, data: new Uint8Array(raster.data.length).fill(255)}).bars.length, 0);
});

test("visible duration marks take precedence over horizontal spacing", () => {
  const fitted = fitMeasure([
    {x: 27, rest: true, hint: 6},
    {x: 99, string: 2, fret: 4, hint: 4},
    {x: 154, string: 1, fret: 4, hint: 4},
    {x: 184, string: 1, fret: 3, hint: 2}
  ], 0, 250, 12);
  assert.deepEqual(fitted.events, [[0,6],[6,4,2,4],[10,4,1,4],[14,2,1,3]]);
  assert.equal(fitted.estimated, false);
});

test("a recognized tied note lasts across its barline and respects a loop boundary", () => {
  const bars = [[[0,16,3,0]], [[0,8,3,0,"tie"],[8,8,2,2]]];
  const whole = makeWindow(bars, 0, 31);
  assert.equal(whole[0].duration, 24);
  assert.equal(whole[16].starts, false);
  assert.equal(makeWindow(bars, 8, 17)[0].duration, 10);
  assert.equal(makeWindow(bars, 16, 23)[0].starts, true);
});
