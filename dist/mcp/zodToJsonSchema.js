import { z } from "zod";
const { ZodFirstPartyTypeKind } = z;
function unwrapSchema(schema) {
    let current = schema;
    let optional = false;
    let defaultValue = undefined;
    while (true) {
        const typeName = current._def.typeName;
        switch (typeName) {
            case ZodFirstPartyTypeKind.ZodOptional: {
                optional = true;
                current = current._def.innerType;
                continue;
            }
            case ZodFirstPartyTypeKind.ZodDefault: {
                optional = true;
                const def = current._def.defaultValue();
                defaultValue = def;
                current = current._def.innerType;
                continue;
            }
            case ZodFirstPartyTypeKind.ZodEffects: {
                current = current._def.schema;
                continue;
            }
            case ZodFirstPartyTypeKind.ZodBranded: {
                current = current._def.type;
                continue;
            }
            case ZodFirstPartyTypeKind.ZodPipeline: {
                current = current._def.out;
                continue;
            }
            default:
                return { schema: current, optional, defaultValue };
        }
    }
}
function addDefault(target, value) {
    if (value !== undefined) {
        target.default = value;
    }
}
function withNullability(base) {
    if (base.type) {
        if (Array.isArray(base.type)) {
            if (!base.type.includes("null")) {
                base.type = [...base.type, "null"];
            }
        }
        else if (base.type !== "null") {
            base.type = [base.type, "null"];
        }
        return base;
    }
    if (base.anyOf) {
        base.anyOf = [...base.anyOf, { type: "null" }];
        return base;
    }
    return {
        anyOf: [base, { type: "null" }]
    };
}
function fromString(schema) {
    const result = { type: "string" };
    for (const check of schema._def.checks) {
        switch (check.kind) {
            case "min":
                result.minLength = check.value;
                break;
            case "max":
                result.maxLength = check.value;
                break;
            case "regex":
                result.pattern = check.regex.source;
                break;
            case "email":
                result.format = "email";
                break;
            case "url":
                result.format = "uri";
                break;
            case "uuid":
                result.format = "uuid";
                break;
            case "datetime":
                result.format = "date-time";
                break;
            case "ip":
                result.format = "ip";
                break;
            case "cuid":
            case "cuid2":
                result.format = "cuid";
                break;
            case "startsWith":
            case "endsWith":
            case "includes":
                // These checks provide guidance but no compact schema equivalent
                break;
            default:
                break;
        }
    }
    return result;
}
function fromNumber(schema) {
    const result = { type: "number" };
    let isInteger = false;
    for (const check of schema._def.checks) {
        switch (check.kind) {
            case "min":
                result.minimum = check.value;
                if (!check.inclusive) {
                    result.exclusiveMinimum = check.value;
                }
                break;
            case "max":
                result.maximum = check.value;
                if (!check.inclusive) {
                    result.exclusiveMaximum = check.value;
                }
                break;
            case "int":
                isInteger = true;
                break;
            case "multipleOf":
                result.multipleOf = check.value;
                break;
            default:
                break;
        }
    }
    if (isInteger) {
        result.type = "integer";
    }
    return result;
}
function fromBoolean() {
    return { type: "boolean" };
}
function fromArray(schema) {
    const result = {
        type: "array",
        items: convertSchema(schema._def.type).schema
    };
    if (schema._def.minLength !== null) {
        result.minItems = schema._def.minLength.value;
    }
    if (schema._def.maxLength !== null) {
        result.maxItems = schema._def.maxLength.value;
    }
    return result;
}
function fromLiteral(schema) {
    const value = schema._def.value;
    const literalSchema = { const: value };
    const valueType = typeof value;
    if (valueType === "string" || valueType === "number" || valueType === "boolean") {
        literalSchema.type = valueType;
    }
    return literalSchema;
}
function fromEnum(schema) {
    const values = Array.isArray(schema._def.values)
        ? schema._def.values
        : Object.values(schema._def.values).filter((value) => typeof value === "string" || typeof value === "number");
    const types = new Set(values.map((value) => typeof value));
    let type;
    if (types.size === 1) {
        type = types.values().next().value;
        if (type === "number") {
            type = "number";
        }
    }
    else {
        type = Array.from(types);
    }
    const schemaResult = { enum: values };
    if (type) {
        schemaResult.type = type;
    }
    return schemaResult;
}
function fromUnion(schema) {
    return {
        anyOf: schema._def.options.map((option) => convertSchema(option).schema)
    };
}
function fromIntersection(schema) {
    return {
        allOf: [convertSchema(schema._def.left).schema, convertSchema(schema._def.right).schema]
    };
}
function fromRecord(schema) {
    return {
        type: "object",
        additionalProperties: convertSchema(schema._def.valueType).schema
    };
}
function fromObject(schema) {
    const shape = schema._def.shape();
    const properties = {};
    const required = [];
    for (const [key, valueSchema] of Object.entries(shape)) {
        const converted = convertSchema(valueSchema);
        properties[key] = converted.schema;
        if (converted.required) {
            required.push(key);
        }
    }
    const objectSchema = {
        type: "object",
        properties
    };
    if (required.length > 0) {
        objectSchema.required = required;
    }
    const catchall = schema._def.catchall;
    if (catchall && catchall._def.typeName !== ZodFirstPartyTypeKind.ZodNever) {
        objectSchema.additionalProperties = convertSchema(catchall).schema;
    }
    else if (schema._def.unknownKeys === "passthrough") {
        objectSchema.additionalProperties = true;
    }
    else if (schema._def.unknownKeys === "strict") {
        objectSchema.additionalProperties = false;
    }
    return objectSchema;
}
function convertSchema(schema) {
    const { schema: unwrapped, optional, defaultValue } = unwrapSchema(schema);
    const typeName = unwrapped._def.typeName;
    let jsonSchema;
    switch (typeName) {
        case ZodFirstPartyTypeKind.ZodString:
            jsonSchema = fromString(unwrapped);
            break;
        case ZodFirstPartyTypeKind.ZodNumber:
            jsonSchema = fromNumber(unwrapped);
            break;
        case ZodFirstPartyTypeKind.ZodArray:
            jsonSchema = fromArray(unwrapped);
            break;
        case ZodFirstPartyTypeKind.ZodLiteral:
            jsonSchema = fromLiteral(unwrapped);
            break;
        case ZodFirstPartyTypeKind.ZodEnum:
        case ZodFirstPartyTypeKind.ZodNativeEnum:
            jsonSchema = fromEnum(unwrapped);
            break;
        case ZodFirstPartyTypeKind.ZodUnion:
            jsonSchema = fromUnion(unwrapped);
            break;
        case ZodFirstPartyTypeKind.ZodIntersection:
            jsonSchema = fromIntersection(unwrapped);
            break;
        case ZodFirstPartyTypeKind.ZodObject:
            jsonSchema = fromObject(unwrapped);
            break;
        case ZodFirstPartyTypeKind.ZodRecord:
            jsonSchema = fromRecord(unwrapped);
            break;
        case ZodFirstPartyTypeKind.ZodDate:
            jsonSchema = { type: "string", format: "date-time" };
            break;
        case ZodFirstPartyTypeKind.ZodBigInt:
            jsonSchema = { type: "integer" };
            break;
        case ZodFirstPartyTypeKind.ZodBoolean:
            jsonSchema = fromBoolean();
            break;
        case ZodFirstPartyTypeKind.ZodNull:
            jsonSchema = { type: "null" };
            break;
        case ZodFirstPartyTypeKind.ZodAny:
        case ZodFirstPartyTypeKind.ZodUnknown:
            jsonSchema = {};
            break;
        case ZodFirstPartyTypeKind.ZodNever:
            jsonSchema = { not: {} };
            break;
        case ZodFirstPartyTypeKind.ZodMap:
            jsonSchema = { type: "object" };
            break;
        case ZodFirstPartyTypeKind.ZodSet:
            jsonSchema = {
                type: "array",
                items: convertSchema(unwrapped._def.valueType).schema,
                uniqueItems: true
            };
            break;
        case ZodFirstPartyTypeKind.ZodTuple:
            jsonSchema = {
                type: "array",
                items: unwrapped._def.items.map((item) => convertSchema(item).schema),
                minItems: unwrapped._def.items.length,
                maxItems: unwrapped._def.items.length
            };
            break;
        case ZodFirstPartyTypeKind.ZodNullable: {
            const inner = convertSchema(unwrapped._def.innerType);
            jsonSchema = withNullability(inner.schema);
            addDefault(jsonSchema, defaultValue);
            return {
                schema: jsonSchema,
                required: inner.required && !optional
            };
        }
        default:
            jsonSchema = {};
            break;
    }
    addDefault(jsonSchema, defaultValue);
    return {
        schema: jsonSchema,
        required: !optional
    };
}
export function zodToJsonSchemaCompact(schema) {
    if (!schema) {
        return undefined;
    }
    const { schema: converted } = convertSchema(schema);
    return converted;
}
