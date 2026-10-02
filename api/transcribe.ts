export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed.' }, { status: 405 });
  }
  if (!process.env.OPENAI_API_KEY) {
    return Response.json({ error: 'Speech transcription is not configured.' }, { status: 503 });
  }

  let audio: unknown;
  try {
    const readFormData = request.formData as unknown as () => Promise<{ get(name: string): unknown }>;
    audio = (await readFormData.call(request)).get('audio');
  } catch {
    return Response.json({ error: 'Invalid audio upload.' }, { status: 400 });
  }

  if (!(audio instanceof File) || audio.size === 0) {
    return Response.json({ error: 'A non-empty audio file is required.' }, { status: 400 });
  }
  if (audio.size > 20 * 1024 * 1024) {
    return Response.json({ error: 'The recording must be smaller than 20 MB.' }, { status: 413 });
  }

  const formData = new FormData();
  formData.append('file', audio, audio.name || 'practice.m4a');
  formData.append('model', process.env.OPENAI_TRANSCRIBE_MODEL ?? 'gpt-4o-mini-transcribe');
  formData.append('language', 'sa');
  formData.append('prompt', 'This is a learner speaking Classical Sanskrit.');

  const openAIResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: formData,
  });

  if (!openAIResponse.ok) {
    const detail = await openAIResponse.text();
    console.error('OpenAI transcription error', openAIResponse.status, detail);
    return Response.json({ error: 'The recording could not be transcribed.' }, { status: 502 });
  }

  const result = await openAIResponse.json() as { text?: string };
  if (!result.text?.trim()) {
    return Response.json({ error: 'No speech was detected. Please try again.' }, { status: 422 });
  }
  return Response.json({ text: result.text.trim() });
}
