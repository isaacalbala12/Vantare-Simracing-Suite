// Generado por generar.mjs. No editar.
export type Relativo = {
readonly "en_garaje": boolean;
readonly "titulo": string;
readonly "contexto": string;
readonly "marca": boolean;
readonly "aviso_visible": boolean;
readonly "aviso": "ninguno" | "fcy" | "amarilla" | "boxes";
readonly "aviso_texto": string;
readonly "aviso_derecha": string;
readonly "filas": Array<{
readonly "id": string;
readonly "vacio": boolean;
readonly "posicion": string;
readonly "piloto": string;
readonly "detalle": string;
readonly "vueltas": string;
readonly "vueltas_visible": boolean;
readonly "gap": string;
readonly "clase": "hyper" | "lmp" | "gt" | "otra";
readonly "lado": "delante" | "jugador" | "detras";
readonly "jugador": boolean;
readonly "cerca": boolean;
readonly "boxes": boolean;
}>;
readonly "pie_visible": boolean;
readonly "pie": "ninguno" | "espera" | "trafico" | "boxes" | "sesion";
readonly "pie_trafico": string;
readonly "pie_salida": string;
readonly "pie_perdida": string;
readonly "pie_sesion": string;
};
export declare const m: Relativo;
