import { openReviewScene, reviewScenes } from "../check-resident-review.ts";
import type { VisualScene } from "./scenes.ts";

export const residentReviewScenes = Object.fromEntries(
  reviewScenes.map(([state]) => [
    `launcher-review-${state}`,
    {
      mock: `launcher-review-${state}`,
      async prepare(page) {
        await openReviewScene(page, state);
      },
    } satisfies VisualScene,
  ]),
);
