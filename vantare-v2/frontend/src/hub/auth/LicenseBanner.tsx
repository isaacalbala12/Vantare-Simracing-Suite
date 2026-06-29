import { useLicense } from "../../lib/license";

type BannerMessage = {
  state: "grace" | "expired" | "device-limit";
  text: string;
};

function getMessage(
  state: BannerMessage["state"] | "active" | "anonymous" | "authenticated-no-entitlement" | "unconfigured",
  graceEndsAt?: string,
): BannerMessage | null {
  if (state === "grace") {
    return {
      state,
      text: graceEndsAt
        ? `Licencia en periodo de gracia hasta ${new Date(graceEndsAt).toLocaleString()}`
        : "Licencia en periodo de gracia",
    };
  }
  if (state === "expired") {
    return { state, text: "Licencia expirada. Renueva para continuar." };
  }
  if (state === "device-limit") {
    return {
      state,
      text: "Límite de dispositivo alcanzado. Restablece tu PC activo.",
    };
  }
  return null;
}

export function LicenseBanner() {
  const { result, loading } = useLicense();
  if (loading || !result) return null;
  if (result.state === "active") return null;
  if (result.state === "anonymous") return null;

  const msg = getMessage(result.state, result.graceEndsAt);
  if (!msg) return null;

  return (
    <div
      data-testid="license-banner"
      role="status"
      className="border-b border-vantare-red-500/20 bg-vantare-red-500/10 px-4 py-2 text-center"
    >
      <p className="font-mono text-[10px] uppercase text-vantare-red-400">
        {msg.text}
      </p>
    </div>
  );
}