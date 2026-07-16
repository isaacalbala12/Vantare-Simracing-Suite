import { listOfficialDesigns, type OfficialDesign } from '../widgets/widget-design-gallery';
import { BronzeCard } from './BronzeCard';

type DesignBronzeCardsProps = {
  widgetType: string;
  activeDesignId: string | null;
  onApplyDesign: (design: OfficialDesign) => void;
};

/**
 * Renders official designs as bronze cards matching the v10 HTML mockup structure.
 * Each card shows: Tag (design name), Eyebrow (widget type), Primary (design name),
 * Divider, Secondary (description), Meta (design id).
 */
export function DesignBronzeCards({
  widgetType,
  activeDesignId,
  onApplyDesign,
}: DesignBronzeCardsProps) {
  const designs = listOfficialDesigns(widgetType);

  if (designs.length === 0) return null;

  return (
    <div className="space-y-2">
      {designs.map((design) => {
        const isActive = design.id === activeDesignId;
        return (
          <BronzeCard
            key={design.id}
            active={isActive}
            data-testid={`design-card-${design.id}`}
            onClick={() => onApplyDesign(design)}
          >
            <BronzeCard.Tag>{design.name.split(' ').pop() ?? design.name}</BronzeCard.Tag>
            <BronzeCard.Eyebrow>{widgetType}</BronzeCard.Eyebrow>
            <BronzeCard.Primary>{design.name}</BronzeCard.Primary>
            <BronzeCard.Divider />
            <BronzeCard.Secondary>{design.description}</BronzeCard.Secondary>
            <BronzeCard.Meta>{design.id}.json</BronzeCard.Meta>
          </BronzeCard>
        );
      })}
    </div>
  );
}
