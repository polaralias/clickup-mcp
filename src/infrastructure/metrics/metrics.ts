type MetricType = "counter" | "gauge" | "histogram"

interface Metric {
  type: MetricType
  value: number
  labels: Record<string, string>
  updatedAt: Date
}

const metrics = new Map<string, Metric[]>()

export function incrementCounter(name: string, labels: Record<string, string> = {}) {
  const existing = metrics.get(name) ?? []
  const entry = existing.find((metric) => labelsMatch(metric.labels, labels))

  if (entry) {
    entry.value += 1
    entry.updatedAt = new Date()
  } else {
    existing.push({ type: "counter", value: 1, labels, updatedAt: new Date() })
    metrics.set(name, existing)
  }
}

export function recordHistogram(
  name: string,
  value: number,
  labels: Record<string, string> = {}
) {
  incrementCounter(`${name}_count`, labels)
  setGauge(`${name}_sum`, value, labels)
}

export function setGauge(name: string, value: number, labels: Record<string, string> = {}) {
  const existing = metrics.get(name) ?? []
  const entry = existing.find((metric) => labelsMatch(metric.labels, labels))

  if (entry) {
    entry.value = value
    entry.updatedAt = new Date()
  } else {
    existing.push({ type: "gauge", value, labels, updatedAt: new Date() })
    metrics.set(name, existing)
  }
}

export function getMetrics(): Record<string, Metric[]> {
  return Object.fromEntries(metrics)
}

function labelsMatch(left: Record<string, string>, right: Record<string, string>) {
  const leftKeys = Object.keys(left)
  if (leftKeys.length !== Object.keys(right).length) {
    return false
  }

  for (const key of leftKeys) {
    if (left[key] !== right[key]) {
      return false
    }
  }

  return true
}
