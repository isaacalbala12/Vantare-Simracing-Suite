import tracks from "../../assets/tracks/tracks.json";
export function Circuit({ track }: { track: string | null | undefined }) {
  const aliases: [[string, string], ...[string, string][]] = [
    ["le mans", "lemans_h"],
    ["sarthe", "lemans_h"],
    ["lemans", "lemans_h"],
    ["spa", "spa_h"],
    ["monza", "monza_h"],
    ["bahr", "bahrain"],
    ["imola", "imola"],
    ["portim", "portimao"],
    ["interlagos", "interlagos"],
    ["cota", "cota"],
    ["americas", "cota"],
    ["losail", "losail"],
    ["lusail", "losail"],
    ["qatar", "losail"],
    ["silverstone", "silverstone"],
    ["paul ricard", "paulricard"],
    ["barcelona", "barcelona"],
    ["catalunya", "barcelona"],
  ];
  const key = track
    ? aliases.find(([alias]) => track.toLowerCase().includes(alias))?.[1]
    : "lemans_h";
  const resource = key ? (tracks as Record<string, string[]>)[key] : undefined;
  return resource ? (
    <svg className="v-home-circuit" viewBox={resource[0]} aria-hidden="true">
      <path
        d={resource[1]}
        fill="none"
        stroke="var(--accent-tint)"
        strokeWidth="10"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d={resource[1]}
        fill="none"
        stroke="var(--hero-ring)"
        strokeWidth="2.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  ) : null;
}
