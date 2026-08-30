export function selectPageMemoryMetrics(metrics = []) {
  const values = Object.fromEntries(metrics.map(({name, value}) => [name, value]));
  return {
    jsHeapUsedBytes: values.JSHeapUsedSize ?? null,
    jsHeapTotalBytes: values.JSHeapTotalSize ?? null,
    documents: values.Documents ?? null,
    nodes: values.Nodes ?? null,
    jsEventListeners: values.JSEventListeners ?? null,
  };
}
