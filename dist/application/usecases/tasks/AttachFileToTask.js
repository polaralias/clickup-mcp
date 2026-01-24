import { Buffer } from "node:buffer";
import { getMaxAttachmentSizeMb } from "../../config/applicationConfig.js";
function resolveLimitMb(config) {
    return getMaxAttachmentSizeMb(config);
}
function parseDataUri(dataUri) {
    const parts = dataUri.split(",", 2);
    if (parts.length !== 2) {
        throw new Error("Invalid data URI");
    }
    const header = parts[0];
    const data = parts[1];
    const isBase64 = header.endsWith(";base64");
    const buffer = Buffer.from(data, isBase64 ? "base64" : "utf8");
    return buffer;
}
export async function attachFileToTask(input, client, config) {
    const buffer = parseDataUri(input.dataUri);
    const limitMb = resolveLimitMb(config);
    const limitBytes = limitMb * 1024 * 1024;
    if (buffer.byteLength > limitBytes) {
        throw new Error(`Attachment exceeds limit of ${limitMb}MB`);
    }
    if (input.dryRun) {
        return {
            preview: {
                taskId: input.taskId,
                filename: input.filename,
                sizeBytes: buffer.byteLength
            }
        };
    }
    const blob = new Blob([buffer]);
    const form = new FormData();
    form.append("attachment", blob, input.filename);
    const attachment = await client.attachFile(input.taskId, form);
    return { attachment: attachment };
}
