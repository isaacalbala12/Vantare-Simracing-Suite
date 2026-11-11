import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { t } from "../i18n/es";
import { useToastManager } from "../ui/Layers";
import { useHost } from "./Host";

const key = ["diagnostics"] as const;
export function useDiagnostics({
  notifyCopied = true,
  notifyErrors = true,
} = {}) {
  const { client } = useHost();
  const cache = useQueryClient();
  const toast = useToastManager();
  const query = useQuery({
    queryKey: key,
    enabled: !!client,
    retry: false,
    queryFn: async () => {
      const reply = await client?.request({ method: "diagnostics.get" });
      if (reply?.method !== "diagnostics.get")
        throw new Error("diagnostics unavailable");
      return reply.value;
    },
  });
  const prepare = useMutation({
    mutationFn: async () => {
      const reply = await client?.request({ method: "diagnostics.prepare" });
      if (reply?.method !== "diagnostics.prepare")
        throw new Error("report unavailable");
      return reply.value;
    },
    onSuccess: (value) => cache.setQueryData(key, value),
    onError: () => {
      if (notifyErrors)
        toast.add({ title: t("diagnostics.failed"), type: "err" });
    },
  });
  const copy = useMutation({
    mutationFn: async () => {
      const reply = await client?.request({ method: "diagnostics.copy" });
      if (reply?.method !== "diagnostics.copy")
        throw new Error("copy unavailable");
    },
    onSuccess: () => {
      if (notifyCopied) toast.add({ title: t("diagnostics.copied") });
    },
    onError: () => {
      if (notifyErrors)
        toast.add({ title: t("diagnostics.failed"), type: "err" });
    },
  });
  return { query, prepare, copy };
}
