// One source for the frozen GPUI illustrations used by the web onboarding.
import { cp, mkdir, readdir } from "node:fs/promises";

const source = new URL("../../native/hub/assets/onboarding/", import.meta.url);
const destination = new URL(
  "../src/renderer/assets/onboarding/",
  import.meta.url,
);
await mkdir(destination, { recursive: true });
for (const name of await readdir(source)) {
  if (!/^[a-z-]+\.(svg|png)$/.test(name)) continue;
  await cp(new URL(name, source), new URL(name, destination));
}
await cp(
  new URL(
    "../../native/assets/brand/wordmark/vantare-wordmark-blanco.svg",
    import.meta.url,
  ),
  new URL("wordmark.svg", destination),
);
