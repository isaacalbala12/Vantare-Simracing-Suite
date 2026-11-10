import { tokens } from '../generado/tokens.js';
export { tokens };
type Hojas<T> = T extends string ? T : { [K in keyof T]: Hojas<T[K]> }[keyof T];
type Token = Hojas<typeof tokens>;
type Color = Extract<Token, `$color.${string}`>;
type Medida = Extract<Token, `$medida.${string}`> | Exclude<Token, `$color.${string}` | `$tipo.${string}` | `$mov.${string}` | `$efecto.${string}`> | 0 | 'auto' | '100%';
type Propiedad = 'opacidad' | 'x' | 'y' | 'escala' | 'giro' | 'fondo' | 'color' | 'borde';
type Compuestas = Partial<Record<'opacidad' | 'x' | 'y' | 'escala' | 'giro', number>>;
export type Transicion = Extract<Token, `$mov.${string}`> | { duracion: number; curva: 'lineal' | 'entrada' | 'salida' | 'entrada-salida' | [number, number, number, number]; retardo?: number } | { muelle: { rigidez: number; amortiguacion: number } };
export interface Estilo {
  ancho?: Medida; alto?: Medida; min_ancho?: Medida; max_ancho?: Medida;
  direccion?: 'fila' | 'columna'; alinear?: 'inicio' | 'centro' | 'fin' | 'estirar';
  justificar?: 'inicio' | 'centro' | 'fin' | 'entre'; hueco?: Medida;
  relleno?: Medida | [Medida, Medida] | [Medida, Medida, Medida, Medida];
  crecer?: number; encoger?: number; posicion?: 'relativa' | 'absoluta';
  arriba?: Medida; izquierda?: Medida; derecha?: Medida; abajo?: Medida;
  fondo?: Color | { lineal: { angulo: number; paradas: [Color, number][] } };
  borde?: { ancho: Medida; color: Color }; radio?: Medida | [Medida, Medida, Medida, Medida];
  sombra?: Extract<Token, `$efecto.${string}`>; opacidad?: number;
  tipo?: Extract<Token, `$tipo.${string}`>; color?: Color; alinear_texto?: 'inicio' | 'centro' | 'fin';
}
interface Entrada { desde: Compuestas; transicion: Transicion }
interface Salida { hacia: Compuestas; transicion: Transicion }
interface Bucle { cuando?: boolean; propiedad: Propiedad; valores: number[]; duracion: number }
interface Comunes {
  id?: string; estilo?: Estilo; capa?: boolean; visible?: boolean;
  estados?: { cuando: boolean; estilo?: Estilo; bucle?: Bucle }[];
  transiciones?: Partial<Record<Propiedad, Transicion>>;
  bucle?: Bucle;
}
// Estos marcadores nunca se ejecutan: el traductor solo lee su AST.
export interface Nodo { readonly __nodo: unique symbol }
function marcado(): Nodo { throw new Error('Traduce el TSX a JSON; no ejecutes el marcado.'); }
export function Overlay(_props: { nombre: string; modelo: string; visible?: boolean; entrada?: Entrada; salida?: Salida; children: Nodo }): Nodo { return marcado(); }
export function Caja(_props: Comunes & { children?: Nodo | Nodo[] }): Nodo { return marcado(); }
export function Texto(_props: Comunes & { children: string | number }): Nodo { return marcado(); }
export function Lista<T>(_props: Comunes & { de: T[]; clave: Extract<keyof T, string>; entrada?: Entrada; salida?: Salida; movimiento?: Transicion; children: (fila: T) => Nodo }): Nodo { return marcado(); }
export function no(_valor: boolean): boolean { throw new Error('Solo marcado: no().'); }
export function es<T extends string>(_valor: T, _igual: NoInfer<T>): boolean { throw new Error('Solo marcado: es().'); }
declare global {
  namespace JSX {
    type Element = Nodo;
    interface ElementChildrenAttribute { children: unknown }
  }
}
