import { chromium } from "playwright";

function argument(name, fallback = "") {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
}

const cdp = argument("cdp");
const url = argument("url");
const label = argument("label", "unnamed");
const motion = argument("motion", "no-preference");
const flow = argument("flow", "return");

if (
  !cdp ||
  !url ||
  !["no-preference", "reduce"].includes(motion) ||
  !["initial", "return"].includes(flow)
) {
  throw new Error(
    "usage: node scripts/studio-widget-jump-webview-ab.mjs " +
      "--cdp http://127.0.0.1:9223 --url http://127.0.0.1:5197/orbit-studio-harness.html " +
      "--label parent --motion no-preference|reduce --flow initial|return",
  );
}

const browser = await chromium.connectOverCDP(cdp);

try {
  const pages = browser.contexts().flatMap((context) => context.pages());
  const page = pages.find((candidate) => candidate.url().startsWith("http://wails.localhost")) ?? pages[0];
  if (!page) throw new Error(`${label}: WebView2 did not expose a page target`);

  await page.emulateMedia({ reducedMotion: motion });
  const installRecorder = (sampleLimit) => {
    window.__vantareStudioJumpSamples = [];
    window.__vantareStudioJumpDone = false;
    let remaining = sampleLimit;
    const tick = (time) => {
      const stage = document.querySelector('[data-testid="orbit-studio-stage"]');
      const scene = document.querySelector('[data-testid="orbit-studio-scene"]');
      const frames = [...document.querySelectorAll('[data-testid^="studio-widget-frame-"]')]
        .filter((node) => !node.getAttribute("data-testid")?.includes("chrome"))
        .map((node) => {
          const rect = node.getBoundingClientRect();
          return {
            id: node.getAttribute("data-testid"),
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          };
        });
      const style = scene ? getComputedStyle(scene) : null;
      window.__vantareStudioJumpSamples.push({
        time,
        fonts: document.fonts.status,
        stage: Boolean(stage),
        scene: scene
          ? {
              transform: style.transform,
              visibility: style.visibility,
              transitions: scene.getAnimations().length,
            }
          : null,
        frames,
      });
      remaining -= 1;
      if (remaining > 0) requestAnimationFrame(tick);
      else window.__vantareStudioJumpDone = true;
    };
    requestAnimationFrame(tick);
  };

  if (flow === "initial") {
    const session = await page.context().newCDPSession(page);
    await session.send("Network.enable");
    await session.send("Network.clearBrowserCache");
    await page.addInitScript(installRecorder, 360);
    await page.goto(url, { waitUntil: "domcontentloaded" });
  } else {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.getByTestId("orbit-studio-stage").waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.getByTestId("orbit-rail-launcher").click();
    await page.getByTestId("orbit-launcher").waitFor();
    await page.evaluate(installRecorder, 120);
    await page.getByTestId("orbit-rail-studio").click();
  }

  await page.getByTestId("orbit-studio-stage").waitFor();
  await page.waitForFunction(() => window.__vantareStudioJumpDone === true, null, {
    timeout: 10_000,
  });

  const result = await page.evaluate(({ flow, label, motion }) => {
    const samples = window.__vantareStudioJumpSamples;
    const withScene = samples.filter((sample) => sample.scene);
    const withFrames = withScene.filter((sample) => sample.frames.length > 0);
    const frameIntervals = samples.slice(1).map((sample, index) => sample.time - samples[index].time);
    const sortedIntervals = [...frameIntervals].sort((left, right) => left - right);
    let largestStep = { pixels: 0, from: null, to: null, id: null };
    for (let index = 1; index < withFrames.length; index += 1) {
      const previous = new Map(withFrames[index - 1].frames.map((frame) => [frame.id, frame]));
      for (const frame of withFrames[index].frames) {
        const before = previous.get(frame.id);
        if (!before) continue;
        const pixels = Math.hypot(frame.x - before.x, frame.y - before.y);
        if (pixels > largestStep.pixels) {
          largestStep = {
            pixels,
            id: frame.id,
            from: { x: before.x, y: before.y },
            to: { x: frame.x, y: frame.y },
          };
        }
      }
    }
    return {
      label,
      motion,
      flow,
      prefersReducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
      sampleCount: samples.length,
      medianFrameMs: sortedIntervals[Math.floor(sortedIntervals.length / 2)] ?? null,
      firstSceneSample: samples.findIndex((sample) => sample.scene),
      firstWidgetSample: samples.findIndex((sample) => sample.frames.length > 0),
      hiddenSceneFrames: withScene.filter((sample) => sample.scene.visibility === "hidden").length,
      scaleZeroFrames: withScene.filter((sample) => sample.scene.transform.startsWith("matrix(0,")).length,
      zeroSizedWidgetFrames: withFrames.filter((sample) =>
        sample.frames.some((frame) => frame.width === 0 || frame.height === 0),
      ).length,
      activeTransitionFrames: withScene.filter((sample) => sample.scene.transitions > 0).length,
      fontLoadingFrames: samples.filter((sample) => sample.fonts !== "loaded").length,
      largestPositionStep: largestStep,
      finalFrames: withFrames.at(-1)?.frames ?? [],
    };
  }, { flow, label, motion });

  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
