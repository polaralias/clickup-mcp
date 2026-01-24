export async function ping(message) {
    return { message: message ?? "pong" };
}
