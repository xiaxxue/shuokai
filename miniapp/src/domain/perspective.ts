import type { Perspective } from "./types";

export function perspectiveFromDraft(transcript: string, feeling: string): Perspective {
  return {
    fact: transcript.trim().slice(0, 1000),
    meaning: feeling.trim().slice(0, 1000),
    impact: "",
    request: "",
  };
}
