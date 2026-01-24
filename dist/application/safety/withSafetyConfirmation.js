export function withSafetyConfirmation(handler) {
    return async (input) => {
        if (input.dryRun) {
            return handler({ ...input, confirm: input.confirm ?? "yes", dryRun: true });
        }
        if (input.confirm !== "yes") {
            return {
                content: [
                    {
                        type: "text",
                        text: "Confirmation required. Resend with confirm: \"yes\" or set dryRun: true for a preview."
                    }
                ],
                metadata: {
                    requiresConfirmation: true
                }
            };
        }
        return handler({ ...input, dryRun: false });
    };
}
