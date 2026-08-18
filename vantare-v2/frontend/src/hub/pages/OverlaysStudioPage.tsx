import { StudioRoute } from "../overlay-studio/StudioRoute";

type OverlaysStudioPageProps = {
  pendingRecommendedAutoStart?: "recommended-auto" | null;
  onAutoStartHandled?: () => void;
  /** Destino de la navegación de la shell (`"profiles"` abre «Mis perfiles»). */
  target?: string;
};

export function OverlaysStudioPage({
  pendingRecommendedAutoStart = null,
  onAutoStartHandled,
  target,
}: OverlaysStudioPageProps) {
  return (
    <StudioRoute
      pendingRecommendedAutoStart={pendingRecommendedAutoStart}
      onAutoStartHandled={onAutoStartHandled}
      target={target}
    />
  );
}