export const PHOTO_LIMIT = 20;
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const RESERVATION_MS = 60 * 60 * 1000;
export interface Quota { activeCount: number; pending: Record<string, number> }
export function pruneQuota(value: unknown, now: number): { quota: Quota; expired: string[] } {
  const raw = value && typeof value === 'object' ? value as Partial<Quota> : {};
  const activeCount = Number.isInteger(raw.activeCount) && (raw.activeCount ?? -1) >= 0 ? raw.activeCount! : 0;
  const pending: Record<string, number> = {};
  const expired: string[] = [];
  for (const [id, expiry] of Object.entries(raw.pending ?? {})) {
    if (Number.isFinite(expiry) && expiry > now) pending[id] = expiry;
    else expired.push(id);
  }
  return { quota: { activeCount, pending }, expired };
}
export function slotsUsed(quota: Quota): number { return quota.activeCount + Object.keys(quota.pending).length; }
export function canReserve(quota: Quota): boolean { return slotsUsed(quota) < PHOTO_LIMIT; }
