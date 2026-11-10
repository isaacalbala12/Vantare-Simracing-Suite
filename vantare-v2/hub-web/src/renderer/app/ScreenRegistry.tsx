import { type ComponentType, lazy, Suspense } from "react";
import { Skeleton } from "../ui/Data";
import { isSection, type Section } from "./sections";

const entries = import.meta.glob<{ default: ComponentType }>(
  "../screens/*/entry.tsx",
);
const screens = new Map(
  Object.entries(entries).flatMap(([path, load]) => {
    const id = path.split("/").at(-2) ?? "";
    return isSection(id) ? [[id, lazy(load)] as const] : [];
  }),
);
export function RegisteredScreen({
  section,
  loading,
  fallback,
}: {
  section: Section;
  loading: string;
  fallback: React.ReactNode;
}) {
  const Screen = screens.get(section);
  return Screen ? (
    <Suspense fallback={<Skeleton label={loading} />}>
      <Screen />
    </Suspense>
  ) : (
    fallback
  );
}
