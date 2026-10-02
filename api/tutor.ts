const supportLanguages = {
  en: 'English',
  hi: 'Hindi',
  te: 'Telugu',
} as const;

type TutorMessage = {
  role: 'tutor' | 'learner';
  sanskrit?: string;
  transliteration?: string;
  support?: string;
};

type TutorRequest = {
  supportLanguage?: keyof typeof supportLanguages;
  level?: 'beginner' | 'intermediate' | 'advanced';
  lessonId?: string;
  message?: string;
  history?: TutorMessage[];
};

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed.' }, { status: 405 });
  }
  if (!process.env.OPENAI_API_KEY) {
    return Response.json({ error: 'The tutor is not configured. Set OPENAI_API_KEY on the server.' }, { status: 503 });
  }

  let body: TutorRequest;
  try {
    body = await request.json() as TutorRequest;
  } catch {
    return Response.json({ error: 'Invalid JSON request.' }, { status: 400 });
  }

  const language = body.supportLanguage && supportLanguages[body.supportLanguage];
  if (!language || !body.message?.trim() || !body.level || !body.lessonId) {
    return Response.json({ error: 'supportLanguage, level, lessonId, and message are required.' }, { status: 400 });
  }

  const history = (body.history ?? []).slice(-6).map((message) => ({
    role: message.role === 'tutor' ? 'assistant' : 'user',
    content: message.role === 'tutor'
      ? [message.sanskrit, message.transliteration, message.support].filter(Boolean).join('\n')
      : message.sanskrit ?? '',
  }));

  const systemPrompt = `You are Vākya, a warm and precise spoken Sanskrit tutor.
The target language is Sanskrit. The learner's support language is ${language}; use it only for concise explanations and corrections.
The learner is ${body.level} and is practising the lesson "${body.lessonId}".
Respond primarily in natural, conversational Classical Sanskrit. Never route Sanskrit through Hindi internally.
Correct errors gently, praise real progress, and ask one short follow-up question that continues the lesson.
Keep the Sanskrit suitable for the learner's level.
Return only JSON matching this schema:
{"sanskrit":"Devanagari response","transliteration":"IAST transliteration","support":"one concise ${language} explanation or correction"}
Do not include markdown or additional keys.`;

  const openAIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
      temperature: 0.5,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: body.message.trim() },
      ],
    }),
  });

  if (!openAIResponse.ok) {
    const detail = await openAIResponse.text();
    console.error('OpenAI tutor error', openAIResponse.status, detail);
    return Response.json({ error: 'The Sanskrit tutor is temporarily unavailable.' }, { status: 502 });
  }

  const result = await openAIResponse.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = result.choices?.[0]?.message?.content;
  if (!content) {
    console.error('OpenAI tutor returned no content');
    return Response.json({ error: 'The tutor returned an empty response.' }, { status: 502 });
  }

  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    if (
      typeof parsed.sanskrit !== 'string'
      || typeof parsed.transliteration !== 'string'
      || typeof parsed.support !== 'string'
    ) {
      throw new Error('Response fields were missing');
    }
    return Response.json({
      sanskrit: parsed.sanskrit,
      transliteration: parsed.transliteration,
      support: parsed.support,
    });
  } catch (error) {
    console.error('Invalid tutor response', error, content);
    return Response.json({ error: 'The tutor returned an invalid response.' }, { status: 502 });
  }
}
