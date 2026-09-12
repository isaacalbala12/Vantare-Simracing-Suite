import { Button } from "../../ui/orbit/Button";
import "../../styles/orbit.tokens.css";
import "../../styles/orbit-kit.css";

type RecommendedSuccessBannerProps = {
  profileId: string;
  onGoToDashboard: () => void;
};

export function RecommendedSuccessBanner({ profileId, onGoToDashboard }: RecommendedSuccessBannerProps) {
  return (
    <div
      data-testid="recommended-success-banner"
      className="orbit-alert orbit-alert--ok"
    >
      <div>
        <p className="font-mono text-[10px] uppercase tracking-wider text-orbit-green">
          Recomendado activado y abierto
        </p>
        <p className="mt-1 text-xs text-orbit-ink-2">
          Perfil activo: <span className="font-mono">{profileId}</span>
        </p>
      </div>
      <Button
        variant="primary"
        size="sm"
        data-testid="recommended-success-go-hub"
        onClick={onGoToDashboard}
      >
        Ir al Hub
      </Button>
    </div>
  );
}
