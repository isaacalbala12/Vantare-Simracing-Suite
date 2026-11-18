import { openReviewScene, reviewScenes } from "../check-resident-review.ts";
import type { VisualScene } from "./scenes.ts";

export const residentReviewScenes = Object.fromEntries(
  reviewScenes.map(([state, , scene = state]) => [
    `launcher-review-${scene}`,
    {
      mock: `launcher-review-${scene}`,
      async prepare(page) {
        await openReviewScene(page, state);
      },
    } satisfies VisualScene,
  ]),
);
