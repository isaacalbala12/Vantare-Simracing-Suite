// Only executed by the explicitly instrumented QA build, inside its local renderer.
export const measurementReadyScript = `(async () => {
          let timer;
          try {
            await Promise.race([
              (async () => {
                while (document.documentElement.dataset.vantareMeasurementReady !== "1")
                  await new Promise(resolve => setTimeout(resolve, 10));
                await document.fonts.ready;
                await Promise.all([...document.images].map(image => image.decode()));
                await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
              })(),
              new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Home readiness timed out")), 10000); })
            ]);
          } finally { clearTimeout(timer); }
        })()`;
