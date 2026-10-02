export class AudioInputError extends Error {
  constructor(public code: 'duration' | 'silence') {
    super(code);
  }
}

export async function decodeRecording(blob: Blob): Promise<Float32Array> {
  if (blob.size === 0 || blob.size > 10 * 1024 * 1024) throw new AudioInputError('duration');
  const context = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await context.decodeAudioData(await blob.arrayBuffer());
  } finally {
    await context.close();
  }
  if (decoded.duration < 0.4 || decoded.duration > 15) throw new AudioInputError('duration');
  const offline = new OfflineAudioContext(1, Math.round(decoded.duration * 16000), 16000);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const pcm = (await offline.startRendering()).getChannelData(0);
  let sum = 0;
  for (const value of pcm) sum += value * value;
  if (Math.sqrt(sum / pcm.length) < 0.001) throw new AudioInputError('silence');
  return pcm;
}
