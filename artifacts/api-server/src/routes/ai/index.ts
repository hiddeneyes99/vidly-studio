import { Router } from "express";
import { ai, generateImage, Modality } from "@workspace/integrations-gemini-ai";
import {
  GenerateContentBody,
  GenerateVideoIdeasBody,
  GenerateScriptBody,
  GenerateTitlesBody,
  GenerateDescriptionBody,
  GenerateWeeklyPlanBody,
} from "@workspace/api-zod";

const router = Router();

router.post("/ai/raw", async (req, res) => {
  try {
    const { prompt, schema, systemInstruction, attachments } = req.body ?? {};
    if (!prompt || typeof prompt !== "string") {
      res.status(400).json({ error: "Missing 'prompt' (string)" });
      return;
    }

    const config: any = { maxOutputTokens: 8192 };
    if (schema) {
      config.responseMimeType = "application/json";
      config.responseSchema = schema;
    }
    if (systemInstruction) {
      config.systemInstruction = systemInstruction;
    }

    // Build multimodal parts: attachments first (so the model "sees" them), then prompt
    const parts: any[] = [];
    if (Array.isArray(attachments)) {
      for (const att of attachments) {
        if (!att || typeof att !== "object") continue;
        const { mimeType, data } = att as { mimeType?: string; data?: string };
        if (typeof mimeType === "string" && typeof data === "string" && data.length > 0) {
          parts.push({ inlineData: { mimeType, data } });
        }
      }
    }
    parts.push({ text: prompt });

    const MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-flash-latest"];
    let lastErr: any;
    for (const model of MODELS) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: [{ role: "user", parts }],
          config,
        });
        res.json({ text: response.text ?? "" });
        return;
      } catch (err: any) {
        lastErr = err;
        const status = err?.status ?? err?.response?.status;
        const retryable = status === 503 || status === 429 || status >= 500;
        if (!retryable) break;
      }
    }
    console.error("[/ai/raw] failed", lastErr);
    res.status(502).json({ error: lastErr?.message ?? "Gemini call failed" });
  } catch (err: any) {
    console.error("[/ai/raw] unhandled", err);
    res.status(500).json({ error: err?.message ?? "Server error" });
  }
});

router.post("/ai/generate", async (req, res) => {
  const parsed = GenerateContentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { prompt, systemPrompt } = parsed.data;

  const contents = [];
  if (systemPrompt) {
    contents.push({ role: "user" as const, parts: [{ text: systemPrompt }] });
    contents.push({ role: "model" as const, parts: [{ text: "Understood." }] });
  }
  contents.push({ role: "user" as const, parts: [{ text: prompt }] });

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents,
    config: { maxOutputTokens: 8192 },
  });

  res.json({ content: response.text ?? "" });
});

router.post("/ai/generate-ideas", async (req, res) => {
  const parsed = GenerateVideoIdeasBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { channelName, niche, description, count = 10, trendingTopics } = parsed.data;
  const mode = (req.body?.mode as "niche" | "trending" | "mixed") || "niche";
  const seeds = (trendingTopics ?? []).map((t) => t.trim()).filter(Boolean);

  const modeInstruction = (() => {
    if (mode === "trending") {
      return `IMPORTANT: Generate ideas based on what is currently TRENDING on YouTube globally and in India RIGHT NOW (broad pop culture, news, viral topics, tech launches, AI tools, finance, lifestyle hacks, etc.). Do NOT restrict to the channel's "${niche}" niche. The goal is to find trending topics this creator could pivot into to expand their audience. Each idea should still feel doable for the creator's voice though.`;
    }
    if (mode === "mixed") {
      return `IMPORTANT: Generate a MIX of ideas — about half should stay strictly inside the "${niche}" niche, and the other half should be broader currently-trending YouTube topics (pop culture, AI, news, finance, lifestyle, viral trends) that the creator could try to expand their audience. Mark each idea's relevance clearly in the hook.`;
    }
    return `Stay strictly within the channel's "${niche}" niche. Ideas should feel native to what this channel already does.`;
  })();

  const seedInstruction = seeds.length
    ? `\n\nMANDATORY SEED TOPICS — the user explicitly wants ideas focused on: ${seeds.map((s) => `"${s}"`).join(", ")}.
Rules for seed topics (HIGHEST PRIORITY, override any conflicting instruction above):
- EVERY single idea MUST be directly about one of these seed topics, or a clear sub-angle of them.
- The seed topic (or its synonym) MUST appear in the title or hook of every idea.
- Spread the ${count} ideas across the seed topics roughly evenly. Do NOT generate generic niche ideas that ignore the seeds.
- Treat seeds as the SUBJECT; treat the niche/mode as the ANGLE/lens used to cover them.
- If a seed feels off-niche, still cover it — bend the angle to fit the creator's voice instead of skipping it.`
    : "";

  const prompt = `You are a YouTube content strategist for "${channelName}", a ${niche} channel in Hindi.
${description ? `Channel description: ${description}` : ""}

${modeInstruction}${seedInstruction}

Generate ${count} unique and highly engaging YouTube video ideas.
For each idea provide:
- title: an attention-grabbing Hindi/English title (can be bilingual)
- hook: a 1-sentence compelling hook that would make viewers click
- tags: 3-5 relevant SEO tags
- estimatedViews: a realistic view range estimate (e.g. "5K-15K")
- difficulty: Easy, Medium, or Hard (production complexity)
- type: Long (15-30 min), Short (under 60s), or Reel (30-60s)

Return a JSON object with an "ideas" array. No extra text, just the JSON.`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      maxOutputTokens: 8192,
      responseMimeType: "application/json",
    },
  });

  const text = response.text ?? "{}";
  const data = JSON.parse(text);
  res.json({ ideas: data.ideas ?? [] });
});

router.post("/ai/generate-script", async (req, res) => {
  const parsed = GenerateScriptBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { title, channelName, niche, targetAudience, duration, language = "Hindi" } = parsed.data;

  const prompt = `You are a scriptwriter for "${channelName}", a ${niche} YouTube channel.
Write a complete, engaging video script in ${language} for: "${title}"
${targetAudience ? `Target audience: ${targetAudience}` : ""}
${duration ? `Target duration: ${duration}` : "Target duration: 10-15 minutes"}

Write a detailed script with clear sections:
1. Hook (first 30 seconds to grab attention)
2. Introduction
3. Main Content (broken into clear sub-sections)
4. Summary/Recap
5. Call to Action (subscribe, like, comment)

Return as JSON with:
- script: the full script as a single formatted string
- sections: array of {name, content} objects for each section

No extra text, just the JSON.`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      maxOutputTokens: 8192,
      responseMimeType: "application/json",
    },
  });

  const text = response.text ?? "{}";
  const data = JSON.parse(text);
  res.json({ script: data.script ?? "", sections: data.sections ?? [] });
});

router.post("/ai/generate-titles", async (req, res) => {
  const parsed = GenerateTitlesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { concept, channelName, niche, count = 10 } = parsed.data;

  const prompt = `You are a YouTube SEO expert for "${channelName}", a ${niche} channel.
Generate ${count} optimized YouTube title variations for this video concept: "${concept}"

For each title provide:
- title: the actual title (can be Hindi/English mix, max 60 chars)
- clickbaitScore: 1-10 (how much curiosity it creates)
- seoScore: 1-10 (how well it ranks for search)

Good titles for this niche are specific, create curiosity, and include relevant keywords.
Return as JSON with a "titles" array. No extra text, just the JSON.`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      maxOutputTokens: 4096,
      responseMimeType: "application/json",
    },
  });

  const text = response.text ?? "{}";
  const data = JSON.parse(text);
  res.json({ titles: data.titles ?? [] });
});

router.post("/ai/generate-description", async (req, res) => {
  const parsed = GenerateDescriptionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { title, script, channelName, niche, language = "Hindi" } = parsed.data;

  const prompt = `You are a YouTube SEO specialist for "${channelName}", a ${niche} channel.
Generate an optimized YouTube description in ${language} for this video: "${title}"
${script ? `Based on this script excerpt: ${script.slice(0, 500)}...` : ""}

Create:
- description: a compelling 150-300 word description with relevant keywords, timestamps placeholder, and links section
- tags: 15-20 SEO-optimized tags (mix of broad and specific)
- hashtags: 5-8 relevant hashtags (without #)

The description should start with the most important info, include timestamps if possible, and end with a call to action.
Return as JSON with "description", "tags", and "hashtags" fields. No extra text, just the JSON.`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      maxOutputTokens: 4096,
      responseMimeType: "application/json",
    },
  });

  const text = response.text ?? "{}";
  const data = JSON.parse(text);
  res.json({
    description: data.description ?? "",
    tags: data.tags ?? [],
    hashtags: data.hashtags ?? [],
  });
});

router.post("/ai/weekly-plan", async (req, res) => {
  const parsed = GenerateWeeklyPlanBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { channelName, niche, goals, postsPerWeek = 3 } = parsed.data;

  const prompt = `You are a content strategist for "${channelName}", a ${niche} YouTube channel.
${goals ? `Current goals: ${goals}` : ""}

Create a practical ${postsPerWeek}-video weekly content plan for this channel.
Mix video types (Long-form, Shorts, Reels) strategically.

For each planned video:
- day: day of the week (Monday, Tuesday, etc.)
- videoType: Long, Short, or Reel
- title: a specific suggested video title
- notes: 1-2 sentences of production notes or tips

Return as JSON with a "plan" array. No extra text, just the JSON.`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      maxOutputTokens: 4096,
      responseMimeType: "application/json",
    },
  });

  const text = response.text ?? "{}";
  const data = JSON.parse(text);
  res.json({ plan: data.plan ?? [] });
});

const STRATEGIST_SYSTEM = `You are a viral YouTube thumbnail strategist obsessed with Click-Through Rate (CTR). You think like MrBeast's thumbnail designer. Every element must earn its place — if it doesn't increase CTR, you remove it.

Use these 8 pillars for every thumbnail:
1. Emotion First — pick ONE dominant emotion (curiosity / shock / fear / desire / joy / greed)
2. Human Face + Expression — wide eyes, open mouth, pointing gesture; the brain auto-finds faces
3. Max 5 Words Text — bold, readable at 100px height, ONE word visibly biggest, contrast color rule
4. Color Psychology — red/yellow=urgency, blue=trust, green=money, neon cyan/magenta=tech, black=premium
5. Visual Contrast — light subject on dark bg or dark subject on light bg
6. Curiosity Gap — show enough to click, hide enough to keep suspense
7. Focal Point Rule — ONE element gets first glance; no competing subjects
8. Mobile-First — must read clearly at 100x56px

Style references: clean modern Indian tech-creator aesthetic (think Technical Guruji / MrBeast hybrid). Studio-grade lighting, full-bleed 16:9 1280x720, no borders, no watermarks, no fake YouTube logos, no "Save" buttons, no browser chrome.

Output STRICT JSON only — no markdown, no commentary. Schema:
{
  "emotion": string,
  "expression": string,
  "hookWord": string,
  "textOverlay": string,
  "textColors": [string, string],
  "bgColors": [string, string, string],
  "focalPoint": string,
  "curiosityGap": number,
  "imagePrompt": string
}

The "imagePrompt" must be a complete, vivid, ready-to-execute prompt for an image generator (Nano Banana / DALL-E). It must mention: 16:9 1280x720 aspect, full-bleed (no borders/watermarks), photorealistic, dramatic studio lighting, exact face expression and gesture, where the text overlay sits and what it says, the 2-3 background colors, props (phone mockup / money / graph / arrow), and the focal point that grabs the eye first.`;

const STYLE_PRESETS: Record<string, string> = {
  money:
    "Money/Finance vibe: green + gold + black palette, dollar/rupee notes, phone with banking app, upward green arrow, premium feel.",
  tech:
    "Tech/AI vibe: neon cyan + magenta + black palette, glowing screen, futuristic UI overlay, sleek and high-contrast.",
  tutorial:
    "Tutorial/How-to vibe: bright clean palette with one accent color, screenshot or device mockup, circle/arrow annotation pointing at the key element.",
  drama:
    "Drama/Curiosity vibe: red + black + white palette, harsh side lighting, big shocked face expression, bold bombshell text.",
  before_after:
    "Before/After vibe: split-screen left vs right, left side dark/dull, right side bright/colorful, big white arrow between them.",
};

router.post("/ai/thumbnail-strategy", async (req, res) => {
  try {
    const { idea, stylePreset } = req.body ?? {};
    if (!idea?.title) {
      res.status(400).json({ error: "Missing idea.title" });
      return;
    }
    const styleNote = stylePreset && STYLE_PRESETS[stylePreset]
      ? `\nStyle preset: ${STYLE_PRESETS[stylePreset]}`
      : "";
    const userMsg = `Video idea:
Title: "${idea.title}"
Hook: ${idea.hook ?? ""}
Tags: ${(idea.tags ?? []).join(", ")}
Niche: ${idea.niche ?? "general"}${styleNote}

Design the highest-CTR thumbnail concept following the 8 pillars. Be specific and concrete.`;

    const resp = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: userMsg }] }],
      config: {
        systemInstruction: STRATEGIST_SYSTEM,
        responseMimeType: "application/json",
      },
    });
    let strategy: any;
    try {
      strategy = JSON.parse(resp.text ?? "{}");
    } catch {
      throw new Error("Strategist returned invalid JSON");
    }
    res.json({ strategy });
  } catch (err: any) {
    console.error("[/ai/thumbnail-strategy] failed", err);
    res.status(502).json({ error: err?.message ?? "Strategy generation failed" });
  }
});

router.post("/ai/generate-thumbnail", async (req, res) => {
  try {
    const { prompt, hd, useStrategy, idea, stylePreset } = req.body ?? {};

    let finalPrompt: string | undefined = prompt;
    let strategy: any = undefined;

    // Stage 1 — strategist (optional)
    if (useStrategy && idea?.title) {
      const styleNote = stylePreset && STYLE_PRESETS[stylePreset]
        ? `\nStyle preset: ${STYLE_PRESETS[stylePreset]}`
        : "";
      const userMsg = `Video idea:
Title: "${idea.title}"
Hook: ${idea.hook ?? ""}
Tags: ${(idea.tags ?? []).join(", ")}
Niche: ${idea.niche ?? "general"}${styleNote}

Design the highest-CTR thumbnail concept following the 8 pillars. Be specific and concrete.`;
      const stratResp = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: userMsg }] }],
        config: {
          systemInstruction: STRATEGIST_SYSTEM,
          responseMimeType: "application/json",
        },
      });
      try {
        strategy = JSON.parse(stratResp.text ?? "{}");
      } catch {
        throw new Error("Strategist returned invalid JSON");
      }
      if (strategy?.imagePrompt) finalPrompt = strategy.imagePrompt;
    }

    if (!finalPrompt || typeof finalPrompt !== "string") {
      res.status(400).json({
        error: "Provide either 'prompt' or { useStrategy:true, idea:{ title } }",
      });
      return;
    }

    if (hd) {
      const HD_MODELS = ["gemini-3-pro-image-preview", "gemini-2.5-pro-image-preview"];
      let lastErr: any;
      for (const model of HD_MODELS) {
        try {
          const response = await ai.models.generateContent({
            model,
            contents: [{ role: "user", parts: [{ text: finalPrompt }] }],
            config: { responseModalities: [Modality.TEXT, Modality.IMAGE] },
          });
          const candidate = response.candidates?.[0];
          const imagePart = candidate?.content?.parts?.find(
            (p: any) => p.inlineData,
          );
          if (!imagePart?.inlineData?.data) {
            lastErr = new Error("No image data in HD response");
            continue;
          }
          res.json({
            b64_json: imagePart.inlineData.data,
            mimeType: imagePart.inlineData.mimeType || "image/png",
            model,
            strategy,
          });
          return;
        } catch (err) {
          lastErr = err;
        }
      }
      // fallback to flash if HD models all fail
      console.warn("[/ai/generate-thumbnail] HD failed, falling back to flash", lastErr);
    }

    const result = await generateImage(finalPrompt);
    res.json({ ...result, model: "gemini-2.5-flash-image", strategy });
  } catch (err: any) {
    console.error("[/ai/generate-thumbnail] failed", err);
    res.status(502).json({ error: err?.message ?? "Thumbnail generation failed" });
  }
});

// ============ Thumbnail A/B Scorer ============
// Scores 2-5 thumbnail images on CTR-related dimensions and picks a winner.
const THUMB_SCORER_SYSTEM = `You are a YouTube thumbnail click-through-rate (CTR) judge for an Indian/Hindi tech-creator channel. You think like MrBeast's thumbnail designer.

You will be shown 2-5 candidate thumbnail images for the SAME video idea. For EACH image, score it 1-10 on these axes:
- ctrScore: overall predicted click-through rate (most important)
- emotionImpact: how strong is the dominant emotion / facial expression
- textReadability: can text be read at 100x56px mobile size? (consider size, contrast, word count)
- curiosityGap: shows enough to intrigue, hides enough to make people click
- focalClarity: is there ONE clear focal point or are subjects competing
- mobileReadability: does the whole thumbnail work at small mobile size

Then pick a winner (winnerIndex, 0-based) and write 1-line "verdict" plus 2-4 specific "improvements" each thumbnail could try.

Return STRICT JSON only.`;

router.post("/ai/score-thumbnails", async (req, res) => {
  try {
    const { videoTitle, niche, thumbnails } = req.body ?? {};
    if (!Array.isArray(thumbnails) || thumbnails.length < 2 || thumbnails.length > 5) {
      res.status(400).json({ error: "Provide 2-5 thumbnails (each: { mimeType, data })" });
      return;
    }
    for (const t of thumbnails) {
      if (!t?.mimeType || !t?.data) {
        res.status(400).json({ error: "Each thumbnail needs { mimeType, data }" });
        return;
      }
    }

    const labelLines = thumbnails
      .map((_t: any, i: number) => `Image ${i + 1} = index ${i}`)
      .join("\n");

    const prompt = `Video idea / title: "${videoTitle ?? "(not provided)"}"
Channel niche: ${niche ?? "Hindi tech / general"}

You are seeing ${thumbnails.length} thumbnails in this exact order:
${labelLines}

For EACH thumbnail (in order), produce one entry in "scores" with these fields:
- index (number, 0-based)
- ctrScore (1-10)
- emotionImpact (1-10)
- textReadability (1-10)
- curiosityGap (1-10)
- focalClarity (1-10)
- mobileReadability (1-10)
- strengths: 2-3 specific strengths (short bullet phrases)
- weaknesses: 2-3 specific weaknesses (short bullet phrases)
- improvements: 2-4 concrete tweaks to raise CTR

Then add:
- winnerIndex (number, 0-based) — the highest-CTR thumbnail
- verdict (1-line Hinglish summary explaining why it won)

JSON schema:
{
  "scores": [{ "index": number, "ctrScore": number, "emotionImpact": number, "textReadability": number, "curiosityGap": number, "focalClarity": number, "mobileReadability": number, "strengths": [string], "weaknesses": [string], "improvements": [string] }],
  "winnerIndex": number,
  "verdict": string
}`;

    const parts: any[] = thumbnails.map((t: any) => ({
      inlineData: { mimeType: t.mimeType, data: t.data },
    }));
    parts.push({ text: prompt });

    const MODELS = ["gemini-2.5-flash", "gemini-2.0-flash"];
    let lastErr: any;
    for (const model of MODELS) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: [{ role: "user", parts }],
          config: {
            systemInstruction: THUMB_SCORER_SYSTEM,
            responseMimeType: "application/json",
          },
        });
        const text = response.text ?? "{}";
        const data = JSON.parse(text);
        res.json(data);
        return;
      } catch (err: any) {
        lastErr = err;
        const status = err?.status ?? err?.response?.status;
        const retryable = status === 503 || status === 429 || status >= 500;
        if (!retryable) break;
      }
    }
    throw lastErr ?? new Error("All score models failed");
  } catch (err: any) {
    console.error("[/ai/score-thumbnails] failed", err);
    res.status(502).json({ error: err?.message ?? "Scoring failed" });
  }
});

// ============ Comment Reply Helper ============
const COMMENT_HELPER_SYSTEM = `You are a YouTube comments triage assistant for a Hindi tech-creator channel. The creator gets dozens of comments per video and needs to reply quickly to the ones that matter most for engagement.

For each comment, you must:
1) Classify priority: "pin" (golden engagement-driver — pin to top), "reply" (reply for engagement), "skip" (low value), or "warn" (toxic/spam — ignore or delete)
2) Detect intent: "question", "praise", "criticism", "suggestion", "spam", "joke", "personal"
3) Detect sentiment: "positive", "negative", "neutral"
4) Draft a SHORT, warm Hinglish reply (1-2 sentences max, like the creator is texting a friend, no corporate tone, no emojis unless natural). For "skip" or "warn", set draftReply to empty string.
5) Give a 1-line "why" explaining the priority

Be ruthlessly selective with "pin" (max 1-2 across the whole batch — only the BEST engagement driver). Most should be "reply" or "skip". Never give generic replies — reference the actual comment content.

Return STRICT JSON.`;

router.post("/ai/comment-replies", async (req, res) => {
  try {
    const { comments, videoTitle, channelName, niche } = req.body ?? {};
    if (!Array.isArray(comments) || comments.length === 0) {
      res.status(400).json({ error: "Provide a non-empty 'comments' array" });
      return;
    }
    const trimmed = comments.slice(0, 30); // safety cap

    const commentsBlock = trimmed
      .map((c: any, i: number) => `[${i}] @${c.author ?? "user"}: ${String(c.text ?? "").slice(0, 500)}`)
      .join("\n");

    const prompt = `Channel: ${channelName ?? "Creator"} (${niche ?? "general"})
Video: "${videoTitle ?? "(not provided)"}"

Comments to triage (index in brackets, EXACT same order in output):
${commentsBlock}

For EACH comment, return one entry in "replies" with:
- index (number, 0-based, matching above)
- priority: "pin" | "reply" | "skip" | "warn"
- intent: "question" | "praise" | "criticism" | "suggestion" | "spam" | "joke" | "personal"
- sentiment: "positive" | "negative" | "neutral"
- draftReply (string — empty for skip/warn)
- why (1-line Hinglish reason)

JSON schema:
{
  "replies": [{ "index": number, "priority": string, "intent": string, "sentiment": string, "draftReply": string, "why": string }]
}`;

    const MODELS = ["gemini-2.5-flash", "gemini-2.0-flash"];
    let lastErr: any;
    for (const model of MODELS) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          config: {
            systemInstruction: COMMENT_HELPER_SYSTEM,
            responseMimeType: "application/json",
          },
        });
        const text = response.text ?? "{}";
        const data = JSON.parse(text);
        res.json(data);
        return;
      } catch (err: any) {
        lastErr = err;
        const status = err?.status ?? err?.response?.status;
        const retryable = status === 503 || status === 429 || status >= 500;
        if (!retryable) break;
      }
    }
    throw lastErr ?? new Error("All comment-reply models failed");
  } catch (err: any) {
    console.error("[/ai/comment-replies] failed", err);
    res.status(502).json({ error: err?.message ?? "Comment reply generation failed" });
  }
});

export default router;
