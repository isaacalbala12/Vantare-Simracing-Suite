#!/usr/bin/env node
/**
 * generate-roadmap-progress.mjs
 *
 * 1. Parsea current-plan.md buscando "Estado: 🟢 ACTIVO" o "🔮 FUTURO" + "Plan: <path>"
 * 2. Extrae "Tipo: feature|bugfix|improve|research|component"
 * 3. Para cada plan, cuenta checks - [x] / - [ ] en el archivo .md
 * 4. Genera roadmap-progress.json
 *
 * Uso: node scripts/generate-roadmap-progress.mjs
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, basename, resolve } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const CURRENT_PLAN = join(ROOT, "docs", "current-plan.md");
const OUTPUT = join(
  ROOT,
  "frontend",
  "src",
  "hub",
  "roadmap",
  "roadmap-progress.json",
);

// ── Parse current-plan.md ──────────────────────────────────────────

const planContent = readFileSync(CURRENT_PLAN, "utf-8");

const notaBlockRegex =
  /Nota\s+(\S+)\s+\((\d{4}-\d{2}-\d{2})\):\s*\n([\s\S]*?)(?=\nNota\s|\n# |\n## |\Z)/g;

const plans = [];

let match;
while ((match = notaBlockRegex.exec(planContent)) !== null) {
  const [, name, date, body] = match;

  // Check estado
  const isActivo = body.includes("Estado: 🟢 ACTIVO");
  const isFuturo = body.includes("Estado: 🔮 FUTURO");
  if (!isActivo && !isFuturo) continue;

  // Extract plan path
  const planMatch = body.match(/Plan(?:\s+detallado)?:\s*(.+)/);
  if (!planMatch) continue;

  const planPath = planMatch[1].trim().replace(/^`|`$/g, "");
  const fullPlanPath = resolve(ROOT, planPath);

  if (!existsSync(fullPlanPath)) {
    console.warn(`⚠ Plan no encontrado: ${planPath} (Nota: ${name})`);
    continue;
  }

  // Extract tipo
  const tipoMatch = body.match(/Tipo:\s*(\w+)/);
  const tipo = tipoMatch ? tipoMatch[1].trim() : "feature";

  // Extract objective for description
  const objMatch = body.match(/Objetivo:\s*(.+)/);
  const description = objMatch ? objMatch[1].trim() : "";

  plans.push({
    name,
    date,
    planPath: fullPlanPath,
    slug: basename(planPath, ".md").replace(/^\d{4}-\d{2}-\d{2}-/, ""),
    label: name.replace(/-/g, " "),
    description,
    tipo,
    future: isFuturo,
  });
}

// ── Count checks in each plan ──────────────────────────────────────

const progress = {};

for (const plan of plans) {
  const content = readFileSync(plan.planPath, "utf-8");

  const done = (content.match(/^- \[[xX]\]/gm) || []).length;
  const pending = (content.match(/^- \[ \]/gm) || []).length;
  const total = done + pending;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;

  progress[plan.slug] = {
    label: plan.label,
    description: plan.description,
    tipo: plan.tipo,
    future: plan.future,
    done,
    total,
    percent,
  };
}

// ── Write output ───────────────────────────────────────────────────

writeFileSync(OUTPUT, JSON.stringify(progress, null, 2) + "\n");

const active = Object.values(progress).filter((p) => !p.future).length;
const future = Object.values(progress).filter((p) => p.future).length;
console.log(
  `✓ roadmap-progress.json: ${active} active + ${future} future plans → ${OUTPUT}`,
);
