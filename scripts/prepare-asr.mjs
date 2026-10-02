import { copyFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const source = new URL('../node_modules/onnxruntime-web/dist/', import.meta.url);
const destination = new URL('../public/asr/runtime/', import.meta.url);
await mkdir(destination, { recursive: true });
for (const name of [
  'ort.wasm.min.mjs',
  'ort-wasm-simd-threaded.mjs',
  'ort-wasm-simd-threaded.wasm',
]) {
  await copyFile(new URL(name, source), new URL(name, destination));
}
console.log(`Prepared local ONNX Runtime Web assets in ${fileURLToPath(destination)}`);
