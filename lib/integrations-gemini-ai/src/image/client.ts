import { GoogleGenAI, Modality } from "@google/genai";

const apiKey =
  process.env.GEMINI_API_KEY ||
  process.env.GOOGLE_GENAI_API_KEY ||
  process.env.VITE_GEMINI_API_KEY;

if (!apiKey) {
  throw new Error(
    "GEMINI_API_KEY must be set. Get a key at https://aistudio.google.com/apikey and add it to your environment.",
  );
}

const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;

export const ai = new GoogleGenAI({
  apiKey,
  ...(baseUrl
    ? { httpOptions: { apiVersion: "", baseUrl } }
    : {}),
});

export async function generateImage(
  prompt: string
): Promise<{ b64_json: string; mimeType: string }> {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-image",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      responseModalities: [Modality.TEXT, Modality.IMAGE],
    },
  });

  const candidate = response.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];
  const imagePart = parts.find(
    (part: { inlineData?: { data?: string; mimeType?: string } }) => part.inlineData
  );

  if (!imagePart?.inlineData?.data) {
    const textPart = parts
      .map((p: { text?: string }) => p.text)
      .filter(Boolean)
      .join(" ")
      .trim();
    const finishReason = (candidate as { finishReason?: string } | undefined)?.finishReason;
    const blockReason = (response as { promptFeedback?: { blockReason?: string } })
      ?.promptFeedback?.blockReason;
    const detail =
      blockReason
        ? `blocked by safety: ${blockReason}`
        : finishReason && finishReason !== "STOP"
          ? `finishReason=${finishReason}`
          : textPart
            ? `model replied with text instead of image: "${textPart.slice(0, 200)}"`
            : "model returned no image and no text";
    throw new Error(`No image data in response — ${detail}`);
  }

  return {
    b64_json: imagePart.inlineData.data,
    mimeType: imagePart.inlineData.mimeType || "image/png",
  };
}
