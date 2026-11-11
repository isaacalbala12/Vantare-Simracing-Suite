import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { Icon } from "../assets/icons/Icon";
import { calendarText as text } from "../i18n/calendar";

export function CalendarFilters({
  only,
  tier,
  total,
  following,
  onOnly,
  onTier,
}: {
  only: string;
  tier: string;
  total: number;
  following: number;
  onOnly: (value: string) => void;
  onTier: (value: string) => void;
}) {
  return (
    <>
      <ToggleGroup
        className="v-segmented"
        aria-label={text.favorites}
        value={[only]}
        onValueChange={(values) => {
          if (values[0]) onOnly(values[0]);
        }}
      >
        <Toggle className="v-segment" value="all">
          {text.all} {total}
        </Toggle>
        <Toggle
          className="v-segment v-calendar-favorites-filter"
          value="favorites"
        >
          <Icon name="star" />
          {text.favorites} {following}
        </Toggle>
      </ToggleGroup>
      <ToggleGroup
        className="v-segmented"
        aria-label={text.tiers.weekly}
        value={[tier]}
        onValueChange={(values) => {
          if (values[0]) onTier(values[0]);
        }}
      >
        <Toggle className="v-segment" value="all">
          {text.allTiers}
        </Toggle>
        {Object.entries(text.tiers).map(([value, label]) => (
          <Toggle
            className="v-segment v-calendar-tier-filter"
            value={value}
            key={value}
          >
            <i aria-hidden="true" data-tier={value} />
            {label}
          </Toggle>
        ))}
      </ToggleGroup>
    </>
  );
}
