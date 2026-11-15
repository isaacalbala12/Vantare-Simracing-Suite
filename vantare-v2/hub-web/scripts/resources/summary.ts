export interface Sample {
  identity: string;
  pid: number;
  role: string;
  privateBytes: number;
  workingSetBytes: number;
  cpuOneCorePercent: number | null;
}
export function summarize(samples: Sample[], logicalProcessors: number) {
  if (!Number.isInteger(logicalProcessors) || logicalProcessors < 1)
    throw Error("Invalid logical processor count");
  const groups = new Map<string, Sample[]>();
  for (const sample of samples) {
    const rows = groups.get(sample.identity) ?? [];
    rows.push(sample);
    groups.set(sample.identity, rows);
  }
  return [...groups.values()].map((rows) => {
    const mean = (values: number[]) =>
      values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
    const cpu = rows.flatMap((r) =>
      r.cpuOneCorePercent === null ? [] : [r.cpuOneCorePercent],
    );
    return {
      pid: rows[0].pid,
      identity: rows[0].identity,
      role: rows[0].role,
      samples: rows.length,
      privateMiBMean: mean(rows.map((r) => r.privateBytes / 2 ** 20)),
      workingSetMiBMean: mean(rows.map((r) => r.workingSetBytes / 2 ** 20)),
      privateMiBMax: Math.max(...rows.map((r) => r.privateBytes / 2 ** 20)),
      workingSetMiBMax: Math.max(
        ...rows.map((r) => r.workingSetBytes / 2 ** 20),
      ),
      cpuOneCorePercentMean: mean(cpu),
      cpuMachinePercentMean: mean(cpu.map((v) => v / logicalProcessors)),
    };
  });
}
