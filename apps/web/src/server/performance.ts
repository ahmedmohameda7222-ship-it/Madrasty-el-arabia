import { AsyncLocalStorage } from "node:async_hooks";

type Span = "auth" | "db";
type Metric = { duration: number; calls: number };
const requestMetrics = new AsyncLocalStorage<Map<Span, Metric>>();

export function withRequestTiming<T>(work: (finish: () => string) => T): T {
  const started = performance.now();
  const metrics = new Map<Span, Metric>();
  return requestMetrics.run(metrics, () => work(() => {
    const values = [`app;dur=${(performance.now() - started).toFixed(1)}`];
    for (const [name, metric] of metrics) {
      values.push(`${name};dur=${metric.duration.toFixed(1)}`);
      values.push(`${name}_calls;desc="${metric.calls}"`);
    }
    return values.join(", ");
  }));
}

/** Aggregate durations only; no request payload, route parameters or credentials.
 * Auth can include DB time; concurrent DB spans may overlap wall-clock time. */
export async function measure<T>(name: Span, work: () => Promise<T>): Promise<T> {
  const metrics = requestMetrics.getStore();
  if (!metrics) return work();
  const started = performance.now();
  try {
    return await work();
  } finally {
    const metric = metrics.get(name) ?? { duration: 0, calls: 0 };
    metric.duration += performance.now() - started;
    metric.calls++;
    metrics.set(name, metric);
  }
}
