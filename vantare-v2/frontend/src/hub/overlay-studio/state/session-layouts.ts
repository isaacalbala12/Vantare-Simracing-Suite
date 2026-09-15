import type {
  ProfileDocumentV3,
  SessionLayoutType,
  SessionLayoutV3,
} from "../../../overlay/core/profile-document";

function cloneLayout(layout: SessionLayoutV3, type: SessionLayoutType): SessionLayoutV3 {
  const cloned = structuredClone(layout);
  cloned.type = type;
  return cloned;
}

export function resolveSessionLayout(
  document: ProfileDocumentV3,
  type: SessionLayoutType,
): SessionLayoutV3 {
  const existing = document.layouts[type];
  if (existing) {
    return structuredClone(existing);
  }
  return cloneLayout(document.layouts.general, type);
}

export function materializeSessionLayout(
  document: ProfileDocumentV3,
  type: SessionLayoutType,
): ProfileDocumentV3 {
  const next = structuredClone(document);
  if (!next.layouts[type]) {
    next.layouts[type] = resolveSessionLayout(document, type);
  }
  return next;
}

export function copySessionLayout(
  document: ProfileDocumentV3,
  source: SessionLayoutType,
  target: SessionLayoutType,
): ProfileDocumentV3 {
  // resolveSessionLayout ya devuelve un clon propio: reasignar su tipo evita
  // clonar el layout origen dos veces.
  const sourceLayout = resolveSessionLayout(document, source);
  const next = structuredClone(document);
  sourceLayout.type = target;
  next.layouts[target] = sourceLayout;
  return next;
}
