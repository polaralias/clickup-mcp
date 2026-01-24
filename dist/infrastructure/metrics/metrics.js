const metrics = new Map();
export function incrementCounter(name, labels = {}) {
    const existing = metrics.get(name) ?? [];
    const entry = existing.find((metric) => labelsMatch(metric.labels, labels));
    if (entry) {
        entry.value += 1;
        entry.updatedAt = new Date();
    }
    else {
        existing.push({ type: "counter", value: 1, labels, updatedAt: new Date() });
        metrics.set(name, existing);
    }
}
export function recordHistogram(name, value, labels = {}) {
    incrementCounter(`${name}_count`, labels);
    setGauge(`${name}_sum`, value, labels);
}
export function setGauge(name, value, labels = {}) {
    const existing = metrics.get(name) ?? [];
    const entry = existing.find((metric) => labelsMatch(metric.labels, labels));
    if (entry) {
        entry.value = value;
        entry.updatedAt = new Date();
    }
    else {
        existing.push({ type: "gauge", value, labels, updatedAt: new Date() });
        metrics.set(name, existing);
    }
}
export function getMetrics() {
    return Object.fromEntries(metrics);
}
function labelsMatch(left, right) {
    const leftKeys = Object.keys(left);
    if (leftKeys.length !== Object.keys(right).length) {
        return false;
    }
    for (const key of leftKeys) {
        if (left[key] !== right[key]) {
            return false;
        }
    }
    return true;
}
