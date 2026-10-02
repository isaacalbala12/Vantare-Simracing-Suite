import { memo } from "react";
import { GenericSteeringWheel } from "./GenericSteeringWheel";
import type { LmuSteeringWheelId, SteeringWheelId } from "./catalog";

// Own, simplified silhouettes. Shared contours describe wheel construction,
// not a claim that different cars use an identical physical wheel.
const CONTOURS = {
  prototype: "M21 12H43L48 16L53 14Q58 15 59 24V41Q58 49 53 51L46 44L41 47H23L18 44L11 51Q6 49 5 41V24Q6 15 11 14L16 16ZM11 24V36L16 32V23ZM53 24L48 23V32L53 36Z",
  wide: "M20 16H44L49 20L55 17Q60 20 60 28L58 43L53 49L46 43H18L11 49L6 43L4 28Q4 20 9 17L15 20ZM10 26L11 35L16 31V25ZM54 26L48 25V31L53 35Z",
  stepped: "M21 11H43L45 17H51L54 14L58 18L60 31L58 45L53 50L47 43L43 46H21L17 43L11 50L6 45L4 31L6 18L10 14L13 17H19ZM11 23L10 33L17 29V23ZM53 23H47V29L54 33Z",
  ferrari: "M22 13H42L47 17L53 15Q58 18 59 28L58 43L53 49L48 43L41 47L32 51L23 47L16 43L11 49L6 43L5 28Q6 18 11 15L17 17ZM12 25L11 33L17 31V24ZM52 25L47 24V31L53 33Z",
  square: "M20 14H44L47 19H54Q59 19 59 26V43Q59 49 53 49H47L43 45H21L17 49H11Q5 49 5 43V26Q5 19 10 19H17ZM11 27V37H16V27ZM53 27H48V37H53Z",
  cutaway: "M22 15H42L46 22L51 13Q58 15 60 26L58 43L53 50L47 44L43 47H21L17 44L11 50L6 43L4 26Q6 15 13 13L18 22ZM11 26L10 36L16 32V26ZM53 26H48V32L54 36Z",
  butterfly: "M20 20L27 23H37L44 20L48 12L54 15Q59 21 59 31L56 44L51 49L44 41L39 44H25L20 41L13 49L8 44L5 31Q5 21 10 15L16 12ZM12 25L12 34L17 31V25ZM52 25H47V31L52 34Z",
  open: "M22 20L28 25H36L42 20L48 13L54 15L59 25L58 40L53 48L47 42L41 45H23L17 42L11 48L6 40L5 25L10 15L16 13ZM12 24V34L17 30V24ZM52 24H47V30L52 34Z",
  round: "M32 7Q58 7 60 31Q60 45 50 53H14Q4 45 4 31Q6 7 32 7ZM32 13Q15 13 11 28L20 25H44L53 28Q49 13 32 13ZM11 36Q13 44 18 47H26L22 39ZM53 36L42 39L38 47H46Q51 44 53 36Z",
  dshape: "M32 9Q56 9 59 29Q60 41 51 51H13Q4 41 5 29Q8 9 32 9ZM32 15Q18 15 12 27L20 24H44L52 27Q46 15 32 15ZM12 36Q14 42 18 45H25L22 39ZM52 36L42 39L39 45H46Q50 42 52 36Z",
  oreca: "M23 12H41L45 17H51L56 14L59 25L57 41L52 49L47 44L39 47L32 53L25 47L17 44L12 49L7 41L5 25L8 14L13 17H19ZM12 23L11 33L17 30V23ZM52 23H47V30L53 33Z",
  lmp3: "M22 15L26 18H38L42 15L49 18L53 16Q58 18 59 28L57 43L52 49L45 44H19L12 49L7 43L5 28Q6 18 11 16L15 18ZM12 25V35L17 32V25ZM52 25H47V32L52 35Z",
} as const;

const COLORS = { white: "#d8d8d9", red: "#d95360", green: "#79b584", blue: "#719dcc", yellow: "#d6b969", purple: "#b584bf", cyan: "#75bfc0", orange: "#cf986e" } as const;
type Color = keyof typeof COLORS;
type Control = readonly [x: number, y: number, color: Color];
type Drawing = {
  contour: keyof typeof CONTOURS;
  screen?: readonly [x: number, y: number, width: number, height: number];
  buttons: readonly Control[];
  dials: readonly Control[];
  stripe?: Color;
};

const HC_BUTTONS: readonly Control[] = [[19, 21, "white"], [18, 28, "blue"], [19, 35, "yellow"], [45, 21, "red"], [46, 28, "green"], [45, 35, "cyan"]];
const GT_BUTTONS: readonly Control[] = [[20, 27, "blue"], [19, 33, "yellow"], [23, 38, "green"], [44, 27, "red"], [45, 33, "cyan"], [41, 38, "white"]];

/** Seasonal aero/engine evolutions share art unless a separate wheel is documented. */
const DRAWINGS: Record<LmuSteeringWheelId, Drawing> = {
  "alpine-a424": { contour: "prototype", screen: [23, 17, 18, 14], buttons: HC_BUTTONS, dials: [[25, 39, "blue"], [39, 39, "red"], [32, 43, "white"]] },
  "aston-martin-valkyrie": { contour: "cutaway", screen: [23, 19, 18, 12], buttons: [[20, 23, "green"], [19, 31, "yellow"], [22, 36, "blue"], [44, 23, "red"], [45, 31, "white"], [42, 36, "purple"]], dials: [[26, 42, "green"], [38, 42, "yellow"]] },
  "bmw-m-hybrid-v8-pre-le-mans": { contour: "prototype", screen: [24, 17, 16, 15], buttons: HC_BUTTONS, dials: [[24, 38, "green"], [40, 38, "red"], [28, 45, "blue"], [36, 45, "green"]] },
  "bmw-m-hybrid-v8": { contour: "stepped", screen: [23, 15, 18, 15], buttons: [[17, 21, "blue"], [20, 26, "white"], [19, 33, "yellow"], [47, 21, "red"], [44, 26, "blue"], [45, 33, "green"]], dials: [[25, 37, "yellow"], [39, 37, "red"], [32, 43, "blue"]] },
  "cadillac-v-series-r": { contour: "wide", screen: [23, 20, 18, 12], buttons: [[18, 23, "blue"], [20, 30, "white"], [19, 37, "green"], [46, 23, "red"], [44, 30, "yellow"], [45, 37, "purple"]], dials: [[27, 39, "blue"], [37, 39, "red"]] },
  "ferrari-499p": { contour: "ferrari", screen: [24, 17, 16, 15], buttons: [[19, 20, "blue"], [19, 27, "yellow"], [19, 35, "white"], [45, 20, "red"], [45, 27, "green"], [45, 35, "purple"]], dials: [[25, 41, "green"], [32, 39, "white"], [39, 41, "red"]] },
  "genesis-gmr-001": { contour: "square", screen: [23, 18, 18, 13], buttons: [[18, 25, "cyan"], [20, 33, "blue"], [20, 40, "white"], [46, 25, "red"], [44, 33, "yellow"], [44, 40, "green"]], dials: [[27, 39, "orange"], [37, 39, "white"]] },
  "glickenhaus-scg007": { contour: "lmp3", screen: [23, 20, 18, 12], buttons: [[19, 23, "white"], [19, 30, "blue"], [20, 37, "yellow"], [45, 23, "red"], [45, 30, "green"], [44, 37, "white"]], dials: [[27, 40, "red"], [37, 40, "blue"]] },
  "isotta-fraschini-tipo6": { contour: "cutaway", screen: [23, 19, 18, 12], buttons: HC_BUTTONS, dials: [[25, 40, "green"], [32, 43, "white"], [39, 40, "red"]] },
  "lamborghini-sc63": { contour: "stepped", screen: [24, 17, 16, 13], buttons: [[18, 21, "green"], [19, 28, "yellow"], [19, 35, "blue"], [46, 21, "red"], [45, 28, "white"], [45, 35, "green"]], dials: [[26, 39, "green"], [38, 39, "yellow"], [32, 44, "purple"]] },
  "peugeot-9x8": { contour: "wide", screen: [24, 20, 16, 11], buttons: [[17, 25, "green"], [20, 31, "yellow"], [47, 25, "red"], [44, 31, "blue"]], dials: [[22, 38, "green"], [29, 38, "white"], [36, 38, "yellow"], [43, 38, "green"]] },
  "peugeot-9x8-2024": { contour: "wide", screen: [23, 19, 18, 12], buttons: [[17, 24, "green"], [20, 31, "yellow"], [47, 24, "red"], [44, 31, "blue"]], dials: [[22, 38, "green"], [29, 38, "white"], [36, 38, "yellow"], [43, 38, "green"]] },
  "porsche-963": { contour: "square", screen: [23, 18, 18, 13], buttons: [[18, 24, "blue"], [19, 31, "green"], [19, 39, "yellow"], [46, 24, "red"], [45, 31, "purple"], [45, 39, "white"]], dials: [[27, 39, "blue"], [37, 39, "yellow"]] },
  "toyota-gr010": { contour: "prototype", screen: [23, 17, 18, 14], buttons: [[18, 21, "yellow"], [19, 28, "blue"], [19, 35, "green"], [46, 21, "red"], [45, 28, "cyan"], [45, 35, "white"]], dials: [[25, 40, "blue"], [32, 38, "yellow"], [39, 40, "red"]] },
  "toyota-tr010": { contour: "prototype", screen: [23, 17, 18, 14], buttons: [[18, 21, "yellow"], [19, 28, "blue"], [19, 35, "green"], [46, 21, "red"], [45, 28, "cyan"], [45, 35, "white"]], dials: [[25, 40, "blue"], [32, 38, "yellow"], [39, 40, "red"]] },
  "vanwall-vandervell-680": { contour: "oreca", screen: [23, 18, 18, 12], buttons: HC_BUTTONS, dials: [[26, 38, "green"], [38, 38, "red"], [32, 46, "yellow"]] },
  "aston-martin-vantage-gt3": { contour: "open", buttons: GT_BUTTONS, dials: [[27, 33, "green"], [37, 33, "yellow"]] },
  "bmw-m4-gt3": { contour: "butterfly", buttons: [[20, 25, "blue"], [18, 31, "yellow"], [23, 34, "white"], [44, 25, "red"], [46, 31, "green"], [41, 34, "purple"]], dials: [[25, 40, "blue"], [32, 38, "white"], [39, 40, "red"]] },
  "corvette-z06-gt3": { contour: "cutaway", buttons: [[20, 23, "yellow"], [21, 30, "blue"], [20, 38, "green"], [44, 23, "red"], [43, 30, "white"], [44, 38, "purple"]], dials: [[27, 40, "yellow"], [37, 40, "red"]] },
  "ferrari-296-gt3": { contour: "ferrari", buttons: [[20, 21, "blue"], [20, 28, "yellow"], [20, 35, "white"], [44, 21, "red"], [44, 28, "green"], [44, 35, "purple"]], dials: [[26, 39, "green"], [38, 39, "red"], [32, 46, "yellow"]] },
  "ford-mustang-gt3": { contour: "square", buttons: [[19, 25, "blue"], [20, 32, "yellow"], [20, 39, "green"], [45, 25, "red"], [44, 32, "purple"], [44, 39, "white"]], dials: [[27, 38, "blue"], [37, 38, "red"]] },
  "lamborghini-huracan-gt3": { contour: "dshape", buttons: GT_BUTTONS, dials: [[27, 35, "green"], [37, 35, "yellow"]], stripe: "green" },
  "lexus-rc-f-gt3": { contour: "round", buttons: [[21, 28, "blue"], [19, 34, "yellow"], [25, 39, "green"], [43, 28, "red"], [45, 34, "white"], [39, 39, "purple"]], dials: [[28, 33, "blue"], [36, 33, "red"]], stripe: "white" },
  "mclaren-720s-gt3": { contour: "open", buttons: [[20, 26, "orange"], [19, 33, "blue"], [25, 38, "white"], [44, 26, "red"], [45, 33, "green"], [39, 38, "purple"]], dials: [[27, 32, "orange"], [37, 32, "blue"]] },
  "mercedes-amg-gt3": { contour: "round", buttons: GT_BUTTONS, dials: [[27, 34, "yellow"], [37, 34, "blue"]], stripe: "yellow" },
  "porsche-911-gt3-r": { contour: "dshape", buttons: [[21, 27, "blue"], [20, 33, "green"], [24, 39, "yellow"], [43, 27, "red"], [44, 33, "white"], [40, 39, "purple"]], dials: [[28, 34, "blue"], [36, 34, "yellow"]], stripe: "yellow" },
  "oreca-07": { contour: "oreca", screen: [23, 17, 18, 14], buttons: HC_BUTTONS, dials: [[25, 39, "blue"], [39, 39, "red"], [32, 47, "green"]] },
  "adess-ad25": { contour: "lmp3", screen: [23, 21, 18, 11], buttons: [[19, 24, "blue"], [19, 31, "yellow"], [21, 38, "green"], [45, 24, "red"], [45, 31, "cyan"], [43, 38, "white"]], dials: [[27, 40, "blue"], [37, 40, "red"]] },
  "duqueine-d09": { contour: "prototype", screen: [24, 17, 16, 14], buttons: HC_BUTTONS, dials: [[25, 39, "yellow"], [39, 39, "blue"], [32, 44, "red"]] },
  "ginetta-g61-lt-p3-evo": { contour: "cutaway", screen: [23, 19, 18, 12], buttons: [[19, 23, "white"], [20, 30, "blue"], [19, 38, "green"], [45, 23, "red"], [44, 30, "yellow"], [45, 38, "cyan"]], dials: [[27, 40, "orange"], [37, 40, "blue"]] },
  "ligier-js-p325": { contour: "lmp3", screen: [23, 20, 18, 13], buttons: [[19, 25, "blue"], [19, 32, "white"], [20, 39, "yellow"], [45, 25, "cyan"], [45, 32, "red"], [44, 39, "green"]], dials: [[27, 40, "purple"], [37, 40, "yellow"]] },
};

// Steering updates only rotate the parent <g>; this static artwork does not
// reconcile dozens of controls on each telemetry tick.
export const SteeringWheelArtwork = memo(function SteeringWheelArtwork({ wheel }: { wheel: SteeringWheelId }) {
  if (wheel === "generic") return <GenericSteeringWheel />;
  const { contour, screen, buttons, dials, stripe } = DRAWINGS[wheel];
  return <g strokeLinejoin="round">
    <path d={CONTOURS[contour]} fill="currentColor" fillOpacity=".13" fillRule="evenodd" stroke="currentColor" strokeOpacity=".8" strokeWidth="1.2" />
    <path d="M9 25Q7 34 12 43M55 25Q57 34 52 43" fill="none" stroke="currentColor" strokeOpacity=".28" strokeWidth="3" strokeLinecap="round" />
    {stripe && <path d="M31 10H33" stroke={COLORS[stripe]} strokeWidth="4" />}
    {screen ? <>
      <rect x={screen[0]} y={screen[1]} width={screen[2]} height={screen[3]} rx="1" fill="var(--vf-pedals-adv-slot)" stroke="var(--vf-pedals-adv-muted)" strokeWidth=".9" />
      <path d={`M${screen[0] + 2} ${screen[1] - 2}h${screen[2] - 4}`} stroke="currentColor" strokeOpacity=".5" strokeWidth="1.3" strokeDasharray="1 2" strokeLinecap="round" />
    </> : <path d="M29 28H35M30 30H34" stroke="currentColor" strokeOpacity=".4" strokeWidth=".8" />}
    {buttons.map(([x, y, color]) => <circle key={`${x}:${y}`} cx={x} cy={y} r="1.8" fill="var(--vf-pedals-adv-slot)" stroke={COLORS[color]} strokeWidth="1.1" />)}
    {dials.map(([x, y, color]) => <g key={`${x}:${y}`}>
      <circle cx={x} cy={y} r="2.8" fill={COLORS[color]} fillOpacity=".85" />
      <path d={`M${x} ${y - 2.1}v2.6`} stroke="var(--vf-pedals-adv-slot)" strokeWidth="1.2" strokeLinecap="round" />
    </g>)}
  </g>;
});
