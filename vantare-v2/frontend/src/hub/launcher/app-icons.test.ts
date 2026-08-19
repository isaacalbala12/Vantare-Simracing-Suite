import { describe, expect, it } from "vitest";
import {
  OFFICIAL_ICON_ASSETS,
  getOfficialIconAsset,
  resolveIconCandidates,
} from "./app-icons";

describe("launcher icon registry", () => {
  it("keeps all official IDs explicit without network URLs", () => {
    expect(Object.keys(OFFICIAL_ICON_ASSETS)).toEqual([
      "lmu",
      "obs",
      "crewchief",
      "discord",
      "spotify",
      "motec",
      "simhub",
    ]);
    for (const asset of Object.values(OFFICIAL_ICON_ASSETS)) {
      expect(asset ?? "").not.toMatch(/^https?:\/\//i);
    }
  });

  // El ejecutable que el catalogo detecta para MoTeC es el visor i2, asi que su
  // icono instalado es el logotipo de i2 y la losa mostraba otra marca. Es la
  // unica app con activo propio: las demas resuelven su logotipo correcto desde
  // la instalacion y redibujarlo solo lo empeoraria.
  it("da a MoTeC su logotipo de marca por delante del icono extraido", () => {
    const motec = getOfficialIconAsset("motec");
    expect(motec).toMatch(/^data:image\/svg\+xml,/);
    expect(decodeURIComponent(motec ?? "")).toContain("MoTeC");

    expect(
      resolveIconCandidates({ id: "motec", iconUrl: "data:image/png;base64,AA==" }),
    ).toEqual([motec, "data:image/png;base64,AA=="]);

    // La eleccion manual del usuario sigue mandando sobre el activo de marca.
    expect(
      resolveIconCandidates({ id: "motec", iconOverridePath: "C:/icons/mio.png" }),
    ).toEqual(["C:/icons/mio.png", motec]);
  });

  it("deja el resto de apps con el icono real de su instalacion", () => {
    for (const id of ["lmu", "obs", "crewchief", "discord", "spotify", "simhub"]) {
      expect(getOfficialIconAsset(id)).toBeUndefined();
    }
  });

  it("rejects remote icon overrides and preserves local candidates", () => {
    expect(getOfficialIconAsset("lmu")).toBeUndefined();
    expect(
      resolveIconCandidates({
        id: "manual",
        displayName: "Manual",
        abbreviation: "MA",
        category: "utility",
        launchMethod: "executable",
        detected: false,
        iconUrl: "https://example.invalid/icon.png",
        gradientFrom: "#111",
        gradientTo: "#222",
      }),
    ).toEqual([]);
    expect(
      resolveIconCandidates({
        id: "manual",
        displayName: "Manual",
        abbreviation: "MA",
        category: "utility",
        launchMethod: "executable",
        detected: false,
        iconUrl: "data:image/png;base64,AA==",
        gradientFrom: "#111",
        gradientTo: "#222",
      }),
    ).toEqual(["data:image/png;base64,AA=="]);
  });

  it("orders the candidate chain override -> official -> iconUrl and drops duplicates", () => {
    expect(
      resolveIconCandidates({
        id: "crewchief",
        iconOverridePath: "C:/icons/crewchief.png",
        iconUrl: "data:image/png;base64,AA==",
      }),
    ).toEqual(["C:/icons/crewchief.png", "data:image/png;base64,AA=="]);

    // El mismo icono por dos vias no se prueba dos veces.
    expect(
      resolveIconCandidates({
        id: "crewchief",
        iconOverridePath: "data:image/png;base64,AA==",
        iconUrl: "data:image/png;base64,AA==",
      }),
    ).toEqual(["data:image/png;base64,AA=="]);

    // Vacios y espacios no son candidatos: dejarian la losa en blanco.
    expect(resolveIconCandidates({ id: "crewchief", iconUrl: "   ", iconOverridePath: "" })).toEqual([]);
  });
});
