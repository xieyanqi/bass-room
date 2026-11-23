import {copyFile, cp, mkdir} from "node:fs/promises";
import {createRequire} from "node:module";
import {dirname, join} from "node:path";

const resolve = createRequire(import.meta.url).resolve;
const source = dirname(resolve("pdfjs-dist/package.json"));
const target = new URL("../dist/vendor/", import.meta.url);
await mkdir(target, {recursive: true});
for (const [from, to] of [
  ["build/pdf.min.mjs", "pdf.min.mjs"],
  ["build/pdf.worker.min.mjs", "pdf.worker.min.mjs"],
  ["LICENSE", "PDFJS-LICENSE.txt"]
]) {
  await copyFile(join(source, from), new URL(to, target));
}
for (const directory of ["cmaps", "standard_fonts", "wasm", "iccs"]) {
  await cp(join(source, directory), new URL(directory, target), {recursive: true});
}
