import { GoogleGenAI } from "@google/genai";

function getAi(): GoogleGenAI {
  const apiKey =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_GENAI_API_KEY ||
    process.env.VITE_GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not set. Add it to Replit Secrets to enable AI features.",
    );
  }

  const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;

  return new GoogleGenAI({
    apiKey,
    ...(baseUrl
      ? { httpOptions: { apiVersion: "", baseUrl } }
      : {}),
  });
}

export const ai = new Proxy({} as GoogleGenAI, {
  get(_target, prop) {
    return (getAi() as any)[prop];
  },
});
