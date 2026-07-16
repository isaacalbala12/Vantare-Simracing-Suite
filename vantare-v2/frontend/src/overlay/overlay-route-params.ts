export type OverlayRouteParams = {
  profileName: string;
  studioPreview: boolean;
};

export function readOverlayRouteParams(search: string): OverlayRouteParams {
  const params = new URLSearchParams(search.startsWith("?") ? search : `?${search}`);
  return {
    profileName: params.get("profile") || "example-streaming.json",
    studioPreview: params.get("studioPreview") === "1",
  };
}