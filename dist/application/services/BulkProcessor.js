export class BulkProcessor {
    limit;
    constructor(limit) {
        this.limit = limit;
    }
    async run(items, worker) {
        const queue = [...items];
        const results = [];
        const workers = [];
        const process = async () => {
            while (queue.length > 0) {
                const next = queue.shift();
                if (next === undefined) {
                    return;
                }
                const result = await worker(next);
                results.push(result);
            }
        };
        const concurrency = Math.min(this.limit, items.length || 1);
        for (let i = 0; i < concurrency; i += 1) {
            workers.push(process());
        }
        await Promise.all(workers);
        return results;
    }
}
