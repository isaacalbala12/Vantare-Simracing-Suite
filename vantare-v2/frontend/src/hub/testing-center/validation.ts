import type { ReportDraftFields } from "./contracts";

const encoder = new TextEncoder();

export type ReportFieldErrors = Partial<Record<keyof ReportDraftFields, string>>;

function requiredBounded(value: string, maxBytes: number): "required" | "too_long" | null {
  const trimmed = value.trim();
  if (encoder.encode(trimmed).byteLength < 3) return "required";
  if (encoder.encode(trimmed).byteLength > maxBytes) return "too_long";
  return null;
}

export function validateReportFields(fields: ReportDraftFields): ReportFieldErrors {
  const errors: ReportFieldErrors = {};
  const required: Array<keyof Pick<ReportDraftFields, "actionText" | "expectedText" | "observedText">> = [
    "actionText", "expectedText", "observedText",
  ];
  for (const field of required) {
    const error = requiredBounded(fields[field], 2048);
    if (error) errors[field] = error;
  }
  if (encoder.encode(fields.contextText.trim()).byteLength > 4096) {
    errors.contextText = "too_long";
  }
  return errors;
}

export function hasReportFieldErrors(errors: ReportFieldErrors): boolean {
  return Object.keys(errors).length > 0;
}

export function normalizedReportFields(fields: ReportDraftFields): ReportDraftFields {
  return {
    ...fields,
    actionText: fields.actionText.trim(),
    expectedText: fields.expectedText.trim(),
    observedText: fields.observedText.trim(),
    contextText: fields.contextText.trim(),
  };
}
