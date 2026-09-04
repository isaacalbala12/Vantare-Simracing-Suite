import fs from 'node:fs';
import path from 'node:path';
export function experimentPlugin(name, output) {
 return {name:'astra-isolated-experiment',enforce:'pre',transform(code,id) {
  let next=code;
  if(name==='geometry-defer' && /track-map-view-model(-v2)?\.ts$/.test(id)) next=code.replace(/import \{ REFERENCE_LOOP_ID, TRACK_GEOMETRY_PACK \} from "([^";]+)";/, 'const { REFERENCE_LOOP_ID, TRACK_GEOMETRY_PACK } = await import("$1");');
  if(name==='track-cache' &&id.endsWith('/track-map-view-model-v2.ts')){
   next=code.replace('const projection = createTrackProjection(geometry.points, TRACK_MAP_VIEWPORT_V2);','const outline = getStaticOutline(geometry);\n  const projection = outline?.projection;').replace('outlinePath: buildTrackOutlinePath(geometry.points, projection),','outlinePath: outline!.path,');
   next+=`\n// Cache only the latest immutable bundled outline; markers remain per frame.\nlet lastOutline: { geometry: TrackGeometry; width: number; height: number; padding: number; projection: TrackProjection; path: string } | undefined;\nfunction getStaticOutline(geometry: TrackGeometry) {\n  const { width, height, padding } = TRACK_MAP_VIEWPORT_V2;\n  if (lastOutline?.geometry === geometry && lastOutline.width === width && lastOutline.height === height && lastOutline.padding === padding) return lastOutline;\n  const projection = createTrackProjection(geometry.points, TRACK_MAP_VIEWPORT_V2);\n  if (!projection) return undefined;\n  lastOutline = { geometry, width, height, padding, projection, path: buildTrackOutlinePath(geometry.points, projection) };\n  return lastOutline;\n}\n`;
  }
  if(name==='edit-lazy'&&id.endsWith('/overlay/CompositeApp.tsx')){
   next=code.replace('import { useEffect,','import { lazy, Suspense, useEffect,').replace('import { InPlaceEditModeBranch } from "./edit/InPlaceEditModeBranch";','const InPlaceEditModeBranch = lazy(async () => ({ default: (await import("./edit/InPlaceEditModeBranch")).InPlaceEditModeBranch }));').replace('<InPlaceEditModeBranch','<Suspense fallback={null}><InPlaceEditModeBranch');
   const at=next.indexOf('<Suspense fallback={null}><InPlaceEditModeBranch');if(at>=0){const end=next.indexOf('/>',at);next=next.slice(0,end+2)+'</Suspense>'+next.slice(end+2);}
  }
  if(name==='locale-active'&&id.endsWith('/i18n/i18n.ts')){
   next=code.replace(/^import \{ (es|en|pt|it) \} from "\.\/locales\/\1";\n/gm,'');
   next=next.replace('const dictionaries: Record<Locale, Record<string, string>> = { es, en, pt, it };',`const dictionaries: Partial<Record<Locale, Record<string, string>>> = {};\nconst loaders = { es: () => import('./locales/es').then(m=>m.es), en: () => import('./locales/en').then(m=>m.en), pt: () => import('./locales/pt').then(m=>m.pt), it: () => import('./locales/it').then(m=>m.it) };\nexport async function loadLocale(locale: Locale) { dictionaries[locale] ??= await loaders[locale](); }\nlet initial: Locale = DEFAULT_LOCALE;\ntry { initial = normalizeLocale(localStorage.getItem('vantare.locale')); } catch {}\nawait loadLocale(initial);`).replace('return dict[key] ?? key;','return dict?.[key] ?? key;');
  }
  if(name==='locale-active'&&id.endsWith('/i18n/i18n-context.ts')) next=code.replace('label: translate(locale, `language.${locale}`),',`label: ({es:'Español',en:'English',pt:'Português',it:'Italiano'})[locale],`);
  if(name==='locale-active'&&id.endsWith('/i18n/i18n-provider.tsx')) next=code.replace('  DEFAULT_LOCALE,','  loadLocale,\n  DEFAULT_LOCALE,').replace('useCallback((newLocale: Locale) => {','useCallback(async (newLocale: Locale) => {').replace('    setLocaleState(safe);','    await loadLocale(safe);\n    setLocaleState(safe);');
  if(name==='route-lazy'&&id.endsWith('/hub/components/orbit/OrbitShell.tsx')){
   next=code.replace("import { useCallback,", "import { lazy, Suspense, useCallback,");
   next=next.replace(/import \{([^}]+)\} from '([^']+)';/g,(whole,names,source)=>{
    const symbols=names.split(',').map(x=>x.trim()).filter(Boolean);const component=symbols.find(x=>x.endsWith('OrbitPage')||x==='StudioRoute');
    if(!component||component==='HomeOrbitPage')return whole;
    const file=path.resolve(path.dirname(id),source+'.tsx');const body=fs.readFileSync(file,'utf8');
    const constants=symbols.filter(x=>x!==component).map(symbol=>{const m=body.match(new RegExp('export const '+symbol+' = ([^;]+);'));if(!m)throw new Error('Missing constant '+symbol);return 'const '+symbol+' = '+m[1]+';';});
    return constants.join('\n')+'\nconst '+component+' = lazy(async () => ({ default: (await import('+JSON.stringify(source)+')).'+component+' }));';
   });
   next=next.replace('<div className="orbit-workspace">','<div className="orbit-workspace"><Suspense fallback={null}>').replace('</OrbitKeepAlive>','</OrbitKeepAlive></Suspense>');
  }
  if(next!==code){const dir=path.join(output,'transforms',name);fs.mkdirSync(dir,{recursive:true});const file=path.basename(id);fs.writeFileSync(path.join(dir,file+'.before'),code);fs.writeFileSync(path.join(dir,file+'.after'),next);return {code:next,map:null};}
 }};
}
