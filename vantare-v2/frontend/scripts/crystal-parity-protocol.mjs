const DEFAULT_CHANNEL_TOLERANCE = 1;
const DEFAULT_ALPHA_MEAN_TOLERANCE = 1 / 255;

export const CONTROL_SCENES = Object.freeze([
  Object.freeze({
    id: 'transparent',
    backgroundColor: 'transparent',
    backgroundImage: 'none',
  }),
  Object.freeze({
    id: 'solid',
    backgroundColor: '#060608',
    backgroundImage: 'none',
  }),
  Object.freeze({
    id: 'grid',
    backgroundColor: '#d9dde7',
    backgroundImage: [
      'linear-gradient(45deg, rgba(10, 18, 32, 0.9) 25%, transparent 25%)',
      'linear-gradient(-45deg, rgba(10, 18, 32, 0.9) 25%, transparent 25%)',
      'linear-gradient(45deg, transparent 75%, rgba(10, 18, 32, 0.9) 75%)',
      'linear-gradient(-45deg, transparent 75%, rgba(10, 18, 32, 0.9) 75%)',
    ].join(','),
    backgroundPosition: '0 0, 0 16px, 16px -16px, -16px 0',
    backgroundSize: '32px 32px',
  }),
]);

function assertSameLength(reference, actual, referenceScene, actualScene) {
  if (
    reference.length !== actual.length
    || reference.length !== referenceScene.length
    || reference.length !== actualScene.length
  ) {
    throw new Error('RGBA layers must have identical dimensions');
  }
  if (reference.length % 4 !== 0) throw new Error('RGBA layers must contain complete pixels');
}

function pixelDiffers(left, right, offset, tolerance) {
  const leftAlpha = left[offset + 3];
  const rightAlpha = right[offset + 3];
  if (Math.abs(leftAlpha - rightAlpha) > tolerance) return true;
  for (let channel = 0; channel < 3; channel += 1) {
    const leftPremultiplied = left[offset + channel] * leftAlpha / 255;
    const rightPremultiplied = right[offset + channel] * rightAlpha / 255;
    if (Math.abs(leftPremultiplied - rightPremultiplied) > tolerance) return true;
  }
  return false;
}

export function createComparisonMask(
  reference,
  actual,
  referenceScene,
  actualScene = referenceScene,
  channelTolerance = DEFAULT_CHANNEL_TOLERANCE,
) {
  assertSameLength(reference, actual, referenceScene, actualScene);
  const mask = new Uint8Array(reference.length / 4);
  for (let offset = 0, pixelIndex = 0; offset < reference.length; offset += 4, pixelIndex += 1) {
    if (
      pixelDiffers(reference, referenceScene, offset, channelTolerance)
      || pixelDiffers(actual, actualScene, offset, channelTolerance)
    ) {
      mask[pixelIndex] = 1;
    }
  }
  return mask;
}

export function compareRgbaLayers({
  reference,
  actual,
  referenceScene,
  actualScene = referenceScene,
  channelTolerance = DEFAULT_CHANNEL_TOLERANCE,
  alphaMeanTolerance = DEFAULT_ALPHA_MEAN_TOLERANCE,
}) {
  const mask = createComparisonMask(
    reference,
    actual,
    referenceScene,
    actualScene,
    channelTolerance,
  );
  let maskPixels = 0;
  let alphaAbsoluteDelta = 0;
  let alphaMismatchPixels = 0;
  let compositeMismatchPixels = 0;

  for (let pixelIndex = 0; pixelIndex < mask.length; pixelIndex += 1) {
    if (!mask[pixelIndex]) continue;
    maskPixels += 1;
    const offset = pixelIndex * 4;
    const alphaDelta = Math.abs(reference[offset + 3] - actual[offset + 3]) / 255;
    alphaAbsoluteDelta += alphaDelta;
    if (alphaDelta > alphaMeanTolerance) alphaMismatchPixels += 1;
    if (pixelDiffers(reference, actual, offset, channelTolerance)) compositeMismatchPixels += 1;
  }

  const denominator = Math.max(maskPixels, 1);
  const alphaMeanDelta = alphaAbsoluteDelta / denominator;
  return {
    mask,
    maskPixels,
    alphaMeanDelta,
    alphaMismatchRatio: alphaMismatchPixels / denominator,
    alphaPass: maskPixels > 0 && alphaMeanDelta <= alphaMeanTolerance,
    compositeDeltaRatio: compositeMismatchPixels / denominator,
  };
}

export function analyzeRgbaCapture({ widget, scene, width, height, guard = 8, channelTolerance = DEFAULT_CHANNEL_TOLERANCE }) {
  if (widget.length !== width * height * 4 || scene.length !== widget.length) {
    throw new Error('RGBA capture dimensions do not match pixel data');
  }
  let alphaLt255 = 0;
  let alphaZero = 0;
  let alphaSum = 0;
  let guardChangedPixels = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const alpha = widget[offset + 3];
      alphaSum += alpha;
      if (alpha < 255) alphaLt255 += 1;
      if (alpha === 0) alphaZero += 1;
      const inGuard = x < guard || y < guard || x >= width - guard || y >= height - guard;
      if (inGuard && pixelDiffers(widget, scene, offset, channelTolerance)) guardChangedPixels += 1;
    }
  }
  const pixels = width * height;
  return {
    alphaLt255Ratio: alphaLt255 / pixels,
    alphaZeroRatio: alphaZero / pixels,
    meanAlpha: alphaSum / pixels,
    guardChangedPixels,
    guardClear: guardChangedPixels === 0,
  };
}

export function isolateWidgetStyles(selector, {
  x,
  y,
  width,
  height,
  scene = CONTROL_SCENES[0],
} = {}) {
  const sizeRules = [
    Number.isFinite(width) ? `width:${width}px!important` : '',
    Number.isFinite(height) ? `height:${height}px!important` : '',
  ].filter(Boolean).join(';');
  return `
    html, html body {
      margin: 0 !important;
      padding: 0 !important;
      overflow: hidden !important;
      background: ${scene.backgroundColor ?? 'transparent'} !important;
      background-image: ${scene.backgroundImage ?? 'none'} !important;
      background-position: ${scene.backgroundPosition ?? '0 0'} !important;
      background-size: ${scene.backgroundSize ?? 'auto'} !important;
    }
    body * {
      visibility: hidden !important;
      animation: none !important;
      transition: none !important;
      caret-color: transparent !important;
    }
    ${selector}, ${selector} * { visibility: visible !important; }
    ${selector}[data-crystal-parity-hidden],
    ${selector}[data-crystal-parity-hidden] * { visibility: hidden !important; }
    ${selector} {
      position: fixed !important;
      left: ${Number.isFinite(x) ? x : 0}px !important;
      top: ${Number.isFinite(y) ? y : 0}px !important;
      margin: 0 !important;
      box-sizing: border-box !important;
      transform: none !important;
      ${sizeRules}
    }
  `;
}

export async function captureIsolatedElement(page, {
  selector,
  scene = CONTROL_SCENES[0],
  margin = 128,
  guard = 8,
  layoutWidth = 1920,
}) {
  const layoutStyle = await page.addStyleTag({
    content: `
      html, html body {
        width: ${layoutWidth}px !important;
        max-width: ${layoutWidth}px !important;
      }
    `,
  });
  const locator = page.locator(selector);
  const count = await locator.count();
  if (count !== 1) throw new Error(`${selector} matched ${count} elements`);

  const geometry = await locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      boxSizing: style.boxSizing,
      clientWidth: element.clientWidth,
      clientHeight: element.clientHeight,
      scrollWidth: element.scrollWidth,
      scrollHeight: element.scrollHeight,
    };
  });
  const contentWidth = Math.ceil(geometry.width);
  const contentHeight = Math.ceil(geometry.height);
  const captureWidth = contentWidth + margin * 2;
  const captureHeight = contentHeight + margin * 2;
  const viewport = page.viewportSize();
  if (!viewport || viewport.width < captureWidth || viewport.height < captureHeight) {
    await page.setViewportSize({
      width: Math.max(viewport?.width ?? 0, captureWidth),
      height: Math.max(viewport?.height ?? 0, captureHeight),
    });
  }

  await locator.evaluate((element) => {
    element.setAttribute('data-crystal-parity-target', '');
  });
  const style = await page.addStyleTag({
    content: isolateWidgetStyles('[data-crystal-parity-target]', {
      x: margin,
      y: margin,
      width: contentWidth,
      height: contentHeight,
      scene,
    }),
  });
  const clip = { x: 0, y: 0, width: captureWidth, height: captureHeight };

  try {
    await locator.evaluate((element) => element.setAttribute('data-crystal-parity-hidden', ''));
    const sceneOnly = await page.screenshot({ clip, animations: 'disabled', omitBackground: true });
    await locator.evaluate((element) => element.removeAttribute('data-crystal-parity-hidden'));
    await page.evaluate(() => new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    }));
    const widget = await page.screenshot({ clip, animations: 'disabled', omitBackground: true });
    return {
      widget,
      sceneOnly,
      geometry: {
        ...geometry,
        contentWidth,
        contentHeight,
        captureWidth,
        captureHeight,
        margin,
        guard,
      },
    };
  } finally {
    await style.evaluate((element) => element.remove());
    await layoutStyle.evaluate((element) => element.remove());
    await locator.evaluate((element) => {
      element.removeAttribute('data-crystal-parity-target');
      element.removeAttribute('data-crystal-parity-hidden');
    });
  }
}

export async function collectTextContract(page, selector, margin = 128) {
  return page.locator(selector).evaluate((root, captureMargin) => {
    const rootRect = root.getBoundingClientRect();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const entries = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node.textContent?.trim()) continue;
      const parent = node.parentElement;
      if (!parent) continue;
      const style = getComputedStyle(parent);
      if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const rect of range.getClientRects()) {
        if (rect.width <= 0 || rect.height <= 0) continue;
        entries.push({
          rect: {
            x: Math.floor(captureMargin + rect.x - rootRect.x - 1),
            y: Math.floor(captureMargin + rect.y - rootRect.y - 1),
            width: Math.ceil(rect.width + 2),
            height: Math.ceil(rect.height + 2),
          },
          style: {
            family: style.fontFamily.split(',')[0].replaceAll('"', '').trim(),
            size: Number.parseFloat(style.fontSize),
            weight: Number.parseInt(style.fontWeight, 10) || 400,
            lineHeight: style.lineHeight === 'normal' ? null : Number.parseFloat(style.lineHeight),
            letterSpacing: style.letterSpacing === 'normal' ? 0 : Number.parseFloat(style.letterSpacing),
            writingMode: style.writingMode,
          },
        });
      }
    }
    return entries;
  }, margin);
}

export function compareTypographyContracts(reference, actual) {
  const matches = (left, right) => (
    left.family === right.family
    && Math.abs(left.size - right.size) <= 1
    && Math.abs(left.weight - right.weight) <= 100
    && Math.abs(left.letterSpacing - right.letterSpacing) <= 1
    && left.writingMode === right.writingMode
    && (
      left.lineHeight === null
      || right.lineHeight === null
      || Math.abs(left.lineHeight - right.lineHeight) <= 1
    )
  );
  const coverage = (source, target) => {
    const total = source.reduce((sum, entry) => sum + entry.rect.width * entry.rect.height, 0);
    if (total === 0) return target.length === 0 ? 1 : 0;
    const covered = source.reduce((sum, entry) => (
      target.some((candidate) => matches(entry.style, candidate.style))
        ? sum + entry.rect.width * entry.rect.height
        : sum
    ), 0);
    return covered / total;
  };
  const referenceCoverage = coverage(reference, actual);
  const actualCoverage = coverage(actual, reference);
  return {
    referenceCoverage,
    actualCoverage,
    pass: referenceCoverage >= 0.9 && actualCoverage >= 0.9,
  };
}

export async function decodePng(page, buffer) {
  const source = `data:image/png;base64,${buffer.toString('base64')}`;
  return page.evaluate(async (url) => {
    const image = await new Promise((resolve, reject) => {
      const candidate = new Image();
      candidate.onload = () => resolve(candidate);
      candidate.onerror = () => reject(new Error('PNG decode failed'));
      candidate.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('canvas context unavailable');
    context.drawImage(image, 0, 0);
    return {
      width: image.width,
      height: image.height,
      data: Array.from(context.getImageData(0, 0, image.width, image.height).data),
    };
  }, source);
}

export async function comparePngCaptures(page, {
  referenceWidget,
  referenceScene,
  actualWidget,
  actualScene,
  guard = 8,
  channelTolerance = 24,
  excludedRects = [],
}) {
  const urls = [referenceWidget, referenceScene, actualWidget, actualScene]
    .map((buffer) => `data:image/png;base64,${buffer.toString('base64')}`);
  return page.evaluate(async ({ sources, guardSize, tolerance, exclusions }) => {
    const decode = async (url) => {
      const image = await new Promise((resolve, reject) => {
        const candidate = new Image();
        candidate.onload = () => resolve(candidate);
        candidate.onerror = () => reject(new Error('PNG decode failed'));
        candidate.src = url;
      });
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('canvas context unavailable');
      context.drawImage(image, 0, 0);
      return {
        width: image.width,
        height: image.height,
        data: context.getImageData(0, 0, image.width, image.height).data,
      };
    };
    const [reference, referenceBaseline, actual, actualBaseline] = await Promise.all(sources.map(decode));
    const dimensions = [reference, referenceBaseline, actual, actualBaseline]
      .map(({ width, height }) => `${width}x${height}`);
    if (new Set(dimensions).size !== 1) {
      return { dimensionsMatch: false, dimensions };
    }
    const differs = (left, right, offset, limit) => {
      const leftAlpha = left[offset + 3];
      const rightAlpha = right[offset + 3];
      if (Math.abs(leftAlpha - rightAlpha) > limit) return true;
      for (let channel = 0; channel < 3; channel += 1) {
        const leftPremultiplied = left[offset + channel] * leftAlpha / 255;
        const rightPremultiplied = right[offset + channel] * rightAlpha / 255;
        if (Math.abs(leftPremultiplied - rightPremultiplied) > limit) return true;
      }
      return false;
    };
    let unionPixels = 0;
    let intersectionPixels = 0;
    let referencePixels = 0;
    let actualPixels = 0;
    let visualMismatchPixels = 0;
    let alphaMismatchPixels = 0;
    let alphaAbsoluteDelta = 0;
    let sceneMismatchPixels = 0;
    let referenceGuardPixels = 0;
    let actualGuardPixels = 0;
    let referenceAlphaLt255 = 0;
    let actualAlphaLt255 = 0;
    const width = reference.width;
    const height = reference.height;

    for (let offset = 0, pixel = 0; offset < reference.data.length; offset += 4, pixel += 1) {
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      const excluded = exclusions.some((rect) => (
        x >= rect.x && y >= rect.y && x < rect.x + rect.width && y < rect.y + rect.height
      ));
      const referenceAffected = differs(reference.data, referenceBaseline.data, offset, 1);
      const actualAffected = differs(actual.data, actualBaseline.data, offset, 1);
      const inGuard = x < guardSize || y < guardSize || x >= width - guardSize || y >= height - guardSize;
      if (excluded) {
        if (differs(referenceBaseline.data, actualBaseline.data, offset, 1)) sceneMismatchPixels += 1;
        continue;
      }
      if (referenceAffected) referencePixels += 1;
      if (actualAffected) actualPixels += 1;
      if (referenceAffected && actualAffected) intersectionPixels += 1;
      if (referenceAffected || actualAffected) {
        unionPixels += 1;
        const alphaDelta = Math.abs(reference.data[offset + 3] - actual.data[offset + 3]) / 255;
        alphaAbsoluteDelta += alphaDelta;
        if (alphaDelta > 1 / 255) alphaMismatchPixels += 1;
        let rgbMismatch = false;
        for (let channel = 0; channel < 3; channel += 1) {
          const referenceRgb = reference.data[offset + channel] * reference.data[offset + 3] / 255;
          const actualRgb = actual.data[offset + channel] * actual.data[offset + 3] / 255;
          if (Math.abs(referenceRgb - actualRgb) > tolerance) {
            rgbMismatch = true;
          }
        }
        if (rgbMismatch) visualMismatchPixels += 1;
      }
      if (differs(referenceBaseline.data, actualBaseline.data, offset, 1)) sceneMismatchPixels += 1;
      if (inGuard && referenceAffected) referenceGuardPixels += 1;
      if (inGuard && actualAffected) actualGuardPixels += 1;
      if (reference.data[offset + 3] < 255) referenceAlphaLt255 += 1;
      if (actual.data[offset + 3] < 255) actualAlphaLt255 += 1;
    }
    const pixels = width * height;
    const denominator = Math.max(unionPixels, 1);
    return {
      dimensionsMatch: true,
      dimensions,
      width,
      height,
      unionPixels,
      referencePixels,
      actualPixels,
      maskIoU: intersectionPixels / denominator,
      alphaMeanDelta: alphaAbsoluteDelta / denominator,
      alphaMismatchRatio: alphaMismatchPixels / denominator,
      compositeDeltaRatio: visualMismatchPixels / denominator,
      sceneDeltaRatio: sceneMismatchPixels / pixels,
      referenceGuardPixels,
      actualGuardPixels,
      referenceAlphaLt255Ratio: referenceAlphaLt255 / pixels,
      actualAlphaLt255Ratio: actualAlphaLt255 / pixels,
    };
  }, { sources: urls, guardSize: guard, tolerance: channelTolerance, exclusions: excludedRects });
}
