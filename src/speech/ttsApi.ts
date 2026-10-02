export class SanskritSpeechError extends Error {}

export async function fetchSanskritSpeech(
  text: string,
  endpoint = process.env.EXPO_PUBLIC_TTS_API_URL,
): Promise<Blob> {
  if (!endpoint) {
    throw new SanskritSpeechError('EXPO_PUBLIC_TTS_API_URL is not configured.');
  }
  const response = await fetch(`${endpoint.replace(/\/$/, '')}/v1/speak`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!response.ok) {
    let message = `Sanskrit speech failed (${response.status}).`;
    try {
      const payload = await response.json() as { detail?: string };
      if (payload.detail) message = payload.detail;
    } catch {
      // Keep the status-based error when the service did not return JSON.
    }
    throw new SanskritSpeechError(message);
  }
  if (!response.headers.get('content-type')?.startsWith('audio/wav')) {
    throw new SanskritSpeechError('The Sanskrit speech service returned an invalid response.');
  }
  return response.blob();
}
