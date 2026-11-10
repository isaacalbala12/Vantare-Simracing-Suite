import { useQuery } from "@tanstack/react-query";
import { coreKey, offline } from "../../app/Host";
import { lock } from "../../app/navigation";
import { useUi } from "../../app/UiState";
import { UpcomingLayout } from "../../ui/UpcomingLayout";
export function Upcoming({ module }: { module: "strategy" | "engineer" }) {
  const navigate = useUi((state) => state.navigate);
  const { data: core = offline } = useQuery({
    queryKey: coreKey,
    queryFn: async () => offline,
    enabled: false,
  });
  return (
    <UpcomingLayout
      module={module}
      onRoadmap={() => {
        if (!lock("roadmap", core.access)) navigate("roadmap");
      }}
    />
  );
}
