export async function commentTask(input, client) {
    if (input.dryRun) {
        return { preview: { taskId: input.taskId, characters: input.comment.length } };
    }
    const payload = { comment_text: input.comment };
    const comment = await client.commentTask(input.taskId, payload);
    return { comment };
}
