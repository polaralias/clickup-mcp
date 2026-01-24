export function truncateList(items, limit) {
    if (items.length <= limit) {
        return { items, truncated: false };
    }
    return { items: items.slice(0, limit), truncated: true };
}
export function truncateString(value, limit) {
    if (value.length <= limit) {
        return { value, truncated: false };
    }
    return { value: value.slice(0, limit), truncated: true };
}
