import { pilotLimits } from "../../../contract/generated/contract";
import { centeredCrop, clampCrop, type PhotoCrop } from "./photo-crop";
import { preflightPhoto } from "./photo-preflight";
export async function openPilotPhoto(file: File): Promise<ImageBitmap> {
  if (file.size <= 0 || file.size > pilotLimits.sourceBytes)
    throw new Error("photo size");
  const buffer = await file.arrayBuffer();
  const header = preflightPhoto(file.size, new Uint8Array(buffer));
  const image = await createImageBitmap(
    new Blob([buffer], { type: header.type }),
  );
  if (image.width !== header.width || image.height !== header.height) {
    image.close();
    throw new Error("image dimensions changed");
  }
  return image;
}
export function encodePilotPhoto(
  image: ImageBitmap,
  crop: PhotoCrop = centeredCrop(image.width, image.height),
): string {
  const selected = clampCrop(crop, image.width, image.height);
  const canvas = document.createElement("canvas");
  canvas.width = pilotLimits.photoSide;
  canvas.height = pilotLimits.photoSide;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas unavailable");
  context.fillStyle = "white";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingQuality = "high";
  const side = Math.min(image.width, image.height);
  context.drawImage(
    image,
    selected.x * image.width,
    selected.y * image.height,
    selected.side * side,
    selected.side * side,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  for (const quality of [0.85, 0.7, 0.5, 0.3]) {
    const encoded = canvas.toDataURL("image/jpeg", quality).split(",")[1];
    if (encoded && encoded.length <= (pilotLimits.photoBytes * 4) / 3)
      return encoded;
  }
  throw new Error("photo too large");
}
export async function cropPilotPhoto(file: File): Promise<string> {
  const image = await openPilotPhoto(file);
  try {
    return encodePilotPhoto(image);
  } finally {
    image.close();
  }
}
