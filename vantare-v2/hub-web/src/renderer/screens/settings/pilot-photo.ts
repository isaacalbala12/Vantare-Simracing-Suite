import { pilotLimits } from "../../../contract/generated/contract";
export async function cropPilotPhoto(file: File): Promise<string> {
  if (!["image/jpeg", "image/png"].includes(file.type))
    throw new Error("image type");
  const image = await createImageBitmap(file);
  try {
    if (!image.width || !image.height) throw new Error("image size");
    const canvas = document.createElement("canvas");
    canvas.width = pilotLimits.photoSide;
    canvas.height = pilotLimits.photoSide;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("canvas unavailable");
    const side = Math.min(image.width, image.height);
    context.drawImage(
      image,
      (image.width - side) / 2,
      (image.height - side) / 2,
      side,
      side,
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
  } finally {
    image.close();
  }
}
