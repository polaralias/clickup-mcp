export async function deleteView(input, client) {
    const nextSteps = [
        "Call clickup_get_workspace_overview or relevant list tools to confirm the view is gone.",
        "Create a new view with clickup_create_list_view or clickup_create_space_view if required."
    ];
    if (input.dryRun) {
        return {
            preview: { action: "delete", viewId: input.viewId },
            nextSteps
        };
    }
    await client.deleteView(input.viewId);
    return {
        status: "deleted",
        viewId: input.viewId,
        nextSteps
    };
}
