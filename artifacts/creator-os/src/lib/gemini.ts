// Schema "Type" enum kept compatible with the previous @google/genai usage
// so the rest of this file can keep its existing schema literals.
export const Type = {
  STRING: "STRING",
  NUMBER: "NUMBER",
  INTEGER: "INTEGER",
  BOOLEAN: "BOOLEAN",
  ARRAY: "ARRAY",
  OBJECT: "OBJECT",
} as const;

import { authFetch, API_BASE as AUTH_API_BASE } from "@/lib/auth";

const API_BASE = AUTH_API_BASE;

export type ChatAttachment = {
  name: string;
  mimeType: string;
  data: string; // base64-encoded raw bytes (no data: prefix)
};

async function callRaw(
  prompt: string,
  schema?: any,
  systemInstruction?: string,
  attachments?: ChatAttachment[],
): Promise<string> {
  const res = await authFetch(`${API_BASE}/ai/raw`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, schema, systemInstruction, attachments }),
  });
  if (!res.ok) {
    let msg = `AI request failed (${res.status})`;
    try {
      const j = await res.json();
      if (j?.error) msg = j.error;
    } catch {}
    throw new Error(msg);
  }
  const data = await res.json();
  return data.text ?? "";
}

async function generateText(
  prompt: string,
  systemInstruction?: string,
  attachments?: ChatAttachment[],
) {
  return callRaw(prompt, undefined, systemInstruction, attachments);
}

async function generateJson<T>(prompt: string, schema: any, systemInstruction?: string): Promise<T> {
  const text = await callRaw(prompt, schema, systemInstruction);
  return JSON.parse(text || "{}") as T;
}

// ============ AI Goal Coach ============
export type GoalSuggestionType = "subscribers" | "views" | "videos";

export type SuggestedGoal = {
  title: string;
  type: GoalSuggestionType;
  targetValue: number;
  daysFromNow: number;
  reasoning: string;
  category: "growth" | "content" | "skill";
};

export type SuggestGoalsBody = {
  channelName: string;
  niche: string;
  description?: string;
  subscriberCount: number;
  totalViews: number;
  videosPublished: number;
  existingGoals?: { title: string; type: string }[];
};

export type SuggestGoalsResponse = { goals: SuggestedGoal[] };

export async function generateGoalSuggestions(
  body: SuggestGoalsBody,
): Promise<SuggestGoalsResponse> {
  const existing = (body.existingGoals ?? [])
    .map((g) => `- ${g.title} (${g.type})`)
    .join("\n");

  const prompt = `You are a YouTube growth coach for "${body.channelName}", a Hindi ${body.niche} channel.

Current stats:
- Subscribers: ${body.subscriberCount.toLocaleString()}
- Total views: ${body.totalViews.toLocaleString()}
- Videos published: ${body.videosPublished}
${body.description ? `Channel description: ${body.description}` : ""}

${existing ? `Goals they already have:\n${existing}\n\nDO NOT duplicate the above.` : "They have no goals set yet."}

Propose exactly 4 SMART goals (Specific, Measurable, Ambitious-but-Achievable, Relevant, Time-bound).
Mix of:
- 2 GROWTH goals (subscribers OR views) — ambitious but realistic for the next 60-90 days based on current size.
- 1 CONTENT goal (videos published in a window — weekly/monthly cadence).
- 1 STRETCH/skill goal (e.g. "First viral video — 100K views on a single video", "Reach 10K subs", etc).

For each goal:
- title: short punchy goal name in English (max 8 words)
- type: one of "subscribers" | "views" | "videos"
- targetValue: realistic numeric target
- daysFromNow: realistic deadline window in days (30, 60, 90, 180, 365)
- reasoning: ONE Hinglish sentence explaining why this number/timeframe is right for them
- category: one of "growth" | "content" | "skill"

Return JSON only.`;

  return generateJson<SuggestGoalsResponse>(prompt, {
    type: Type.OBJECT,
    properties: {
      goals: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            type: { type: Type.STRING },
            targetValue: { type: Type.NUMBER },
            daysFromNow: { type: Type.NUMBER },
            reasoning: { type: Type.STRING },
            category: { type: Type.STRING },
          },
          required: [
            "title",
            "type",
            "targetValue",
            "daysFromNow",
            "reasoning",
            "category",
          ],
        },
      },
    },
    required: ["goals"],
  });
}

// ============ Best Upload Times ============
export type BestTimeSlot = {
  day:
    | "Monday"
    | "Tuesday"
    | "Wednesday"
    | "Thursday"
    | "Friday"
    | "Saturday"
    | "Sunday";
  time: string; // "HH:mm" 24h IST
  videoType: "Long" | "Short" | "Reel" | "Any";
  reasoning: string;
  score: number; // 1-10
};

export type BestUploadTimesBody = {
  channelName: string;
  niche: string;
  description?: string;
  language?: string;
  audience?: string;
  recentTitles?: string[];
};

export type BestUploadTimesResponse = {
  slots: BestTimeSlot[];
  summary: string;
};

export async function generateBestUploadTimes(
  body: BestUploadTimesBody,
): Promise<BestUploadTimesResponse> {
  const titles = (body.recentTitles ?? []).slice(0, 15).map((t) => `- ${t}`).join("\n");
  const prompt = `You are a YouTube algorithm + audience-behavior expert.

Channel: "${body.channelName}"
Niche: ${body.niche}
${body.description ? `Description: ${body.description}` : ""}
${body.language ? `Primary language: ${body.language}` : "Primary language: Hindi"}
${body.audience ? `Audience: ${body.audience}` : ""}
${titles ? `Recent video titles:\n${titles}` : ""}

Recommend the 5 BEST day + time slots (in IST, 24h "HH:mm") for this creator to publish in the coming week.
Base it on:
- Niche-specific viewer behavior in India (e.g. tech audience evening/late-night, kids morning, finance lunch break, etc.)
- Day-of-week patterns (Friday/Sunday peaks for entertainment, weekday evenings for educational)
- Mix of formats: include at least 1 Long-form slot, 1 Short/Reel slot, and 1 weekend slot.

For each slot return:
- day: full weekday name
- time: 24h "HH:mm" IST
- videoType: "Long" | "Short" | "Reel" | "Any"
- reasoning: ONE concise Hinglish sentence why this slot is great for THIS niche
- score: 1-10 confidence

Also return a short overall "summary" sentence about this channel's optimal cadence.
Return JSON only.`;

  return generateJson<BestUploadTimesResponse>(prompt, {
    type: Type.OBJECT,
    properties: {
      summary: { type: Type.STRING },
      slots: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            day: { type: Type.STRING },
            time: { type: Type.STRING },
            videoType: { type: Type.STRING },
            reasoning: { type: Type.STRING },
            score: { type: Type.NUMBER },
          },
          required: ["day", "time", "videoType", "reasoning", "score"],
        },
      },
    },
    required: ["slots", "summary"],
  });
}

// ============ Cross-Post Delay Suggestions ============
export type CrossPostDelaySuggestion = {
  platform: "instagram" | "twitter" | "community";
  delayMinutes: number;
  reasoning: string;
};

export type CrossPostDelaysBody = {
  videoTitle: string;
  videoType: string; // Long, Short, Reel
  primaryPlatform: string; // youtube, instagram, etc.
  primaryTime: string; // HH:mm
  niche: string;
  audience?: string;
};

export async function suggestCrossPostDelays(
  body: CrossPostDelaysBody,
): Promise<{ suggestions: CrossPostDelaySuggestion[]; summary: string }> {
  const prompt = `You are a cross-platform social distribution expert.

A creator just scheduled this content:
- Title: "${body.videoTitle}"
- Type: ${body.videoType}
- Primary platform: ${body.primaryPlatform}
- Primary publish time: ${body.primaryTime} IST
- Niche: ${body.niche}
${body.audience ? `- Audience: ${body.audience}` : ""}

Suggest the optimal CROSS-POST delays (in MINUTES from the primary publish) for these other platforms:
- instagram (Reel)
- twitter (announcement)
- community (YouTube community post)

Rules:
- Don't post everywhere at once — algorithms penalize that.
- Instagram Reels usually do best 30-90 min AFTER YouTube so YT gets initial momentum.
- Twitter announcement is often best 0-15 min after (live tease) OR 2-4h after (re-promo).
- Community post often works 0 min (same time) or 15 min before for hype.
- Consider the niche and time-of-day.

For each platform return delayMinutes (integer, 0-720) and a short Hinglish reasoning sentence.
Also return a one-line "summary" describing the rollout strategy.
Return JSON only.`;

  return generateJson<{
    suggestions: CrossPostDelaySuggestion[];
    summary: string;
  }>(prompt, {
    type: Type.OBJECT,
    properties: {
      summary: { type: Type.STRING },
      suggestions: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            platform: { type: Type.STRING },
            delayMinutes: { type: Type.NUMBER },
            reasoning: { type: Type.STRING },
          },
          required: ["platform", "delayMinutes", "reasoning"],
        },
      },
    },
    required: ["suggestions", "summary"],
  });
}

// ============ Generate Thumbnail (Nano Banana / Pro) ============
export type ThumbnailStylePreset =
  | "money"
  | "tech"
  | "tutorial"
  | "drama"
  | "before_after";

export type ThumbnailIdeaInput = {
  title: string;
  hook?: string;
  tags?: string[];
  niche?: string;
};

export type ThumbnailStrategy = {
  emotion: string;
  expression: string;
  hookWord: string;
  textOverlay: string;
  textColors: string[];
  bgColors: string[];
  focalPoint: string;
  curiosityGap: number;
  imagePrompt: string;
};

export type GenerateThumbnailBody = {
  prompt?: string;
  hd?: boolean;
  useStrategy?: boolean;
  idea?: ThumbnailIdeaInput;
  stylePreset?: ThumbnailStylePreset;
};
export type GenerateThumbnailResponse = {
  dataUrl: string;
  model: string;
  strategy?: ThumbnailStrategy;
};

export async function generateThumbnail(
  body: GenerateThumbnailBody,
): Promise<GenerateThumbnailResponse> {
  const res = await authFetch(`${API_BASE}/ai/generate-thumbnail`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = `Thumbnail request failed (${res.status})`;
    try {
      const j = await res.json();
      if (j?.error) msg = j.error;
    } catch {}
    throw new Error(msg);
  }
  const data = await res.json();
  const mime = data.mimeType || "image/png";
  return {
    dataUrl: `data:${mime};base64,${data.b64_json}`,
    model: data.model || "gemini-2.5-flash-image",
    strategy: data.strategy,
  };
}

export type GenerateThumbnailStrategyBody = {
  idea: ThumbnailIdeaInput;
  stylePreset?: ThumbnailStylePreset;
};

export async function generateThumbnailStrategy(
  body: GenerateThumbnailStrategyBody,
): Promise<{ strategy: ThumbnailStrategy }> {
  const res = await authFetch(`${API_BASE}/ai/thumbnail-strategy`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = `Strategy request failed (${res.status})`;
    try {
      const j = await res.json();
      if (j?.error) msg = j.error;
    } catch {}
    throw new Error(msg);
  }
  return res.json();
}

// ============ Score Thumbnails (A/B Lab) ============
export type ThumbnailScore = {
  index: number;
  ctrScore: number;
  emotionImpact: number;
  textReadability: number;
  curiosityGap: number;
  focalClarity: number;
  mobileReadability: number;
  strengths: string[];
  weaknesses: string[];
  improvements: string[];
};

export type ScoreThumbnailsBody = {
  videoTitle?: string;
  niche?: string;
  thumbnails: { mimeType: string; data: string }[]; // base64 (no data: prefix)
};

export type ScoreThumbnailsResponse = {
  scores: ThumbnailScore[];
  winnerIndex: number;
  verdict: string;
};

export async function scoreThumbnails(
  body: ScoreThumbnailsBody,
): Promise<ScoreThumbnailsResponse> {
  const res = await authFetch(`${API_BASE}/ai/score-thumbnails`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = `Score request failed (${res.status})`;
    try {
      const j = await res.json();
      if (j?.error) msg = j.error;
    } catch {}
    throw new Error(msg);
  }
  return res.json();
}

// ============ Comment Reply Helper ============
export type CommentReplyPriority = "pin" | "reply" | "skip" | "warn";
export type CommentReplyIntent =
  | "question"
  | "praise"
  | "criticism"
  | "suggestion"
  | "spam"
  | "joke"
  | "personal";
export type CommentReplySentiment = "positive" | "negative" | "neutral";

export type CommentReplySuggestion = {
  index: number;
  priority: CommentReplyPriority;
  intent: CommentReplyIntent;
  sentiment: CommentReplySentiment;
  draftReply: string;
  why: string;
};

export type GenerateCommentRepliesBody = {
  comments: { author?: string; text: string }[];
  videoTitle?: string;
  channelName?: string;
  niche?: string;
};

export type GenerateCommentRepliesResponse = {
  replies: CommentReplySuggestion[];
};

export async function generateCommentReplies(
  body: GenerateCommentRepliesBody,
): Promise<GenerateCommentRepliesResponse> {
  const res = await authFetch(`${API_BASE}/ai/comment-replies`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = `Comment helper failed (${res.status})`;
    try {
      const j = await res.json();
      if (j?.error) msg = j.error;
    } catch {}
    throw new Error(msg);
  }
  return res.json();
}

// ============ Generate Content ============
export type GenerateContentBody = { prompt: string; systemPrompt?: string };
export type GenerateContentResponse = { content: string };

export async function generateContent(body: GenerateContentBody): Promise<GenerateContentResponse> {
  const content = await generateText(body.prompt, body.systemPrompt);
  return { content };
}

// ============ Generate Video Ideas ============
export type IdeaSourceMode = "niche" | "trending" | "mixed";
export type GenerateIdeasBody = {
  channelName: string;
  niche: string;
  description?: string;
  count?: number;
  trendingTopics?: string[];
  mode?: IdeaSourceMode;
};
export type VideoIdea = {
  title: string;
  hook: string;
  tags: string[];
  estimatedViews?: string;
  difficulty: "Easy" | "Medium" | "Hard";
  type: "Long" | "Short" | "Reel";
};
export type GenerateIdeasResponse = { ideas: VideoIdea[] };

export async function generateVideoIdeas(body: GenerateIdeasBody): Promise<GenerateIdeasResponse> {
  // Use the typed backend endpoint when available so server-side mode logic runs.
  const res = await authFetch(`${API_BASE}/ai/generate-ideas`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.ok) {
    const data = await res.json();
    return { ideas: data.ideas ?? [] };
  }

  // Fallback to raw prompt path
  const count = body.count ?? 5;
  const mode = body.mode ?? "niche";
  const trending = body.trendingTopics?.length
    ? `\nSeed topics: ${body.trendingTopics.join(", ")}`
    : "";
  const modeLine =
    mode === "trending"
      ? `Generate ideas based on what is currently TRENDING on YouTube right now (broad — pop culture, news, AI, tech, viral). Do NOT restrict to the channel's niche; the goal is audience expansion.`
      : mode === "mixed"
      ? `Generate a MIX — half ideas inside the "${body.niche}" niche, half from currently-trending broader YouTube topics for audience expansion.`
      : `Stay strictly within the "${body.niche}" niche.`;

  const prompt = `${modeLine}

Generate ${count} fresh, high-potential YouTube video ideas for the channel "${body.channelName}".
Channel description: ${body.description ?? "N/A"}${trending}

For each idea provide a compelling title, a strong opening hook (first 5 seconds), 3-5 SEO tags, an estimatedViews bracket like "10K-50K", a difficulty (Easy|Medium|Hard) and a type (Long|Short|Reel).`;

  return generateJson<GenerateIdeasResponse>(prompt, {
    type: Type.OBJECT,
    properties: {
      ideas: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            hook: { type: Type.STRING },
            tags: { type: Type.ARRAY, items: { type: Type.STRING } },
            estimatedViews: { type: Type.STRING },
            difficulty: { type: Type.STRING, enum: ["Easy", "Medium", "Hard"] },
            type: { type: Type.STRING, enum: ["Long", "Short", "Reel"] },
          },
          required: ["title", "hook", "tags", "difficulty", "type"],
        },
      },
    },
    required: ["ideas"],
  });
}

// ============ SCRIPT_SENSEI System Instruction ============
// Trained on creator's "Content Creation R1.03" framework.
// Used for ALL script generation / polish / regenerate calls so the
// voice stays consistent across the entire app.
const SCRIPT_SENSEI_SYSTEM = `You are SCRIPT_SENSEI — a YouTube scriptwriting expert trained on the creator's own playbook for Hindi/Hinglish faceless channels (cybersecurity, tech, education).

🎙️ VOICE & LANGUAGE
- ALWAYS write in HINGLISH (Hindi-English mix in Roman script). Tone: jaise dost ko samjha rahe ho — casual, direct, never formal.
- Sentences SHORT and PUNCHY. 7–12 words feels natural. One sentence = one idea.
- BANNED openers: "Hello guys", "Welcome to my channel", "Aaj hum baat karenge", "In this video". Always open with a curiosity hook.
- Use sensory verbs: dekho, socho, imagine karo, suno, samjho. Make it visceral.
- Replace jargon with analogies. ("Hydra ek aisa tool hai jo password guess karta hai — jaise kisi lock ke sab chabi try karna, but ultra-fast.")

🧱 STRUCTURE (always this flow)
1. **HOOK (0–15s)** — One killer line. Shock | question | promise | curiosity loop. Under 10 sec to read.
2. **PROBLEM SETUP (15–45s)** — What's the pain? Make it personal: "Tumhare saath bhi ho sakta hai".
3. **CURIOSITY LOOP** — Tease the answer, delay the reveal.
4. **MAIN CONTENT** — Numbered points. Each: explanation + relatable example + visual cue.
5. **CLIMAX / REVEAL** — The "aha" moment. Bass-heavy emphasis.
6. **TAKEAWAY** — One clear actionable line.
7. **CTA** — Comment prompt + sub ask. Creative, not generic.
8. **OUTRO + CLIFFHANGER** — Tease the next video. Never "okay bye guys".

🎬 ENRICHMENT (mandatory in EVERY section)
- **B-ROLL CUES** — Every 2–3 sentences add inline \`[B-ROLL: <visual idea>]\`.
- **VOCAL CUES** — Inline \`(pause)\`, \`(whisper)\`, \`(slow)\`, \`(excited)\`, \`(fast pace)\` for delivery.
- **PATTERN INTERRUPTS** — Every 30–45 sec: \`[PATTERN BREAK: meme / zoom / SFX]\`.
- **POPUPS** — Highlight numbers/stats: \`[POPUP: "₹50,000 LOSS"]\`.
- **CURIOSITY LOOPS** — At least 2 per script. Mark with \`[CURIOSITY LOOP: ...]\`.
- **TIMESTAMPS** — Every section heading shows estimated time, e.g. \`## HOOK (0:00 – 0:15)\`.

⚡ RETENTION HACKS (use freely)
- Question every 1–2 min: "Samajh rahe ho na?", "Imagine agar tumhare saath ho?"
- Tone changes: fast → slow, loud → whisper.
- Promise + Deliver pattern.
- Tease at 70–80% mark for the next reveal.

⚠️ DISCLAIMERS (only for hacking/sensitive topics)
Add near the top: "Ye video sirf educational + ethical purpose ke liye hai. Misuse = your responsibility."

📤 OUTPUT FORMAT
Pure markdown. Every section starts with \`## SECTION NAME (mm:ss – mm:ss)\`. Inline B-roll/vocal/popup cues stay on their own line in square brackets so the creator can read while shooting. NO preamble, NO "Sure! Here's your script". Just the script.`;

// ============ Generate Script ============
export type ScriptTone = "casual" | "educational" | "dramatic" | "mrbeast";
export type ScriptFormat = "long" | "short" | "tutorial" | "story";

export type GenerateScriptBody = {
  title: string;
  channelName: string;
  niche: string;
  targetAudience?: string;
  duration?: string;
  language?: string;
  tone?: ScriptTone;
  format?: ScriptFormat;
  hookStyle?: string; // optional: pre-picked hook line
  notes?: string; // extra creator notes (key points to cover)
};
export type GenerateScriptResponse = {
  script: string;
  sections?: { name: string; content: string }[];
};

const TONE_HINTS: Record<ScriptTone, string> = {
  casual: "Conversational dost-style. Light humor allowed.",
  educational: "Clear teaching tone. Use analogies for every technical word.",
  dramatic: "High emotional stakes. Suspense, slow reveals, intense pacing.",
  mrbeast: "MrBeast-style: extreme stakes, fast pacing, big numbers, constant pattern breaks every 20-30 sec.",
};

const FORMAT_HINTS: Record<ScriptFormat, string> = {
  long: "Long-form video. Use 3-5 main content sections.",
  short: "YouTube Short / Reel. Hook in 2 sec. Total <60 sec. ONE main point only. End on cliffhanger.",
  tutorial: "Step-by-step tutorial. Numbered steps with screen-recording B-roll cues.",
  story: "Story-driven. Strong narrative arc with a real-world scenario. Heavy emotion.",
};

export async function generateScript(body: GenerateScriptBody): Promise<GenerateScriptResponse> {
  const tone = body.tone ?? "casual";
  const format = body.format ?? "long";
  const prompt = `Write a complete YouTube video script.

📌 VIDEO BRIEF
- Title: "${body.title}"
- Channel: ${body.channelName} (${body.niche})
- Audience: ${body.targetAudience ?? "Hindi-speaking tech learners 16-30"}
- Target duration: ${body.duration ?? "5-8 minutes"}
- Tone: ${tone} — ${TONE_HINTS[tone]}
- Format: ${format} — ${FORMAT_HINTS[format]}
${body.hookStyle ? `- Use this hook as the opening line: "${body.hookStyle}"` : ""}
${body.notes ? `- Creator's key points to cover:\n${body.notes}` : ""}

Follow the SCRIPT_SENSEI playbook strictly. Output the script as markdown with all enrichment cues inline.`;

  const script = await callRaw(prompt, undefined, SCRIPT_SENSEI_SYSTEM);
  return { script };
}

// ============ Generate Script Hooks (5 variations) ============
export type GenerateHooksBody = {
  title: string;
  channelName: string;
  niche: string;
  audience?: string;
};
export type ScriptHook = {
  style: "shock" | "question" | "story" | "statistic" | "promise";
  hook: string;
  reasoning: string;
  curiosityScore: number; // 1-10
};
export type GenerateHooksResponse = { hooks: ScriptHook[] };

export async function generateScriptHooks(body: GenerateHooksBody): Promise<GenerateHooksResponse> {
  const prompt = `Generate 5 KILLER opening hooks for this YouTube video — one for each style: shock, question, story, statistic, promise.

Title: "${body.title}"
Channel: ${body.channelName} (${body.niche})
Audience: ${body.audience ?? "Hindi-speaking tech learners"}

RULES:
- Each hook is ONE LINE only, under 15 words, in Hinglish.
- Must create instant curiosity — viewer should NEED to keep watching.
- BANNED: "Hello guys", "Welcome", "Aaj hum baat karenge", "In this video".
- Tone: jaise dost ko shock kar rahe ho.

For each hook return:
- style: one of "shock" | "question" | "story" | "statistic" | "promise"
- hook: the actual opening line (Hinglish)
- reasoning: ONE-LINE Hinglish reason why this hook works for THIS video
- curiosityScore: 1-10 (how badly viewer wants the answer)

Return JSON only.`;

  return generateJson<GenerateHooksResponse>(prompt, {
    type: Type.OBJECT,
    properties: {
      hooks: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            style: { type: Type.STRING },
            hook: { type: Type.STRING },
            reasoning: { type: Type.STRING },
            curiosityScore: { type: Type.INTEGER },
          },
          required: ["style", "hook", "reasoning", "curiosityScore"],
        },
      },
    },
    required: ["hooks"],
  }, SCRIPT_SENSEI_SYSTEM);
}

// ============ Regenerate a Script Section ============
export type SectionIntent =
  | "shorter"
  | "longer"
  | "funnier"
  | "more_dramatic"
  | "add_example"
  | "add_broll"
  | "simplify"
  | "more_hinglish";

export type RegenerateSectionBody = {
  fullScript: string;
  sectionName: string;
  sectionContent: string;
  intent: SectionIntent;
  videoTitle: string;
  niche: string;
};
export type RegenerateSectionResponse = { content: string };

const INTENT_HINTS: Record<SectionIntent, string> = {
  shorter: "Cut this section to ~60% of its current length. Keep the punchiest lines only.",
  longer: "Expand this section with more depth, an extra example, and richer B-roll cues.",
  funnier: "Inject humor — jokes, witty asides, meme references. Keep info accurate.",
  more_dramatic: "Crank up the drama. Slower reveals, suspense pauses, emotional words.",
  add_example: "Add ONE strong relatable real-world example/analogy that the audience can imagine.",
  add_broll: "Add specific [B-ROLL:] cues for every 2-3 sentences. Make the visual storyboard rich.",
  simplify: "Simplify language. Replace any jargon with simple Hinglish analogies.",
  more_hinglish: "Increase Hindi mix. Use more dost-style colloquial Hinglish words.",
};

export async function regenerateScriptSection(
  body: RegenerateSectionBody,
): Promise<RegenerateSectionResponse> {
  const prompt = `Rewrite ONE section of an existing script. Keep section name and timestamp identical. Output ONLY the rewritten section in markdown (start with the same \`## ${body.sectionName}\` heading).

Video title: "${body.videoTitle}"
Niche: ${body.niche}
Section to rewrite: ${body.sectionName}
Intent: ${body.intent.toUpperCase()} — ${INTENT_HINTS[body.intent]}

🔹 CURRENT SECTION:
${body.sectionContent}

🔹 FULL SCRIPT CONTEXT (for continuity, do NOT rewrite this — only the section above):
${body.fullScript.slice(0, 3000)}

Rewrite just the section. Stay consistent with the surrounding script.`;

  const content = await callRaw(prompt, undefined, SCRIPT_SENSEI_SYSTEM);
  return { content: content.trim() };
}

// ============ Refine Full Script (custom instruction) ============
export type RefineScriptBody = {
  script: string;
  instruction: string;
  videoTitle: string;
  niche: string;
};
export type RefineScriptResponse = { script: string };

export async function refineScript(body: RefineScriptBody): Promise<RefineScriptResponse> {
  const prompt = `Rewrite this YouTube script following the user's instruction. Keep the same overall structure (section headings, timestamps), but apply the change throughout. Output ONLY the rewritten markdown script — no preamble.

Video title: "${body.videoTitle}"
Niche: ${body.niche}

🔹 USER INSTRUCTION:
${body.instruction}

🔹 CURRENT SCRIPT:
${body.script}`;

  const script = await callRaw(prompt, undefined, SCRIPT_SENSEI_SYSTEM);
  return { script: script.trim() };
}

// ============ Polish Full Script ============
export type PolishScriptBody = {
  script: string;
  videoTitle: string;
  niche: string;
};
export type PolishScriptResponse = {
  script: string;
  changes: string[];
};

export async function polishScript(body: PolishScriptBody): Promise<PolishScriptResponse> {
  const polishedPrompt = `POLISH this existing YouTube script using the SCRIPT_SENSEI rules. Keep all the creator's original ideas/structure but UPGRADE:
- Strengthen the hook
- Tighten weak/wordy sentences
- Add missing B-ROLL / vocal cues / pattern breaks
- Add at least 2 curiosity loops
- Make CTA more creative
- End on stronger cliffhanger

Video title: "${body.videoTitle}"
Niche: ${body.niche}

🔹 CURRENT SCRIPT:
${body.script}

Return JSON with:
- script: the polished full markdown script (with section headings + cues)
- changes: array of 3-6 short Hinglish bullet strings explaining what you improved`;

  return generateJson<PolishScriptResponse>(polishedPrompt, {
    type: Type.OBJECT,
    properties: {
      script: { type: Type.STRING },
      changes: { type: Type.ARRAY, items: { type: Type.STRING } },
    },
    required: ["script", "changes"],
  }, SCRIPT_SENSEI_SYSTEM);
}

// ============ Generate Titles ============
export type GenerateTitlesBody = {
  concept: string;
  channelName: string;
  niche: string;
  count?: number;
};
export type GenerateTitlesResponse = {
  titles: { title: string; clickbaitScore: number; seoScore: number }[];
};

export async function generateTitles(body: GenerateTitlesBody): Promise<GenerateTitlesResponse> {
  const count = body.count ?? 5;
  const prompt = `Generate ${count} optimized YouTube titles for the concept: "${body.concept}".
Channel: ${body.channelName} (${body.niche}).
Each title should be punchy, under 70 characters, and curiosity-driving.
Score each title from 1-10 for clickbait appeal and 1-10 for SEO strength.`;

  return generateJson<GenerateTitlesResponse>(prompt, {
    type: Type.OBJECT,
    properties: {
      titles: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            clickbaitScore: { type: Type.INTEGER },
            seoScore: { type: Type.INTEGER },
          },
          required: ["title", "clickbaitScore", "seoScore"],
        },
      },
    },
    required: ["titles"],
  });
}

// ============ Generate Titles V2 (CTR Strategist) ============
export const TITLE_STRATEGIST_SYSTEM = `You are a world-class YouTube title strategist trained on the top 0.1% viral videos across all niches. Your only goal is to maximize CTR (Click-Through Rate) through psychologically compelling titles.

Generate 10 title variations covering these formulas: Curiosity Gap, Number List, Negative Framing, Challenge/Dare, Result-First, Question Hook, Shock/Controversy, FOMO, Story Arc, Authority.

For each title give:
- The exact formula category (one of: Curiosity, Number, Negative, Challenge, Result, Question, Shock, FOMO, Story, Authority)
- Psychological trigger (one of: curiosity, fear, greed, social_proof, urgency, identity)
- Power words used (subset of: SECRET, WARNING, FINALLY, NOBODY, PROOF, EXPOSED, FREE, SHOCKING, BANNED, TRUTH, VIRAL, REAL, HONEST, INSTANTLY, MISTAKE, QUIT — pick the ones actually present in your title)
- SEO score 1-10 (does it contain naturally searchable keywords)
- CTR score 1-10 (emotional pull strength)
- Character count (will be auto-checked, but keep titles under 60 chars when possible)

Then pick TOP 3 titles to A/B test first with a one-line reason each.

Hard rules: No clickbait that misleads. Titles deliver what they promise. If the channel uses Hindi/Hinglish, write titles in matching style — do NOT force English. Every word must earn its place.`;

export type GenerateTitlesV2Body = {
  concept: string;
  channelName: string;
  niche: string;
  language?: string; // "Hindi", "Hinglish", "English"
  audience?: string;
};

export type TitleVariant = {
  title: string;
  formula: string;
  trigger: string;
  powerWords: string[];
  seoScore: number;
  ctrScore: number;
  charCount: number;
  isTopPick?: boolean;
  topPickReason?: string;
};

export type GenerateTitlesV2Response = {
  titles: TitleVariant[];
  topPicks: { title: string; reason: string }[];
  overallNotes: string;
};

export async function generateTitlesV2(
  body: GenerateTitlesV2Body,
): Promise<GenerateTitlesV2Response> {
  const prompt = `Channel: "${body.channelName}" (niche: ${body.niche})${body.audience ? `\nAudience: ${body.audience}` : ""}
Preferred language: ${body.language ?? "Hinglish"}

Video concept / topic: """
${body.concept}
"""

Generate 10 title variations following the system instructions. After the array, populate "topPicks" with the 3 best to A/B test (in priority order) and a 1-line "overallNotes" insight about the topic positioning.`;

  return generateJson<GenerateTitlesV2Response>(
    prompt,
    {
      type: Type.OBJECT,
      properties: {
        titles: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              formula: { type: Type.STRING },
              trigger: { type: Type.STRING },
              powerWords: { type: Type.ARRAY, items: { type: Type.STRING } },
              seoScore: { type: Type.INTEGER },
              ctrScore: { type: Type.INTEGER },
              charCount: { type: Type.INTEGER },
            },
            required: [
              "title",
              "formula",
              "trigger",
              "powerWords",
              "seoScore",
              "ctrScore",
              "charCount",
            ],
          },
        },
        topPicks: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              reason: { type: Type.STRING },
            },
            required: ["title", "reason"],
          },
        },
        overallNotes: { type: Type.STRING },
      },
      required: ["titles", "topPicks", "overallNotes"],
    },
    TITLE_STRATEGIST_SYSTEM,
  );
}

// ============ Generate Description V2 (SEO Specialist) ============
export const DESCRIPTION_SPECIALIST_SYSTEM = `You are a YouTube SEO and description specialist who has studied the top 1% performing videos across all niches. Your job is to write descriptions that rank on YouTube search, get suggested by the algorithm, and convert viewers into subscribers.

Structure your output in 5 zones:
ZONE 1 — Hook (max 160 chars, 2 lines, primary keyword in first line, curiosity/result promise)
ZONE 2 — Body (3-5 lines, "Aap is video mein seekhenge..." style, secondary keywords woven in naturally)
ZONE 3 — Chapters (5-8 timestamps, 0:00 - Title format, each title keyword-rich AND curiosity-triggering)
ZONE 4 — CTAs (Subscribe → Comment-with-specific-question → Like, in that order)
ZONE 5 — Hashtags (exactly 5: 1 broad niche + 2 medium + 2 long-tail; with # prefix)

Then provide an SEO Audit:
- primaryKeyword: the main keyword you targeted
- primaryKeywordPlacement: where it appears (first line / body / chapters)
- charCount: total characters
- keywordDensityPct: estimated 2-3% range
- readabilityNote: 1 line
- improvementSuggestions: 3 actionable bullets

Hard rules: First 2 lines = most critical real estate (mobile cuts off). Match channel language (Hindi title = Hindi description). Min 200 words. Natural language — humans first, algorithm second. NEVER stuff keywords. NEVER include the social/business links block — that gets appended automatically.`;

export type GenerateDescriptionV2Body = {
  title: string;
  concept?: string;
  channelName: string;
  niche: string;
  language?: string;
  audience?: string;
  durationMinutes?: number;
};

export type DescriptionV2 = {
  hook: string;
  body: string;
  chapters: { time: string; title: string }[];
  ctas: { subscribe: string; comment: string; like: string };
  hashtags: string[];
  seoAudit: {
    primaryKeyword: string;
    primaryKeywordPlacement: string;
    charCount: number;
    keywordDensityPct: number;
    readabilityNote: string;
    improvementSuggestions: string[];
  };
};

export type GenerateDescriptionV2Response = { description: DescriptionV2 };

export async function generateDescriptionV2(
  body: GenerateDescriptionV2Body,
): Promise<GenerateDescriptionV2Response> {
  const prompt = `Channel: "${body.channelName}" (niche: ${body.niche})
Language: ${body.language ?? "Hinglish"}
${body.audience ? `Audience: ${body.audience}` : ""}
${body.durationMinutes ? `Approx duration: ${body.durationMinutes} minutes` : ""}

Video title: "${body.title}"
${body.concept ? `Concept / context:\n${body.concept.slice(0, 1500)}` : ""}

Write the full SEO-optimized description following the 5-zone structure and the system rules. Return JSON only.`;

  return generateJson<GenerateDescriptionV2Response>(
    prompt,
    {
      type: Type.OBJECT,
      properties: {
        description: {
          type: Type.OBJECT,
          properties: {
            hook: { type: Type.STRING },
            body: { type: Type.STRING },
            chapters: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  time: { type: Type.STRING },
                  title: { type: Type.STRING },
                },
                required: ["time", "title"],
              },
            },
            ctas: {
              type: Type.OBJECT,
              properties: {
                subscribe: { type: Type.STRING },
                comment: { type: Type.STRING },
                like: { type: Type.STRING },
              },
              required: ["subscribe", "comment", "like"],
            },
            hashtags: { type: Type.ARRAY, items: { type: Type.STRING } },
            seoAudit: {
              type: Type.OBJECT,
              properties: {
                primaryKeyword: { type: Type.STRING },
                primaryKeywordPlacement: { type: Type.STRING },
                charCount: { type: Type.INTEGER },
                keywordDensityPct: { type: Type.NUMBER },
                readabilityNote: { type: Type.STRING },
                improvementSuggestions: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
              },
              required: [
                "primaryKeyword",
                "primaryKeywordPlacement",
                "charCount",
                "keywordDensityPct",
                "readabilityNote",
                "improvementSuggestions",
              ],
            },
          },
          required: ["hook", "body", "chapters", "ctas", "hashtags", "seoAudit"],
        },
      },
      required: ["description"],
    },
    DESCRIPTION_SPECIALIST_SYSTEM,
  );
}

// ============ Generate Weekly Plan V2 (Context-aware) ============
export const WEEKLY_PLAN_SYSTEM = `You are a YouTube growth strategist building a 7-day execution plan for a creator. You have full context on their channel, goals, ready scripts, idea bank, schedule, and recent performance. Your plan must:
- Move them measurably toward their active goals
- Use what they already have (don't invent ideas if there are pending ones)
- Be realistic for one person (shoot/edit/upload time)
- Mix Long video + Short/Reel cadence smartly
- Include a daily focus (one big thing) + 1-3 supporting tasks
- Predict goal impact in plain language

Format: weekTheme (1 sentence), 7 days (Mon-Sun) each with focus + tasks[] + deliverable + goalImpact, weekSummary (2-3 sentences), risks[] (2-3 bullets).`;

export type WeeklyPlanContext = {
  channelName: string;
  niche: string;
  subscriberCount: number;
  totalViews: number;
  goals: { title: string; type: string; currentValue: number; targetValue: number; deadline: string }[];
  pendingIdeas: { title: string; type: string }[];
  readyScripts: { title: string }[];
  upcomingSchedule: { date: string; title: string; platform: string }[];
  recentPerformance: { title: string; views: number; type: string }[];
  postsPerWeek?: number;
};

export type WeeklyPlanDay = {
  day: string; // Mon, Tue, ...
  date?: string;
  focus: string;
  tasks: string[];
  deliverable: string;
  goalImpact: string;
  videoType?: "Long" | "Short" | "Reel" | "Off";
};

export type WeeklyPlanV2 = {
  weekTheme: string;
  days: WeeklyPlanDay[];
  weekSummary: string;
  risks: string[];
};

export type GenerateWeeklyPlanV2Response = { plan: WeeklyPlanV2 };

export async function generateWeeklyPlanV2(
  ctx: WeeklyPlanContext,
): Promise<GenerateWeeklyPlanV2Response> {
  const goalsTxt = ctx.goals
    .map(
      (g) =>
        `- ${g.title} (${g.type}): ${g.currentValue.toLocaleString()} / ${g.targetValue.toLocaleString()} by ${g.deadline.slice(0, 10)}`,
    )
    .join("\n") || "(no active goals)";

  const ideasTxt = ctx.pendingIdeas
    .slice(0, 12)
    .map((i) => `- ${i.title} [${i.type}]`)
    .join("\n") || "(none)";

  const scriptsTxt = ctx.readyScripts
    .slice(0, 8)
    .map((s) => `- ${s.title}`)
    .join("\n") || "(none)";

  const schedTxt = ctx.upcomingSchedule
    .slice(0, 10)
    .map((s) => `- ${s.date.slice(0, 10)} → ${s.title} (${s.platform})`)
    .join("\n") || "(empty)";

  const perfTxt = ctx.recentPerformance
    .slice(0, 8)
    .map((v) => `- "${v.title}" [${v.type}] → ${v.views.toLocaleString()} views`)
    .join("\n") || "(no recent uploads)";

  const prompt = `Channel: "${ctx.channelName}" (${ctx.niche})
Subs: ${ctx.subscriberCount.toLocaleString()} | Total views: ${ctx.totalViews.toLocaleString()}
Cadence target: ${ctx.postsPerWeek ?? 3} posts this week

ACTIVE GOALS:
${goalsTxt}

IDEA BANK (pending):
${ideasTxt}

READY SCRIPTS:
${scriptsTxt}

UPCOMING SCHEDULE:
${schedTxt}

RECENT VIDEO PERFORMANCE:
${perfTxt}

Build a Mon→Sun plan that:
1. Prioritizes ready scripts for shoot days (Mon/Tue)
2. Edit + thumbnail + upload days
3. At least one Short/Reel for retention boost
4. Engagement / community day
5. Off / planning day

Each day: focus (1 sentence), tasks (1-3 bullets), deliverable (1 concrete output), goalImpact (which goal this moves and roughly how much), videoType.

Return JSON only.`;

  return generateJson<GenerateWeeklyPlanV2Response>(
    prompt,
    {
      type: Type.OBJECT,
      properties: {
        plan: {
          type: Type.OBJECT,
          properties: {
            weekTheme: { type: Type.STRING },
            days: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  day: { type: Type.STRING },
                  date: { type: Type.STRING },
                  focus: { type: Type.STRING },
                  tasks: { type: Type.ARRAY, items: { type: Type.STRING } },
                  deliverable: { type: Type.STRING },
                  goalImpact: { type: Type.STRING },
                  videoType: { type: Type.STRING },
                },
                required: ["day", "focus", "tasks", "deliverable", "goalImpact"],
              },
            },
            weekSummary: { type: Type.STRING },
            risks: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: ["weekTheme", "days", "weekSummary", "risks"],
        },
      },
      required: ["plan"],
    },
    WEEKLY_PLAN_SYSTEM,
  );
}

// ============ Chat with memory (multi-turn) ============
export const STRATEGIC_ASSISTANT_SYSTEM = `You are the personal YouTube growth strategist for the creator. You have ongoing conversations — REMEMBER everything they told you in previous messages. When they refer to "us", "we", "my channel", "yesterday", "earlier", you understand the context from history.

You speak in Hinglish (mix of Hindi and English) — natural, friendly, like an experienced friend who happens to be a YouTube expert. Avoid corporate / robotic tone. Keep replies focused: shorter is better unless they explicitly ask for a deep dive.

When you give advice, be specific — numbers, examples, concrete next actions. Don't say "post more often" — say "Sunday 8 PM ko ek Short upload karo, isi week."

## Data access
The "Live channel context" block below contains the creator's complete current data:
- Channel identity, niche, language, full stats (subs/views/videos)
- Audience persona (pain points, interests)
- All active goals with progress
- LAST UPLOAD with full detail (title, performance vs avg, tags, description, URL)
- ALL RECENT UPLOADS — an indexed list of up to 30 latest videos with title, video id, views, likes, comment count, age, format (Short/Long), tags, and URL
- TOP UPLOADS by views
- RECENT COMMENTS — actual top comments (author, likes, text) from the 5 most recent videos
- Production pipeline, pending ideas, saved scripts, upcoming schedule

When the user mentions a video by title (full or partial), search the ALL RECENT UPLOADS list — fuzzy-match on the title. Quote the exact title back, share the link if useful, and reference the real numbers. If you genuinely cannot find a match in the index (older video or different channel), say so honestly and ask for the URL or full title.

When the user asks about audience reactions, sentiment, what viewers are saying, FAQs, or "comments pe kya chal raha hai", USE the RECENT COMMENTS block — quote actual comment text, mention the commenter, and group by theme. Don't invent comments that aren't in the context.`;

export type ChatTurn = { role: "user" | "assistant"; content: string };

export type ChatBody = {
  history: ChatTurn[]; // most recent message must be the user's new prompt
  contextSnapshot?: string; // optional structured context about channel/goals/etc
  memories?: string[]; // persistent cross-conversation facts about the user/channel
  attachments?: ChatAttachment[]; // images/PDFs sent with the latest user message
};

export type ChatResponse = { reply: string };

export async function chatWithMemory(body: ChatBody): Promise<ChatResponse> {
  const ctx = body.contextSnapshot
    ? `\n\n## Live channel context (current snapshot)\n${body.contextSnapshot}`
    : "";

  const memoryBlock =
    body.memories && body.memories.length > 0
      ? `\n\n## Persistent memory (facts you ALREADY know about this user/channel — use them naturally, don't ask again)\n${body.memories
          .map((m, i) => `${i + 1}. ${m}`)
          .join("\n")}`
      : "";

  const system = STRATEGIC_ASSISTANT_SYSTEM + memoryBlock + ctx;

  // Build a conversation transcript so the model has full memory in one shot
  const transcript = body.history
    .map((t) => `${t.role === "user" ? "USER" : "ASSISTANT"}: ${t.content}`)
    .join("\n\n");

  const attachNote =
    body.attachments && body.attachments.length > 0
      ? `\n\n(The user has attached ${body.attachments.length} file${body.attachments.length > 1 ? "s" : ""}: ${body.attachments
          .map((a) => `${a.name} [${a.mimeType}]`)
          .join(", ")} — they are available to you as inline data, analyze them along with the message.)`
      : "";

  const prompt = `Conversation so far:\n\n${transcript}${attachNote}\n\nNow respond to the most recent USER message. Reply only with your message text — no role prefix.`;

  const text = await generateText(prompt, system, body.attachments);
  return { reply: text.trim() };
}

// ============ Extract long-term facts from a chat turn ============
export async function extractMemoriesFromTurn(args: {
  userMessage: string;
  assistantReply: string;
  existingMemories: string[];
}): Promise<string[]> {
  const existing = args.existingMemories.length
    ? args.existingMemories.map((m, i) => `${i + 1}. ${m}`).join("\n")
    : "(none yet)";

  const prompt = `You are extracting LONG-TERM facts about a YouTube creator from a chat exchange. These facts will be remembered across all future conversations.

EXISTING MEMORIES (do NOT repeat anything already covered here, even paraphrased):
${existing}

LATEST EXCHANGE:
USER: ${args.userMessage}
ASSISTANT: ${args.assistantReply}

Extract ONLY genuinely NEW, durable facts about the user, their channel, preferences, goals, audience, or business — things worth remembering forever. Skip:
- Greetings, smalltalk, weather, mood
- Things already in EXISTING MEMORIES
- Temporary states ("aaj busy hu")
- The assistant's advice/suggestions (those aren't facts about the user)
- Vague or speculative statements

Return STRICT JSON: {"facts": ["fact 1", "fact 2"]}. Each fact: one short sentence, in English, third person ("User is...", "Channel name is..."). If nothing new, return {"facts": []}.`;

  try {
    const text = await callRaw(prompt, {
      type: Type.OBJECT,
      properties: {
        facts: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
      required: ["facts"],
    });
    const parsed = JSON.parse(text || "{}") as { facts?: string[] };
    return (parsed.facts ?? [])
      .map((f) => f.trim())
      .filter((f) => f.length > 3 && f.length < 240);
  } catch (err) {
    console.warn("[memory-extract] failed:", err);
    return [];
  }
}

// ============ Auto-generate conversation title ============
export async function generateConversationTitle(firstUserMessage: string): Promise<string> {
  const prompt = `Generate a SHORT 3-5 word title for this conversation based on the user's first message. No quotes, no period. Match language of the message (Hindi/English/Hinglish).

User message: "${firstUserMessage.slice(0, 300)}"

Title:`;
  try {
    const text = await generateText(prompt);
    return text.trim().replace(/^["']|["']$/g, "").slice(0, 60) || "New chat";
  } catch {
    return "New chat";
  }
}

// ============ Generate Description ============
export type GenerateDescriptionBody = {
  title: string;
  script?: string;
  channelName: string;
  niche: string;
  language?: string;
};
export type GenerateDescriptionResponse = {
  description: string;
  tags: string[];
  hashtags: string[];
};

export async function generateDescription(body: GenerateDescriptionBody): Promise<GenerateDescriptionResponse> {
  const prompt = `Write a YouTube description for the video titled "${body.title}".
Channel: ${body.channelName} (${body.niche}).
Language: ${body.language ?? "Hindi"}.
${body.script ? `Script context:\n${body.script.slice(0, 1500)}` : ""}

Provide:
- A 3-paragraph description (engaging hook → value summary → CTA, links placeholders).
- 15 SEO tags (single words or short phrases).
- 10 hashtags (no '#' prefix in the array).`;

  return generateJson<GenerateDescriptionResponse>(prompt, {
    type: Type.OBJECT,
    properties: {
      description: { type: Type.STRING },
      tags: { type: Type.ARRAY, items: { type: Type.STRING } },
      hashtags: { type: Type.ARRAY, items: { type: Type.STRING } },
    },
    required: ["description", "tags", "hashtags"],
  });
}

// ============ Predict Video Performance ============
export type PredictPerformanceBody = {
  channelName: string;
  niche: string;
  audienceSummary?: string;
  videoTitle: string;
  videoType: "Long" | "Short" | "Reel";
  tags?: string[];
  notes?: string;
  recentBenchmarks?: { title: string; views: number }[];
};

export type PerformancePrediction = {
  score: number;
  tier: "Hit" | "Solid" | "Average" | "Risky";
  estimatedViewsRange: string;
  reasoning: string;
  strengths: string[];
  risks: string[];
  improvedTitle: string;
  improvedHook: string;
  betterTags: string[];
};

export type PredictPerformanceResponse = { prediction: PerformancePrediction };

export async function predictVideoPerformance(
  body: PredictPerformanceBody,
): Promise<PredictPerformanceResponse> {
  const benchmarks = (body.recentBenchmarks ?? [])
    .slice(0, 12)
    .map((v) => `- "${v.title}" → ${v.views.toLocaleString()} views`)
    .join("\n");

  const prompt = `You are a YouTube performance analyst for the channel "${body.channelName}" (${body.niche}).
${body.audienceSummary ? `Audience: ${body.audienceSummary}` : ""}

Predict how this UNRELEASED video idea will perform on this specific channel:

Title: "${body.videoTitle}"
Format: ${body.videoType}
Tags: ${body.tags?.join(", ") || "—"}
Notes: ${body.notes || "—"}

Recent benchmark videos from this channel (use as reference baseline):
${benchmarks || "(no benchmarks available — use general niche intuition)"}

Score the idea 0–100 based on:
- Title click-worthiness (curiosity, specificity, emotional hook)
- Audience fit (how well it matches who watches this channel)
- Topic momentum / search demand
- Format suitability (Long vs Short vs Reel for this niche)
- Differentiation vs the channel's recent uploads

Return:
- score: 0–100 integer
- tier: "Hit" (80+), "Solid" (60–79), "Average" (40–59), "Risky" (<40)
- estimatedViewsRange: realistic range like "8K–25K" relative to the benchmarks above
- reasoning: 2–3 sentences explaining the score honestly (mention biggest factor)
- strengths: 2–3 bullets (what's working)
- risks: 2–3 bullets (what could fail)
- improvedTitle: a stronger title rewrite (Hindi/Hinglish if channel uses that)
- improvedHook: a 1-line opening hook for the script
- betterTags: 5 SEO tags that would help`;

  return generateJson<PredictPerformanceResponse>(prompt, {
    type: Type.OBJECT,
    properties: {
      prediction: {
        type: Type.OBJECT,
        properties: {
          score: { type: Type.INTEGER },
          tier: { type: Type.STRING },
          estimatedViewsRange: { type: Type.STRING },
          reasoning: { type: Type.STRING },
          strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
          risks: { type: Type.ARRAY, items: { type: Type.STRING } },
          improvedTitle: { type: Type.STRING },
          improvedHook: { type: Type.STRING },
          betterTags: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: [
          "score",
          "tier",
          "estimatedViewsRange",
          "reasoning",
          "strengths",
          "risks",
          "improvedTitle",
          "improvedHook",
          "betterTags",
        ],
      },
    },
    required: ["prediction"],
  });
}

// ============ Audience Persona ============
export type AudiencePersonaBody = {
  channelName: string;
  niche: string;
  description?: string;
  language?: string;
  sampleTitles: string[];
  sampleTags?: string[];
  topKeywords?: string[];
};

export type AudiencePersona = {
  emoji: string;
  archetype: string;
  ageRange: string;
  gender: string;
  location: string;
  primaryLanguage: string;
  device: string;
  interests: string[];
  painPoints: string[];
  motivations: string[];
  contentPreferences: string[];
  bestHooks: string[];
  toneAndStyle: string;
  oneLineSummary: string;
};

export type AudiencePersonaResponse = { persona: AudiencePersona };

export async function generateAudiencePersona(
  body: AudiencePersonaBody,
): Promise<AudiencePersonaResponse> {
  const titles = body.sampleTitles.slice(0, 25).map((t) => `- ${t}`).join("\n");
  const tags = (body.sampleTags ?? []).slice(0, 30).join(", ");
  const keywords = (body.topKeywords ?? []).slice(0, 10).join(", ");

  const prompt = `You are an expert YouTube audience analyst. Build a SHARP, specific audience persona for this channel.

Channel: "${body.channelName}"
Niche: ${body.niche}
Description: ${body.description ?? "N/A"}
Detected language: ${body.language ?? "Unknown"}
Top content keywords: ${keywords || "N/A"}
Common tags: ${tags || "N/A"}

Recent video titles (the audience clicks on these):
${titles}

Build the persona based ONLY on what the data suggests. Do not invent facts.
Return:
- emoji (single emoji that represents them, e.g. "🎮")
- archetype (e.g. "The Curious College Hacker")
- ageRange (e.g. "18–28")
- gender (e.g. "Male-skewed (~80%)")
- location (e.g. "India — Tier 2/3 cities, Hindi belt")
- primaryLanguage
- device (e.g. "Mobile (90%), Desktop occasionally")
- interests (4–6 short tags)
- painPoints (3–4 things they struggle with)
- motivations (3–4 reasons they watch)
- contentPreferences (3–4 — e.g. "Step-by-step demos", "Hindi voiceover", "Under 10 minutes")
- bestHooks (3 hook phrases that would work great)
- toneAndStyle (one paragraph)
- oneLineSummary (a single punchy sentence)`;

  return generateJson<AudiencePersonaResponse>(prompt, {
    type: Type.OBJECT,
    properties: {
      persona: {
        type: Type.OBJECT,
        properties: {
          emoji: { type: Type.STRING },
          archetype: { type: Type.STRING },
          ageRange: { type: Type.STRING },
          gender: { type: Type.STRING },
          location: { type: Type.STRING },
          primaryLanguage: { type: Type.STRING },
          device: { type: Type.STRING },
          interests: { type: Type.ARRAY, items: { type: Type.STRING } },
          painPoints: { type: Type.ARRAY, items: { type: Type.STRING } },
          motivations: { type: Type.ARRAY, items: { type: Type.STRING } },
          contentPreferences: { type: Type.ARRAY, items: { type: Type.STRING } },
          bestHooks: { type: Type.ARRAY, items: { type: Type.STRING } },
          toneAndStyle: { type: Type.STRING },
          oneLineSummary: { type: Type.STRING },
        },
        required: [
          "emoji",
          "archetype",
          "ageRange",
          "gender",
          "location",
          "primaryLanguage",
          "device",
          "interests",
          "painPoints",
          "motivations",
          "contentPreferences",
          "bestHooks",
          "toneAndStyle",
          "oneLineSummary",
        ],
      },
    },
    required: ["persona"],
  });
}

// ============ Weekly Plan ============
export type GenerateWeeklyPlanBody = {
  channelName: string;
  niche: string;
  goals?: string;
  postsPerWeek?: number;
};
export type GenerateWeeklyPlanResponse = {
  plan: { day: string; videoType: string; title: string; notes?: string }[];
};

export async function generateWeeklyPlan(body: GenerateWeeklyPlanBody): Promise<GenerateWeeklyPlanResponse> {
  const posts = body.postsPerWeek ?? 3;
  const prompt = `Create a ${posts}-video weekly content plan for the channel "${body.channelName}" in "${body.niche}".
Goals: ${body.goals ?? "grow subscribers and views"}.
Spread videos across the week (Mon-Sun). For each entry: day of week, videoType (Long|Short|Reel), title, optional notes.`;

  return generateJson<GenerateWeeklyPlanResponse>(prompt, {
    type: Type.OBJECT,
    properties: {
      plan: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            day: { type: Type.STRING },
            videoType: { type: Type.STRING },
            title: { type: Type.STRING },
            notes: { type: Type.STRING },
          },
          required: ["day", "videoType", "title"],
        },
      },
    },
    required: ["plan"],
  });
}
