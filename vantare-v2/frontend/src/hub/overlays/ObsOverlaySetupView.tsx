import { ObsSetup } from '../components/ObsSetup';

type ObsOverlaySetupViewProps = {
  url: string;
  onBack: () => void;
};

export function ObsOverlaySetupView({ url, onBack }: ObsOverlaySetupViewProps) {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-[1200px] flex-col px-6 py-8">
      <button
        type="button"
        className="mb-4 w-fit text-xs font-bold uppercase tracking-wider text-vantare-textMuted hover:text-white cursor-pointer"
        onClick={onBack}
      >
        ← Volver a Overlays Studio
      </button>

      <div className="card-sleek rounded-xl p-5 border border-white/5">
        <h2 className="font-display font-semibold text-lg text-white mb-4">
          OBS Browser Source
        </h2>
        <ObsSetup url={url} />
      </div>
    </div>
  );
}
