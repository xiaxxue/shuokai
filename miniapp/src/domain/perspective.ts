import type { Perspective } from "./types";

export function perspectiveFromDraft(transcript: string, clarification: string): Perspective {
  return {
    fact: transcript.trim().slice(0, 1000),
    meaning: clarification.trim().slice(0, 1000),
    impact: "",
    request: "",
  };
}
