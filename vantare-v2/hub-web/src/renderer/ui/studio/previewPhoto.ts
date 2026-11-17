import type { CoreStatus, Reply } from "../../../contract/generated/contract";
import { isReply } from "../../../contract/modules/preview";

export type PreviewPhoto = { src: string; width: number; height: number };

export function previewAuthority(
  core: CoreStatus | undefined,
  account: string | null,
) {
  return (
    !!account &&
    core?.accountGeneration === account &&
    !core.live &&
    core.rights === "connected" &&
    core.access.verified &&
    !core.access.blocked
  );
}

export async function decodePhoto(
  reply: Reply,
): Promise<PreviewPhoto | undefined> {
  if (reply.method !== "preview.render" || !isReply(reply)) return;
  const src = `data:image/png;base64,${reply.value.pngBase64}`;
  const image = new Image();
  image.src = src;
  try {
    await image.decode();
  } catch {
    return;
  }
  return { src, width: reply.value.width, height: reply.value.height };
}
