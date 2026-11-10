import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { RoadmapPublication } from "../../../contract/generated/contract";
import { useHost } from "../../app/Host";
import { SectionChrome, SectionPanel } from "../../app/SectionChrome";
import { roadmap as text } from "../../i18n/roadmap";
import { RoadmapLayout, RoadmapRail } from "../../ui/RoadmapLayout";
import { pollRoadmap } from "./poll";
export function Roadmap() {
  const { client, hello } = useHost();
  const cache = useQueryClient();
  const [publication, setPublication] = useState<RoadmapPublication | null>(
    () => cache.getQueryData<RoadmapPublication>(["roadmap"]) ?? null,
  );
  const [status, setStatus] = useState<string>(text.loading);
  useEffect(() => {
    if (!client) return;
    return pollRoadmap(client, (value, failed, loading) => {
      if (value?.publication) {
        setPublication(value.publication);
        cache.setQueryData(["roadmap"], value.publication);
      }
      setStatus(
        loading
          ? text.loading
          : failed
            ? text.failed
            : value?.stale
              ? text.cached
              : text.updated,
      );
    });
  }, [client, cache]);
  const capture =
    hello?.demo &&
    new URLSearchParams(location.search).get("escena") === "roadmap-base";
  const [view, setView] = useState(capture ? "circuit" : "board");
  return (
    <>
      <SectionChrome
        title={text.title}
        tabs={[
          { id: "circuit", etiqueta: text.circuit, visible: true },
          { id: "board", etiqueta: text.board, visible: true },
          { id: "season", etiqueta: text.season, visible: true },
        ]}
        activeTab={view}
        onTabChange={setView}
        rail={<RoadmapRail />}
      />
      <SectionPanel activeTab={view}>
        <RoadmapLayout publication={publication} status={status} view={view} />
      </SectionPanel>
    </>
  );
}
