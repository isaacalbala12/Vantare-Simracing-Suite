// One source for the frozen GPUI illustrations used by the web onboarding.
import { cp, mkdir } from "node:fs/promises";

const source = new URL("../../native/hub/assets/onboarding/", import.meta.url);
const destination = new URL(
  "../src/renderer/assets/onboarding/",
  import.meta.url,
);
await mkdir(destination, { recursive: true });
for (const name of [
  "backdrop.svg",
  "helmet.svg",
  "discord.svg",
  "google.svg",
  "email.svg",
  "panel.svg",
  "track.svg",
  "pro.png",
  "plus.png",
  "launch.png",
]) {
  await cp(new URL(name, source), new URL(name, destination));
}
await cp(
  new URL(
    "../../native/assets/brand/wordmark/vantare-wordmark-blanco.svg",
    import.meta.url,
  ),
  new URL("wordmark.svg", destination),
);

await cp(
  new URL("../../native/ui/fixtures/onboarding-previews.json", import.meta.url),
  new URL("previews.json", destination),
);
