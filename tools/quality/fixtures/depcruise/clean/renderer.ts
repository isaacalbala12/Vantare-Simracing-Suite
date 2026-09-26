// Fixture: legitimate renderer that imports from the same layer (NOT wails-mock).
// The forbidden path "../wails-mock" appears only in a comment and a string,
// which must NOT trigger the renderer-no-wails rule (false-positive protection).
import { renderFrame } from "./frame-view-model";

// This comment mentions ../wails-mock but is not an import.
const FORBIDDEN_DOC_STRING = "do not import ../wails-mock from a renderer";

export function render(): string {
  return renderFrame() + FORBIDDEN_DOC_STRING;
}
