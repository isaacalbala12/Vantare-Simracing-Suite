// Superficie Node utilizada; evita añadir @types/node como dependencia.
declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string;
  export function writeFileSync(path: string, data: string): void;
  export function renameSync(oldPath: string, newPath: string): void;
  export function watch(path: string, listener: (evento: string, nombre: string | null) => void): { close(): void };
}
declare module 'node:path' {
  const path: { resolve(...paths: string[]): string; dirname(path: string): string; basename(path: string, suffix?: string): string; sep: string };
  export default path;
}
declare module 'node:url' { export function fileURLToPath(url: string): string }
declare const process: {
  argv: string[]; exitCode?: number;
  on(event: string, listener: () => void): void;
};
