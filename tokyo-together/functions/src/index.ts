import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp, type DocumentReference } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onObjectFinalized, onObjectDeleted } from 'firebase-functions/v2/storage';
import * as logger from 'firebase-functions/logger';
import { randomUUID } from 'node:crypto';
import { canReserve, MAX_FILE_BYTES, pruneQuota, RESERVATION_MS, type Quota } from './quota';

initializeApp();
const db = getFirestore();
// The emulator's inferred bucket may differ from a new firebasestorage.app bucket.
const bucketName = process.env.TOKYO_STORAGE_BUCKET || getStorage().app.options.storageBucket;
const bucket = getStorage().bucket(bucketName);
const REGION = 'asia-northeast1';
const IMAGE_TYPES = new Set(['image/jpeg','image/png','image/webp','image/gif','image/avif','image/heic','image/heif']);
const idPattern = /^[A-Za-z0-9_-]{1,128}$/;

function id(value: unknown, name: string): string {
  if (typeof value !== 'string' || !idPattern.test(value)) throw new HttpsError('invalid-argument', `${name} is invalid`);
  return value;
}
function memberUid(auth: { uid: string } | undefined): string {
  if (!auth?.uid) throw new HttpsError('unauthenticated', 'Sign in required');
  return auth.uid;
}
async function requireMember(uid: string): Promise<void> {
  if (!(await db.doc(`members/${uid}`).get()).exists) throw new HttpsError('permission-denied', 'Family membership required');
}
function photoRefs(visitId: string, uid: string, photoId: string) {
  return {
    quota: db.doc(`visits/${visitId}/quotas/${uid}`),
    ticket: db.doc(`uploadTickets/${photoId}`),
    photo: db.doc(`visits/${visitId}/photos/${photoId}`),
    path: `visits/${visitId}/${uid}/${photoId}`,
  };
}
function quotaFrom(snapshot: FirebaseFirestore.DocumentSnapshot, now: number): { quota: Quota; expired: string[] } {
  return pruneQuota(snapshot.exists ? snapshot.data() : null, now);
}
async function deleteIfExists(path: string): Promise<void> {
  try { await bucket.file(path).delete({ ignoreNotFound: true }); } catch (error) { logger.warn('Storage cleanup failed', path, error); }
}

export const setProposalStatus = onCall({ region: REGION }, async request => {
  const uid = memberUid(request.auth);
  await requireMember(uid);
  const proposalId = id(request.data?.proposalId, 'proposalId');
  const status = request.data?.status;
  if (status !== 'confirmed' && status !== 'proposed') throw new HttpsError('invalid-argument', 'Invalid status');
  const proposalRef = db.doc(`proposals/${proposalId}`);
  const visitId = `trip_${proposalId}`;
  const visitRef = db.doc(`visits/${visitId}`);
  return db.runTransaction(async tx => {
    const proposalSnap = await tx.get(proposalRef);
    if (!proposalSnap.exists) throw new HttpsError('not-found', 'Proposal not found');
    const proposal = proposalSnap.data()!;
    if (status === 'proposed') {
      if (proposal.status !== 'proposed') tx.update(proposalRef, { status, updatedAt: FieldValue.serverTimestamp() });
      return { status, visitId: proposal.visitId ?? null };
    }
    const placeRef = db.doc(`places/${proposal.placeId}`);
    const [placeSnap, visitSnap] = await Promise.all([tx.get(placeRef), tx.get(visitRef)]);
    if (!placeSnap.exists) throw new HttpsError('failed-precondition', 'Place missing');
    if (!visitSnap.exists) tx.create(visitRef, {
      placeId: proposal.placeId,
      label: `${proposal.date} · ${placeSnap.data()!.title}`,
      kind: 'trip', year: proposal.date.slice(0,4), proposalId, createdBy: uid,
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.update(proposalRef, { status, visitId, updatedAt: FieldValue.serverTimestamp() });
    return { status, visitId };
  });
});

export const reservePhotoUpload = onCall({ region: REGION }, async request => {
  const uid = memberUid(request.auth);
  await requireMember(uid);
  const visitId = id(request.data?.visitId, 'visitId');
  const name = request.data?.name;
  const contentType = request.data?.contentType;
  const size = request.data?.size;
  if (typeof name !== 'string' || !name.trim() || name.length > 200 ||
      !IMAGE_TYPES.has(contentType) || !Number.isInteger(size) || size < 1 || size > MAX_FILE_BYTES) {
    throw new HttpsError('invalid-argument', 'Image must be 1–25 MB and JPEG, PNG, WebP, GIF, AVIF or HEIC');
  }
  if (!(await db.doc(`visits/${visitId}`).get()).exists) throw new HttpsError('not-found', 'Visit not found');
  const photoId = randomUUID();
  const refs = photoRefs(visitId, uid, photoId);
  const now = Date.now();
  const expiresAt = now + RESERVATION_MS;
  let expired: string[] = [];
  await db.runTransaction(async tx => {
    const snap = await tx.get(refs.quota);
    const pruned = quotaFrom(snap, now);
    expired = pruned.expired;
    if (!canReserve(pruned.quota)) throw new HttpsError('resource-exhausted', '20 photos per person, place and visit');
    pruned.quota.pending[photoId] = expiresAt;
    tx.set(refs.quota, pruned.quota);
    tx.create(refs.ticket, { visitId, uid, name: name.trim(), contentType, size,
      expiresAt: Timestamp.fromMillis(expiresAt), createdAt: FieldValue.serverTimestamp() });
    for (const oldId of expired) tx.delete(db.doc(`uploadTickets/${oldId}`));
  });
  // A failed upload never holds a slot forever. Stale files are removed when the next reservation arrives.
  await Promise.allSettled(expired.map(oldId => deleteIfExists(photoRefs(visitId, uid, oldId).path)));
  return { photoId, storagePath: refs.path, expiresAt };
});

async function completeUpload(visitId: string, uid: string, photoId: string): Promise<{ photoId: string }> {
  const refs = photoRefs(visitId, uid, photoId);
  const photoAlready = await refs.photo.get();
  if (photoAlready.exists) return { photoId };
  let metadata;
  try { [metadata] = await bucket.file(refs.path).getMetadata(); }
  catch { throw new HttpsError('failed-precondition', 'Upload has not finished'); }
  const result = await db.runTransaction(async tx => {
    const [photoSnap, ticketSnap, quotaSnap] = await Promise.all([tx.get(refs.photo), tx.get(refs.ticket), tx.get(refs.quota)]);
    if (photoSnap.exists) return 'already';
    const ticket = ticketSnap.data();
    const pending = quotaFrom(quotaSnap, Date.now()).quota.pending;
    if (!ticket || ticket.uid !== uid || ticket.visitId !== visitId || !pending[photoId] ||
        ticket.expiresAt.toMillis() <= Date.now() || Number(metadata.size) !== ticket.size || metadata.contentType !== ticket.contentType) {
      return 'invalid';
    }
    const activeCount = quotaSnap.data()?.activeCount ?? 0;
    if (activeCount >= 20) return 'invalid';
    delete pending[photoId];
    tx.set(refs.quota, { activeCount: activeCount + 1, pending });
    tx.create(refs.photo, { ownerUid: uid, originalName: ticket.name, contentType: ticket.contentType,
      size: ticket.size, storagePath: refs.path, createdAt: FieldValue.serverTimestamp() });
    tx.delete(refs.ticket);
    return 'created';
  });
  if (result === 'invalid') {
    await deleteIfExists(refs.path);
    throw new HttpsError('failed-precondition', 'Upload reservation expired or does not match');
  }
  return { photoId };
}
export const finalizePhotoUpload = onCall({ region: REGION }, async request => {
  const uid = memberUid(request.auth);
  await requireMember(uid);
  return completeUpload(id(request.data?.visitId, 'visitId'), uid, id(request.data?.photoId, 'photoId'));
});

export const cancelPhotoUpload = onCall({ region: REGION }, async request => {
  const uid = memberUid(request.auth);
  await requireMember(uid);
  const visitId = id(request.data?.visitId, 'visitId');
  const photoId = id(request.data?.photoId, 'photoId');
  const refs = photoRefs(visitId, uid, photoId);
  const cancelled = await db.runTransaction(async tx => {
    const [photoSnap, ticketSnap, quotaSnap] = await Promise.all([tx.get(refs.photo), tx.get(refs.ticket), tx.get(refs.quota)]);
    if (photoSnap.exists || !ticketSnap.exists || ticketSnap.data()!.uid !== uid || ticketSnap.data()!.visitId !== visitId) return false;
    const quota = quotaFrom(quotaSnap, Date.now()).quota;
    delete quota.pending[photoId];
    tx.set(refs.quota, quota);
    tx.delete(refs.ticket);
    return true;
  });
  if (cancelled) await deleteIfExists(refs.path);
  return { cancelled };
});

async function releasePhoto(visitId: string, uid: string, photoId: string): Promise<void> {
  const refs = photoRefs(visitId, uid, photoId);
  await db.runTransaction(async tx => {
    const [photoSnap, quotaSnap] = await Promise.all([tx.get(refs.photo), tx.get(refs.quota)]);
    if (!photoSnap.exists) return;
    const quota = quotaFrom(quotaSnap, Date.now()).quota;
    tx.delete(refs.photo);
    tx.set(refs.quota, { activeCount: Math.max(0, quota.activeCount - 1), pending: quota.pending });
  });
}
export const deletePhoto = onCall({ region: REGION }, async request => {
  const uid = memberUid(request.auth);
  await requireMember(uid);
  const visitId = id(request.data?.visitId, 'visitId');
  const photoId = id(request.data?.photoId, 'photoId');
  const refs = photoRefs(visitId, uid, photoId);
  const snap = await refs.photo.get();
  if (!snap.exists) return { deleted: true };
  if (snap.data()!.ownerUid !== uid) throw new HttpsError('permission-denied', 'Only the uploader may delete this photo');
  await bucket.file(refs.path).delete({ ignoreNotFound: true });
  await releasePhoto(visitId, uid, photoId);
  return { deleted: true };
});

const storagePath = /^visits\/([^/]+)\/([^/]+)\/([^/]+)$/;
export const reconcileUploadedPhoto = onObjectFinalized({ region: REGION, retry: true, bucket: bucketName }, async event => {
  const parts = event.data.name?.match(storagePath);
  if (!parts) return;
  const [, visitId, uid, photoId] = parts;
  try { await completeUpload(visitId, uid, photoId); }
  catch (error) {
    if (error instanceof HttpsError && error.code === 'failed-precondition') return;
    logger.error('Photo reconciliation failed', event.data.name, error);
    throw error;
  }
});
export const reconcileDeletedPhoto = onObjectDeleted({ region: REGION, retry: true, bucket: bucketName }, async event => {
  const parts = event.data.name?.match(storagePath);
  if (!parts) return;
  const [, visitId, uid, photoId] = parts;
  await releasePhoto(visitId, uid, photoId);
});
