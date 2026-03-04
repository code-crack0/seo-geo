// src/lib/ai.ts
import { createAnthropic } from "@ai-sdk/anthropic";

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  throw new Error("ANTHROPIC_API_KEY environment variable is not set");
}

export const anthropic = createAnthropic({ apiKey });
export const defaultModel = anthropic("claude-sonnet-4-6");
