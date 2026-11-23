const maxPages = 30;
const maxBytes = 30 * 1024 * 1024;

const vendor = name => new URL("./vendor/" + name, import.meta.url).href;

function makeCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

function grayscale(canvas) {
  const {width, height} = canvas;
  const rgba = canvas.getContext("2d").getImageData(0, 0, width, height).data;
  const data = new Uint8Array(width * height);
  for (let i = 0; i < data.length; i++) {
    const at = i * 4;
    const r = rgba[at], g = rgba[at + 1], b = rgba[at + 2];
    const luminance = (77 * r + 150 * g + 29 * b) >> 8;
    const color = Math.max(r, g, b) - Math.min(r, g, b);
    // Light annotations and playback overlays should not add musical symbols.
    data[i] = color > 48 && luminance > 100 ? 255 : luminance;
  }
  return {data, width, height};
}

function scan(worker, raster, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new DOMException("已取消识别。", "AbortError"));
    signal.addEventListener("abort", abort, {once: true});
    worker.onmessage = ({data}) => {
      signal.removeEventListener("abort", abort);
      if (data.error) reject(new Error(data.error));
      else resolve(data);
    };
    worker.onerror = () => {
      signal.removeEventListener("abort", abort);
      reject(new Error("谱面识别器无法启动，请刷新后重试。"));
    };
    if (signal.aborted) {
      signal.removeEventListener("abort", abort);
      abort();
    } else worker.postMessage(raster, [raster.data.buffer]);
  });
}

function thumbnail(canvas) {
  const scale = Math.min(1, 1120 / Math.max(canvas.width, canvas.height));
  const preview = makeCanvas(canvas.width * scale, canvas.height * scale);
  preview.getContext("2d").drawImage(canvas, 0, 0, preview.width, preview.height);
  return preview.toDataURL("image/jpeg", 0.8);
}

function textTempo(text) {
  const match = text.match(/(?:♩|♪|\bBPM\s*[:：]?)\s*(?:=\s*)?(\d{2,3})|=\s*(\d{2,3})\b/i);
  const number = Number(match?.[1] ?? match?.[2]);
  return number >= 40 && number <= 220 ? number : null;
}

async function readPDF(file, consume, signal, progress) {
  let pdfjs;
  try {
    pdfjs = await import(vendor("pdf.min.mjs"));
  } catch {
    throw new Error("PDF 组件加载失败。请刷新后重试，或先将谱面存为图片。");
  }
  pdfjs.GlobalWorkerOptions.workerSrc = vendor("pdf.worker.min.mjs");
  const task = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    isEvalSupported: false,
    useSystemFonts: true,
    cMapUrl: vendor("cmaps/"),
    cMapPacked: true,
    standardFontDataUrl: vendor("standard_fonts/"),
    wasmUrl: vendor("wasm/"),
    iccUrl: vendor("iccs/")
  });
  let destroy;
  const cancel = () => { destroy ??= task.destroy().catch(() => {}); };
  signal.addEventListener("abort", cancel, {once: true});
  if (signal.aborted) cancel();
  try {
    const document = await task.promise;
    if (document.numPages > maxPages) throw new Error("请先把 PDF 拆成每份最多 " + maxPages + " 页再导入。");
    for (let number = 1; number <= document.numPages; number++) {
      signal.throwIfAborted();
      progress(number, document.numPages);
      const page = await document.getPage(number);
      const natural = page.getViewport({scale: 1});
      const scale = Math.min(3.7, 2650 / Math.max(natural.width, natural.height));
      const viewport = page.getViewport({scale});
      const canvas = makeCanvas(viewport.width, viewport.height);
      await page.render({canvas, canvasContext: canvas.getContext("2d"), viewport, background: "#ffffff"}).promise;
      const text = await page.getTextContent().catch(() => ({items: []}));
      const bpm = textTempo(text.items.map(item => item.str ?? "").join(" "));
      await consume(canvas, number, bpm);
      page.cleanup();
    }
    return document.numPages;
  } catch (error) {
    if (error.name === "PasswordException") throw new Error("这份 PDF 有密码。请解锁后重新上传。");
    if (error.name === "InvalidPDFException") throw new Error("无法打开这份 PDF。请检查文件是否完整。");
    throw error;
  } finally {
    signal.removeEventListener("abort", cancel);
    cancel();
    await destroy;
  }
}

async function readImage(file, consume) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("无法打开图片。请上传 PNG、JPG 或 WebP。");
  }
  try {
    const scale = Math.min(2.5, 2650 / Math.max(bitmap.width, bitmap.height));
    const canvas = makeCanvas(bitmap.width * scale, bitmap.height * scale);
    const context = canvas.getContext("2d");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    await consume(canvas, 1, null);
  } finally {
    bitmap.close();
  }
  return 1;
}

export async function importScore(file, {signal, progress}) {
  if (file.size > maxBytes) throw new Error("文件超过 30 MB，请缩小或拆分后重试。");
  const pdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (!pdf && !/\.(?:png|jpe?g|webp)$/i.test(file.name)) throw new Error("请选择 PDF、PNG、JPG 或 WebP 文件。");
  const worker = new Worker(new URL("./score-worker.js", import.meta.url), {type: "module"});
  const bars = [], metadata = [], missed = [];
  let bpm = null, preview = null;
  const consume = async (canvas, page, printedBpm) => {
    signal.throwIfAborted();
    const result = await scan(worker, grayscale(canvas), signal);
    if (!result.bars.length) {
      missed.push(page);
      return;
    }
    preview ??= thumbnail(canvas);
    bpm ??= result.bpm ?? printedBpm;
    for (const bar of result.bars) {
      bars.push(bar.events);
      metadata.push({page, estimated: bar.estimated});
    }
  };

  try {
    const pages = pdf
      ? await readPDF(file, consume, signal, progress)
      : await readImage(file, consume);
    if (!bars.length || !bars.some(bar => bar.some(event => event.length >= 4))) {
      throw new Error("没识别到四弦 TAB。请裁出平整清晰的四条弦线，保留品位数字和小节线。");
    }
    return {
      name: file.name.replace(/\.[^.]+$/, "").slice(0, 75), bpm, bars, metadata, pages, missed, preview
    };
  } finally {
    worker.terminate();
  }
}
