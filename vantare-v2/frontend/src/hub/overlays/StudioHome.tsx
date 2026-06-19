import { StudioSectionCard } from "./StudioSectionCard";

type StudioHomeProps = {
  profileCount: number;
  recommendedCount: number;
  onOpenWidgetStudio: () => void;
  onOpenOwnProfiles: () => void;
  onOpenRecommended: () => void;
  onOpenCommunity: () => void;
};

export function StudioHome({
  profileCount,
  recommendedCount,
  onOpenWidgetStudio,
  onOpenOwnProfiles,
  onOpenRecommended,
  onOpenCommunity,
}: StudioHomeProps) {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-[1800px] flex-col px-6 py-8">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold text-white">Overlays Studio</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-vantare-textMuted">
          Elige qué quieres editar. Widgets controla apariencia y comportamiento; Mis perfiles controla layouts y colocación.
        </p>
      </div>

      <div className="grid flex-1 gap-5 lg:grid-cols-2">
        <StudioSectionCard
          title="Widgets"
          description="Edita apariencia, comportamiento, visibilidad y estilo de los widgets disponibles."
          meta="Editor de widgets"
          action="Configurar widgets"
          onClick={onOpenWidgetStudio}
        />
        <StudioSectionCard
          title="Mis perfiles"
          description="Gestiona tus perfiles propios y entra en el editor de colocación con preview real de cada layout."
          meta={`${profileCount} perfiles propios`}
          action="Ver mis perfiles"
          onClick={onOpenOwnProfiles}
        />
        <StudioSectionCard
          title="Recomendados por Vantare"
          description="Explora presets oficiales, previsualízalos y guárdalos como perfil propio para editarlos."
          meta={`${recommendedCount} presets oficiales`}
          action="Explorar recomendados"
          onClick={onOpenRecommended}
        />
        <StudioSectionCard
          title="Comunidad"
          description="Más adelante podrás descubrir overlays compartidos por la comunidad."
          meta="Próximamente"
          action="Ver estado"
          onClick={onOpenCommunity}
        />
      </div>
    </div>
  );
}
