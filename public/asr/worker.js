import * as ort from './runtime/ort.wasm.min.mjs';
import { decodeCtc } from './ctc.js';

const REVISION = 'd320b7aada7f844b2c78d4f6c935aba77d0327a0';
const BASE = `https://huggingface.co/gnumanth/sushrota-sanskrit-asr-onnx/resolve/${REVISION}/`;
const CACHE = `vakya-sushrota-${REVISION}`;
const MODEL = 'sushrota_sanskrit_ctc_int8.onnx';
const MODEL_BYTES = 187484189;
const MODEL_SHA256 = '6a52c782ecbc3cfc389eac2832d069677c587b6693c2ca4e68ea7ad7d59f3e64';
ort.env.wasm.numThreads = 1;
ort.env.wasm.wasmPaths = new URL('./runtime/', import.meta.url).href;

let preprocessor;
let model;
let vocab;
let busy = false;

function notify(type, extra = {}) {
  self.postMessage({ type, ...extra });
}

async function asset(name) {
  const url = BASE + name;
  let cache;
  try {
    cache = await caches.open(CACHE);
    const cached = await cache.match(url);
    if (cached) return await cached.arrayBuffer();
  } catch (error) {
    console.warn('ASR cache read unavailable', error);
    notify('warning', { code: 'cache' });
  }
  const response = await fetch(url, { signal: AbortSignal.timeout(300000) });
  if (!response.ok || !response.body) throw new Error(`Model asset download failed (${response.status}).`);
  const reader = response.body.getReader();
  const parts = [];
  let loaded = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    loaded += value.length;
    parts.push(value);
    if (name === MODEL) notify('progress', { progress: Math.min(99, Math.floor(loaded / MODEL_BYTES * 100)) });
  }
  const result = new Uint8Array(loaded);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  if (cache) {
    try {
      await cache.put(url, new Response(result));
    } catch (error) {
      console.warn('ASR model could not be cached', error);
      notify('warning', { code: 'cache' });
    }
  }
  return result.buffer;
}

async function initialize() {
  const vocabBytes = await asset('sanskrit_vocab.json');
  vocab = JSON.parse(new TextDecoder().decode(vocabBytes));
  if (Object.keys(vocab).length !== 257) throw new Error('Invalid Sanskrit vocabulary.');
  preprocessor = await ort.InferenceSession.create(await asset('preprocessor.onnx'), { executionProviders: ['wasm'] });
  const bytes = await asset(MODEL);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hex = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
  if (hex !== MODEL_SHA256) {
    try {
      const cache = await caches.open(CACHE);
      await cache.delete(BASE + MODEL);
    } catch (error) {
      console.warn('Could not remove invalid cached model', error);
    }
    throw new Error('Model integrity check failed. Please download it again.');
  }
  notify('progress', { progress: 100 });
  model = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
  notify('ready');
}

async function transcribe(pcm) {
  if (!model || !preprocessor) throw new Error('Download the recognition model first.');
  if (!(pcm instanceof Float32Array) || pcm.length < 6400 || pcm.length > 240000) {
    throw new Error('Expected 0.4 to 15 seconds of 16 kHz audio.');
  }
  const tensors = [];
  const start = performance.now();
  try {
    const input = new ort.Tensor('float32', pcm, [1, pcm.length]);
    const length = new ort.Tensor('int64', BigInt64Array.from([BigInt(pcm.length)]), [1]);
    tensors.push(input, length);
    const features = await preprocessor.run({ audio_signal: input, length });
    tensors.push(...Object.values(features));
    const outputs = await model.run({ audio_signal: features.features, length: features.feature_lengths });
    tensors.push(...Object.values(outputs));
    if (!outputs.logits) throw new Error('Model did not return Sanskrit logits.');
    const text = decodeCtc(outputs.logits.data, outputs.logits.dims, vocab);
    notify('result', { text, milliseconds: Math.round(performance.now() - start) });
  } finally {
    for (const tensor of tensors) tensor.dispose();
  }
}

self.onmessage = async ({ data }) => {
  if (busy) {
    notify('error', { code: 'busy', detail: 'Recognition is already running.' });
    return;
  }
  busy = true;
  try {
    if (data.type === 'load') await initialize();
    else if (data.type === 'transcribe') await transcribe(data.pcm);
    else throw new Error('Unknown recognition request.');
  } catch (error) {
    console.error('Local Sanskrit recognition failed', error);
    notify('error', { code: data.type === 'load' ? 'model' : 'inference', detail: String(error) });
  } finally {
    busy = false;
  }
};
