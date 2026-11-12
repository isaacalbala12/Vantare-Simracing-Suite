// Read-only UI exercise AFTER both idle samples. Frame callbacks are a cadence
// proxy, not proof of presented FPS or a substitute for a human smoothness review.
export async function fluency(page) {
  await page.getByRole('navigation', {name:'Navegación principal'}).getByRole('button',{name:'Ajustes',exact:true}).click();
  await page.getByRole('tab',{name:'Apariencia',exact:true}).click();
  await page.getByRole('heading',{name:'Apariencia',exact:true}).waitFor();
  await page.emulateMedia({reducedMotion:'no-preference'});
  const scroll = await page.evaluate(async () => {
    const main = document.querySelector('.v-shell-main');
    if (!main) throw new Error('Missing measured scroll surface');
    const maximum = main.scrollHeight - main.clientHeight;
    const distance = Math.min(400, maximum);
    if (distance < 50) throw new Error('Scroll positive control has no meaningful range');
    const intervals = [], transitions = [];
    for (const target of [distance, 0, distance]) {
      const begin = performance.now(), start = main.scrollTop;
      main.scrollTo({top:target,behavior:'smooth'});
      await new Promise((accept,reject) => {
        let previous = performance.now();
        const frame = now => {
          intervals.push(now-previous); previous=now;
          if (Math.abs(main.scrollTop-target) < 1) {
            transitions.push({start,target,end:main.scrollTop,milliseconds:now-begin}); accept();
          } else if (now-begin > 4000) reject(new Error('Measured scroll did not reach its target'));
          else requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      });
    }
    return {intervals,transitions,maximum,distance,visibility:document.visibilityState,motion:document.documentElement.dataset.motion};
  });
  const sidebar = await page.evaluate(async () => {
    const nav = document.querySelector('.v-sidebar');
    const button = document.querySelector('button[aria-label="Contraer o ampliar navegación"]');
    if (!nav || !button) throw new Error('Missing sidebar animation positive control');
    const intervals=[],transitions=[];
    for (let run=0;run<2;run++) {
      const before=nav.getBoundingClientRect().width, begin=performance.now();
      const collapsed=nav.classList.contains('v-sidebar--collapsed');
      button.click();
      const target=collapsed?272:76;
      await new Promise((accept,reject)=>{
        let previous=performance.now();
        const frame=now=>{
          intervals.push(now-previous); previous=now;
          const width=nav.getBoundingClientRect().width;
          if(Math.abs(width-target)<1){transitions.push({before,target,end:width,milliseconds:now-begin});accept();}
          else if(now-begin>4000)reject(new Error('Measured sidebar did not reach its target'));
          else requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      });
    }
    return {intervals,transitions,transition:getComputedStyle(nav).transitionDuration};
  });
  return {scene:'Ajustes/Apariencia',scroll,sidebar};
}
