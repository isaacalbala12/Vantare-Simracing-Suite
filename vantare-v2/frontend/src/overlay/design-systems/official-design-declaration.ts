import type { MockDataState } from "../core/mock-scenarios";
import type { DesignSystemDefinition, WidgetSystemRegistration } from "../core/design-system-definition";
import type { WidgetType } from "../core/profile-document";
import { validateWidgetDesign, type WidgetDesignV1 } from "../core/widget-design";

export type OfficialWidgetDesignDeclaration = {
  design: WidgetDesignV1;
  registration: WidgetSystemRegistration;
  defaultSize: Readonly<{ width: number; height: number }>;
  scenarios: readonly MockDataState[];
};

export function defineOfficialWidgetDesign(
  declaration: Omit<OfficialWidgetDesignDeclaration, "design"> & { design: WidgetDesignV1 },
): OfficialWidgetDesignDeclaration {
  return {
    ...declaration,
    design: validateWidgetDesign(declaration.design),
  };
}

type DeclarationCheckInput = {
  declarations: readonly OfficialWidgetDesignDeclaration[];
  requiredIds: readonly string[];
  officialDesigns: readonly WidgetDesignV1[];
  resolveSystem(design: WidgetDesignV1): DesignSystemDefinition;
  resolveDefaultSize(widgetType: WidgetType): Readonly<{ width: number; height: number }>;
};

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function checkOfficialWidgetDesignDeclarations({
  declarations,
  requiredIds,
  officialDesigns,
  resolveSystem,
  resolveDefaultSize,
}: DeclarationCheckInput): { declarationCount: number; designIds: string[] } {
  const declarationsById = new Map<string, OfficialWidgetDesignDeclaration>();

  for (const declaration of declarations) {
    const { design } = declaration;
    if (declarationsById.has(design.id)) {
      throw new Error(`duplicate official design declaration: ${design.id}`);
    }
    declarationsById.set(design.id, declaration);

    const definition = resolveSystem(design);
    if (!definition.widgets.includes(declaration.registration)) {
      throw new Error(`unregistered widget-system declaration: ${design.id}`);
    }
    const registration = declaration.registration;
    if (registration.widgetType !== design.widgetType) {
      throw new Error(`widget type mismatch for official design declaration: ${design.id}`);
    }
    if (registration.configVersion !== design.configVersion) {
      throw new Error(`config version mismatch for official design declaration: ${design.id}`);
    }
    registration.parseSettings(design.visual);

    const registeredSize = resolveDefaultSize(design.widgetType);
    if (!sameValue(registeredSize, declaration.defaultSize)) {
      throw new Error(`default size mismatch for official design declaration: ${design.id}`);
    }
    if (declaration.scenarios.length === 0 || new Set(declaration.scenarios).size !== declaration.scenarios.length) {
      throw new Error(`invalid scenarios for official design declaration: ${design.id}`);
    }

    const catalogDesign = officialDesigns.find((candidate) => candidate.id === design.id);
    if (!catalogDesign || !sameValue(catalogDesign, design)) {
      throw new Error(`catalog mismatch for official design declaration: ${design.id}`);
    }
  }

  for (const requiredId of requiredIds) {
    if (!declarationsById.has(requiredId)) {
      throw new Error(`missing required official design declaration: ${requiredId}`);
    }
  }

  return {
    declarationCount: declarations.length,
    designIds: declarations.map((declaration) => declaration.design.id),
  };
}
