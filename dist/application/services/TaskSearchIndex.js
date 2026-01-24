import Fuse from "fuse.js";
const fuseOptions = {
    includeScore: true,
    threshold: 0.35,
    keys: [
        { name: "name", weight: 0.5 },
        { name: "description", weight: 0.3 },
        { name: "status", weight: 0.2 }
    ]
};
export class TaskSearchIndex {
    fuse = new Fuse([], fuseOptions);
    tasks = new Map();
    index(tasks) {
        tasks.forEach((task) => {
            if (task.id) {
                this.tasks.set(task.id, task);
            }
        });
        this.fuse.setCollection(Array.from(this.tasks.values()));
    }
    search(query, limit) {
        const results = this.fuse.search(query, { limit });
        return results.map((result) => ({
            ...result.item,
            score: result.score ?? 0
        }));
    }
    lookup(taskId) {
        return this.tasks.get(taskId);
    }
}
