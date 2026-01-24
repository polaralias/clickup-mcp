type AnnotationExtras = Record<string, string | boolean>

function baseAnnotation(cat: string, intent: string, extras: AnnotationExtras = {}) {
  const sdkHints: Record<string, boolean> = {}
  const internalMeta: Record<string, any> = {
    category: cat,
    intent: intent
  }

  for (const [key, value] of Object.entries(extras)) {
    if (key === "idempotent") sdkHints.idempotentHint = !!value
    else if (key === "readOnly") sdkHints.readOnlyHint = !!value
    else if (key === "destructive") sdkHints.destructiveHint = !!value
    else internalMeta[key] = value
  }

  return {
    annotations: sdkHints,
    _internalMeta: internalMeta
  }
}

export function readOnlyAnnotation(cat: string, intent: string, extras: AnnotationExtras = {}) {
  return baseAnnotation(cat, intent, { readOnly: true, ...extras })
}

export function destructiveAnnotation(cat: string, intent: string, extras: AnnotationExtras = {}) {
  return baseAnnotation(cat, intent, { destructive: true, confirm: "dryRun+confirm=yes", ...extras })
}
