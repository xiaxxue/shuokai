import type { Perspective } from "./types";

export function createNvcPerspective(feeling = ""): Perspective {
  return {
    fact: "",
    meaning: feeling.trim().slice(0, 1000),
    impact: "",
    request: "",
  };
}
