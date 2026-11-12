import type { SVGProps } from "react";
export type IllustrationProps = Omit<
  SVGProps<SVGSVGElement>,
  "viewBox" | "children"
>;
