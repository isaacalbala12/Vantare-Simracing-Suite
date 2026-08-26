/**
 * Infografía de estrategia: una hoja para llevar a la carrera.
 *
 * Se dibuja sobre un lienzo en vez de exportar el DOM porque así el resultado
 * es idéntico en pantalla y en el fichero, usa las fuentes ya cargadas por la
 * aplicación y no depende de ninguna librería externa.
 *
 * Regla del expediente: aquí no se calcula nada. Todo lo que se pinta llega
 * resuelto por el motor o por la proyección, con su procedencia; lo que falta
 * se dibuja como ausente, nunca se rellena.
 */

export interface InfographicStop {
  readonly index: number;
  readonly lap: number;
  readonly fuelInLiters: number;
  readonly fuelOutLiters: number;
  readonly pitLossSeconds: number;
}

export interface InfographicStint {
  readonly laps: number;
  readonly startSeconds: number;
  readonly endSeconds: number;
}

export interface InfographicInput {
  readonly label: string;
  readonly value: string;
  readonly provenance: string;
  readonly missing: boolean;
}

export interface InfographicData {
  readonly eyebrow: string;
  readonly title: string;
  readonly subtitle: string;
  readonly window: string;
  readonly duration: string;
  readonly planName: string;
  readonly figures: readonly { label: string; value: string; unit?: string; sub: string; alert?: boolean }[];
  readonly stints: readonly InfographicStint[];
  readonly stops: readonly InfographicStop[];
  readonly stopsEmpty: string;
  readonly inputs: readonly InfographicInput[];
  readonly axis: readonly string[];
  readonly labels: {
    readonly timeline: string;
    readonly stops: string;
    readonly inputs: string;
    readonly stopLap: string;
    readonly stopIn: string;
    readonly stopOut: string;
    readonly stopTime: string;
    readonly laps: string;
  };
  readonly footer: string;
}

const W = 1400;
const H = 900;

const INK = "#f5f3f2";
const INK_2 = "#b7b2b2";
const INK_3 = "#8a858b";
const INK_4 = "#787379";
const LINE = "rgba(255,255,255,.085)";
const CARMINE = "#d52f49";
const RED = "#f04755";
const CANVAS_BG = "#0b0c0e";
const SANS = 'Inter, "Segoe UI Variable", "Segoe UI", system-ui, sans-serif';
const MONO = '"Cascadia Code", "SFMono-Regular", ui-monospace, monospace';

function micro(context: CanvasRenderingContext2D, text: string, x: number, y: number, color = INK_3) {
  context.save();
  context.fillStyle = color;
  context.font = `700 11px ${SANS}`;
  context.letterSpacing = "1.3px";
  context.fillText(text.toUpperCase(), x, y);
  context.restore();
}

function line(context: CanvasRenderingContext2D, x: number, y: number, width: number, color = LINE, height = 1) {
  context.fillStyle = color;
  context.fillRect(x, y, width, height);
}

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, height / 2, width / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}

/** Dibuja la hoja completa. El lienzo debe medir 1400×900 por unidad de escala. */
export function drawStrategyInfographic(context: CanvasRenderingContext2D, data: InfographicData): void {
  context.save();
  context.textBaseline = "alphabetic";
  context.fillStyle = CANVAS_BG;
  context.fillRect(0, 0, W, H);

  // Resplandor superior: la única licencia decorativa, y muy contenida.
  const glow = context.createRadialGradient(W / 2, -180, 40, W / 2, -180, 760);
  glow.addColorStop(0, "rgba(213,47,73,.22)");
  glow.addColorStop(1, "rgba(213,47,73,0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, W, 320);

  // ── Cabecera
  micro(context, data.eyebrow, 64, 62, INK_4);
  context.fillStyle = INK;
  context.font = `700 40px ${SANS}`;
  context.fillText(data.title, 64, 106);
  context.fillStyle = INK_2;
  context.font = `500 17px ${SANS}`;
  context.fillText(data.subtitle, 64, 134);

  context.textAlign = "right";
  context.fillStyle = INK_2;
  context.font = `500 15px ${MONO}`;
  context.fillText(data.window, W - 64, 84);
  context.fillStyle = INK_4;
  context.font = `500 13px ${SANS}`;
  context.fillText(`${data.duration} · ${data.planName}`, W - 64, 110);
  context.textAlign = "left";

  const rule = context.createLinearGradient(64, 0, W - 64, 0);
  rule.addColorStop(0, CARMINE);
  rule.addColorStop(0.55, "rgba(213,47,73,.18)");
  rule.addColorStop(1, "rgba(213,47,73,0)");
  context.fillStyle = rule;
  context.fillRect(64, 162, W - 128, 2);

  // ── Cifras clave
  const figures = data.figures.slice(0, 5);
  const cellW = (W - 128 - 24 * (figures.length - 1)) / figures.length;
  figures.forEach((figure, index) => {
    const x = 64 + index * (cellW + 24);
    const y = 206;
    context.fillStyle = "rgba(255,255,255,.022)";
    roundedRect(context, x, y, cellW, 128, 10);
    context.fill();
    context.strokeStyle = LINE;
    context.lineWidth = 1;
    roundedRect(context, x + 0.5, y + 0.5, cellW - 1, 127, 10);
    context.stroke();

    micro(context, figure.label, x + 18, y + 30);
    context.fillStyle = figure.alert ? RED : INK;
    context.font = `600 40px ${MONO}`;
    const value = figure.value;
    context.fillText(value, x + 18, y + 82);
    if (figure.unit) {
      const width = context.measureText(value).width;
      context.fillStyle = INK_4;
      context.font = `500 15px ${SANS}`;
      context.fillText(figure.unit, x + 18 + width + 7, y + 82);
    }
    line(context, x + 18, y + 94, figure.alert ? cellW - 36 : 26, figure.alert ? RED : CARMINE, 2);
    context.fillStyle = INK_4;
    context.font = `500 11.5px ${SANS}`;
    context.fillText(figure.sub, x + 18, y + 116);
  });

  // ── Línea de tiempo
  micro(context, data.labels.timeline, 64, 396, INK_3);
  const trackX = 64;
  const trackY = 414;
  const trackW = W - 128;
  const trackH = 46;
  context.fillStyle = "rgba(255,255,255,.03)";
  roundedRect(context, trackX, trackY, trackW, trackH, 8);
  context.fill();

  const spanSeconds = Math.max(1, data.stints.length ? data.stints[data.stints.length - 1].endSeconds : 1);
  data.stints.forEach((stint, index) => {
    const x = trackX + (stint.startSeconds / spanSeconds) * trackW;
    const width = Math.max(6, ((stint.endSeconds - stint.startSeconds) / spanSeconds) * trackW - 3);
    const fill = context.createLinearGradient(x, trackY, x, trackY + trackH);
    fill.addColorStop(0, "#e0384f");
    fill.addColorStop(1, "#a8213a");
    context.fillStyle = fill;
    roundedRect(context, x, trackY, width, trackH, 7);
    context.fill();
    context.fillStyle = "rgba(255,255,255,.94)";
    context.font = `700 13px ${SANS}`;
    context.textAlign = "center";
    context.fillText(`${stint.laps} ${data.labels.laps}`, x + width / 2, trackY + 28);
    context.textAlign = "left";
    if (index > 0) {
      // La parada es el corte entre stints: una marca fina, no un bloque.
      line(context, x - 3, trackY - 6, 2, "#ff9b57", trackH + 12);
    }
  });

  context.fillStyle = INK_4;
  context.font = `500 12px ${MONO}`;
  data.axis.forEach((label, index) => {
    const x = trackX + (index / Math.max(1, data.axis.length - 1)) * trackW;
    context.textAlign = index === 0 ? "left" : index === data.axis.length - 1 ? "right" : "center";
    context.fillText(label, x, trackY + trackH + 24);
  });
  context.textAlign = "left";

  // ── Paradas. A partir de aquí la hoja fluye con un cursor: sin paradas no
  // debe quedar un hueco muerto, y con seis no se debe salir del pie.
  let cursor = 536;
  micro(context, data.labels.stops, 64, cursor, INK_3);
  const columns = [
    { key: data.labels.stopLap, x: 64 },
    { key: data.labels.stopIn, x: 260 },
    { key: data.labels.stopOut, x: 440 },
    { key: data.labels.stopTime, x: 620 },
  ];
  if (data.stops.length === 0) {
    context.fillStyle = INK_4;
    context.font = `500 14px ${SANS}`;
    context.fillText(data.stopsEmpty, 64, cursor + 38);
    cursor += 74;
  } else {
    cursor += 30;
    columns.forEach((column) => micro(context, column.key, column.x, cursor, INK_4));
    line(context, 64, cursor + 12, W - 128);
    const visible = data.stops.slice(0, 6);
    visible.forEach((stop, index) => {
      const y = cursor + 40 + index * 30;
      context.fillStyle = INK;
      context.font = `600 14px ${MONO}`;
      context.fillText(String(stop.lap), columns[0].x, y);
      context.fillStyle = INK_2;
      context.fillText(`${stop.fuelInLiters.toFixed(1)} L`, columns[1].x, y);
      context.fillText(`${stop.fuelOutLiters.toFixed(1)} L`, columns[2].x, y);
      context.fillText(`${stop.pitLossSeconds.toFixed(1)} s`, columns[3].x, y);
      line(context, 64, y + 10, W - 128, "rgba(255,255,255,.04)");
    });
    cursor += 40 + visible.length * 30 + 18;
    if (data.stops.length > visible.length) {
      context.fillStyle = INK_4;
      context.font = `500 12px ${SANS}`;
      context.fillText(`+${data.stops.length - visible.length}`, 64, cursor);
      cursor += 22;
    }
  }

  // ── Entradas con procedencia. Se anclan al pie para que la hoja tenga
  // siempre el mismo remate, venga con paradas o sin ellas.
  const inputsY = Math.min(cursor + 30, 754);
  micro(context, data.labels.inputs, 64, inputsY, INK_3);
  const inputW = (W - 128) / Math.max(1, data.inputs.length);
  data.inputs.forEach((input, index) => {
    const x = 64 + index * inputW;
    micro(context, input.label, x, inputsY + 32, INK_4);
    context.fillStyle = input.missing ? INK_4 : INK;
    context.font = `600 20px ${MONO}`;
    context.fillText(input.value, x, inputsY + 62);
    context.fillStyle = input.missing ? "#ff9b57" : INK_4;
    context.font = `600 11px ${SANS}`;
    context.fillText(input.provenance, x, inputsY + 84);
  });

  // ── Pie
  line(context, 64, 862, W - 128);
  context.fillStyle = INK_4;
  context.font = `500 11.5px ${SANS}`;
  context.fillText(data.footer, 64, 884);
  context.textAlign = "right";
  context.fillStyle = CARMINE;
  context.font = `700 13px ${SANS}`;
  context.fillText("VANTARE", W - 64, 884);
  context.textAlign = "left";
  context.restore();
}

export const INFOGRAPHIC_WIDTH = W;
export const INFOGRAPHIC_HEIGHT = H;

/** Rasteriza la hoja a PNG. `scale` 2 deja el texto nítido en pantallas densas. */
export function infographicPngDataUrl(data: InfographicData, scale = 2): string {
  const canvas = document.createElement("canvas");
  canvas.width = W * scale;
  canvas.height = H * scale;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas 2d context unavailable");
  context.scale(scale, scale);
  drawStrategyInfographic(context, data);
  return canvas.toDataURL("image/png");
}

/**
 * PDF de una página con la hoja dentro. Se escribe a mano —un JPEG como
 * XObject con DCTDecode— para no arrastrar una librería de PDF a la aplicación
 * por un único documento de una página.
 */
export function infographicPdfDataUrl(data: InfographicData, scale = 2): string {
  const canvas = document.createElement("canvas");
  canvas.width = W * scale;
  canvas.height = H * scale;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas 2d context unavailable");
  context.scale(scale, scale);
  drawStrategyInfographic(context, data);
  const jpeg = canvas.toDataURL("image/jpeg", 0.94).split(",")[1] ?? "";
  const binary = atob(jpeg);

  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>`,
    `stream:${W} 0 0 ${H} 0 0 cm /Im0 Do`,
    `image:${binary.length}`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    const number = index + 1;
    if (body.startsWith("stream:")) {
      const content = body.slice("stream:".length);
      pdf += `${number} 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`;
      return;
    }
    if (body.startsWith("image:")) {
      pdf += `${number} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} `;
      pdf += `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${binary.length} >>\nstream\n`;
      pdf += `${binary}\nendstream\nendobj\n`;
      return;
    }
    pdf += `${number} 0 obj\n${body}\nendobj\n`;
  });

  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;

  const bytes = new Uint8Array(pdf.length);
  for (let index = 0; index < pdf.length; index += 1) bytes[index] = pdf.charCodeAt(index) & 0xff;
  let encoded = "";
  bytes.forEach((byte) => {
    encoded += String.fromCharCode(byte);
  });
  return `data:application/pdf;base64,${btoa(encoded)}`;
}

/** Entrega el fichero al usuario. El nombre lleva evento y fecha para archivar. */
export function downloadDataUrl(dataUrl: string, filename: string): void {
  const anchor = document.createElement("a");
  anchor.href = dataUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export function infographicFilename(title: string, extension: string, stamp: Date): string {
  const slug = title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "estrategia";
  const date = `${stamp.getFullYear()}${String(stamp.getMonth() + 1).padStart(2, "0")}${String(stamp.getDate()).padStart(2, "0")}`;
  return `vantare-${slug}-${date}.${extension}`;
}
