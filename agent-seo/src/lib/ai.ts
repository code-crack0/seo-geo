// src/lib/ai.ts
import { createGoogleGenerativeAI } from "@ai-sdk/google";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  throw new Error("GEMINI_API_KEY environment variable is not set");
}

export const google = createGoogleGenerativeAI({ apiKey });
export const defaultModel = google("gemini-2.5-pro");
