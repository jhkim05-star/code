/** Revisioned snapshots. Adapters make storage failures and stale replicas testable. */
export function newestSnapshot(...values) {
    return values.filter(v => v && Number.isSafeInteger(v.revision) && v.revision >= 0 && v.data)
        .sort((a, b) => b.revision - a.revision || (b.updatedAt || 0) - (a.updatedAt || 0))[0] || null;
}
export class SnapshotWriter {
    constructor({ local, database, writer = 'local' }) {
        this.local = local;
        this.database = database;
        this.writer = writer;
        this.revision = 0;
        this.persistedRevision = 0;
        this.queue = Promise.resolve();
        this.lastError = null;
    }
    async load() {
        this.readErrors = [];
        const values = await Promise.all([[this.local, 'local'], [this.database, 'database']].map(async ([adapter, name]) => {
            try {
                const value = await adapter.read();
                if (value != null && !newestSnapshot(value))
                    throw new Error('저장된 스냅샷 형식 오류');
                return value;
            }
            catch (error) {
                this.readErrors.push({ name, error });
                return null;
            }
        }));
        const latest = newestSnapshot(...values);
        this.revision = latest?.revision || 0;
        this.persistedRevision = this.revision;
        return latest;
    }
    save(data) {
        const snapshot = { revision: ++this.revision, writer: this.writer, updatedAt: Date.now(), data: structuredClone(data) };
        // The synchronous local mirror protects the latest action even if the page exits before IDB completes.
        let localOK = false;
        try {
            localOK = this.local.writeSync(snapshot) !== false;
        }
        catch { /* Keep dirty state and try IDB. */ }
        const work = async () => {
            let dbOK = false;
            try {
                dbOK = (await this.database.write(snapshot)) !== false;
            }
            catch { /* Report aggregate failure below. */ }
            if (!localOK && !dbOK) {
                this.lastError = new Error('기기에 저장하지 못했습니다. 앱을 닫기 전에 백업을 내보내 주세요.');
                throw this.lastError;
            }
            this.persistedRevision = Math.max(this.persistedRevision, snapshot.revision);
            this.lastError = null;
            return { revision: snapshot.revision, local: localOK, database: dbOK };
        };
        const result = this.queue.then(work, work);
        this.queue = result.catch(() => { });
        return result;
    }
}
