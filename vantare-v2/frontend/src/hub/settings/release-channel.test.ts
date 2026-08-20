import { describe, expect, it } from "vitest";

import { channelRelease, latestPerChannel, releaseChannelOf } from "./release-channel";
import type { Release } from "./settings-contract";

function release(tag: string, prerelease: boolean, name = ""): Release {
  return {
    tag_name: tag,
    name,
    body: "",
    prerelease,
    published_at: "2026-06-01T00:00:00Z",
    html_url: `https://example.com/${tag}`,
    assets: [],
  };
}

const nightly11 = release("v0.1.0.7-nightly.11", true);
const nightly9 = release("v0.1.0.7-nightly.9", true);
const testers1 = release("v0.1.0.7-testers.1", true);
const stable2 = release("v0.1.0.2", false);
const unmarked = release("v0.1.0.8-prealpha", true);

describe("releaseChannelOf", () => {
  it("clasifica una release no-prerelease como estable", () => {
    expect(releaseChannelOf(stable2)).toBe("stable");
  });

  it("separa nightly de testers por el marcador del tag", () => {
    expect(releaseChannelOf(nightly11)).toBe("nightly");
    expect(releaseChannelOf(testers1)).toBe("testers");
  });

  it("lee el marcador tambien del nombre de la release", () => {
    expect(releaseChannelOf(release("v0.1.0.9", true, "Nightly build"))).toBe("nightly");
  });

  it("deja sin canal una prerelease sin marcador conocido", () => {
    expect(releaseChannelOf(unmarked)).toBeNull();
  });
});

describe("latestPerChannel", () => {
  it("se queda con la primera release de cada canal y descarta las sin marcador", () => {
    const summary = latestPerChannel([nightly11, nightly9, testers1, stable2, unmarked]);
    expect(summary.nightly?.tag_name).toBe("v0.1.0.7-nightly.11");
    expect(summary.testers?.tag_name).toBe("v0.1.0.7-testers.1");
    expect(summary.stable?.tag_name).toBe("v0.1.0.2");
  });

  it("omite el canal que no tiene ninguna release", () => {
    const summary = latestPerChannel([stable2]);
    expect(summary.testers).toBeUndefined();
    expect(summary.nightly).toBeUndefined();
  });
});

describe("channelRelease", () => {
  it("usa el resumen del backend cuando llega", () => {
    const info = {
      channels: { stable: stable2, testers: testers1, nightly: nightly11 },
      releases: [stable2],
    };
    expect(channelRelease("testers", info)?.tag_name).toBe("v0.1.0.7-testers.1");
    expect(channelRelease("nightly", info)?.tag_name).toBe("v0.1.0.7-nightly.11");
  });

  it("cae al clasificador local si el backend es viejo y no manda channels", () => {
    const info = { releases: [nightly11, testers1, stable2] };
    expect(channelRelease("nightly", info)?.tag_name).toBe("v0.1.0.7-nightly.11");
    expect(channelRelease("testers", info)?.tag_name).toBe("v0.1.0.7-testers.1");
    expect(channelRelease("stable", info)?.tag_name).toBe("v0.1.0.2");
  });

  it("nunca cruza una nightly en la tarjeta de testers con la lista filtrada de Stable", () => {
    const info = { releases: [stable2] };
    expect(channelRelease("testers", info)).toBeNull();
    expect(channelRelease("nightly", info)).toBeNull();
  });

  it("devuelve null sin info", () => {
    expect(channelRelease("stable", null)).toBeNull();
  });
});
