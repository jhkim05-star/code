import {
  addDoc, collection, deleteDoc, deleteField, doc, getDoc, onSnapshot, runTransaction,
  serverTimestamp, setDoc, updateDoc, type Firestore, type Unsubscribe,
} from 'firebase/firestore';
import { httpsCallable, type Functions } from 'firebase/functions';
import { getBlob, ref, uploadBytes, type FirebaseStorage } from 'firebase/storage';
import type { Services } from './firebase';
import type { Comment, Id, Member, Photo, Place, PlaceLink, Proposal, Review, TripInfo, Visit } from './types';
import { isTripDate } from './model';

export type Listener<T> = (items: Id<T>[]) => void;
export function watch<T>(db: Firestore, path: string, receive: Listener<T>, error: (error: Error) => void): Unsubscribe {
  return onSnapshot(collection(db, path), snapshot => receive(snapshot.docs.map(item => ({ id: item.id, ...item.data() }) as Id<T>)), error);
}
export function watchMember(db: Firestore, uid: string, receive: (member: Member | null) => void, error: (error: Error) => void): Unsubscribe {
  return onSnapshot(doc(db, 'members', uid), snapshot => receive(snapshot.exists() ? snapshot.data() as Member : null), error);
}
export function watchTripInfo(db: Firestore, receive: (info: TripInfo | null) => void, error: (error: Error) => void): Unsubscribe {
  return onSnapshot(doc(db, 'tripInfo', 'summary'), snapshot => receive(snapshot.exists() ? snapshot.data() as TripInfo : null), error);
}
export type TripInfoFields = Pick<TripInfo, 'arrivalFlight' | 'coupleReturnFlight' | 'youngerReturnFlight' | 'mainStay' | 'extraStay'>;
export async function saveTripInfo(db: Firestore, fields: TripInfoFields): Promise<void> {
  await setDoc(doc(db, 'tripInfo', 'summary'), { ...fields, updatedAt: serverTimestamp() });
}
export const MAX_PLACE_LINKS = 8;
export interface PlaceFields { title: string; category: string; intro: string; toConfirm: string; additionalInfo: string; infoUrls: PlaceLink[]; visitNotes: string }
export async function savePlace(db: Firestore, uid: string, fields: PlaceFields, placeId?: string): Promise<string> {
  const infoUrls = fields.infoUrls.map(item => ({ label: item.label.trim(), url: item.url.trim() }));
  if (infoUrls.length > MAX_PLACE_LINKS || infoUrls.some(item => {
    try { const url = new URL(item.url); return !['http:', 'https:'].includes(url.protocol); }
    catch { return true; }
  })) throw new Error('Add up to 8 valid http:// or https:// URLs');
  const clean = { ...fields, title: fields.title.trim(), category: fields.category.trim(), infoUrls };
  if (!clean.title) throw new Error('Place name is required');
  if (placeId) {
    await updateDoc(doc(db, 'places', placeId), { ...clean, mapUrl: deleteField(), officialUrl: deleteField(),
      reservationNotes: deleteField(), updatedAt: serverTimestamp() });
    return placeId;
  }
  const item = await addDoc(collection(db, 'places'), { ...clean, createdBy: uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  return item.id;
}
const starterPlaces: Array<{ id: string; title: string; category: string }> = [
  { id: 'idea_disneyland', title: 'Tokyo Disneyland · 도쿄 디즈니랜드', category: 'theme park' },
  { id: 'idea_odaiba', title: 'Odaiba · 오다이바', category: 'area' },
  { id: 'idea_department_store', title: '도쿄 백화점 · Department store', category: 'shopping' },
  { id: 'idea_museum', title: '도쿄 뮤지엄 · Museum', category: 'museum' },
  { id: 'idea_heritage', title: '도쿄 문화재 · Heritage', category: 'heritage' },
  { id: 'idea_yokohama', title: 'Yokohama · 요코하마', category: 'day trip' },
  { id: 'idea_food', title: '음식·디저트·위스키 · Food & whisky', category: 'food' },
];
export async function seedPlaces(db: Firestore, uid: string): Promise<void> {
  for (const item of starterPlaces) {
    const placeRef = doc(db, 'places', item.id);
    await runTransaction(db, async tx => {
      if ((await tx.get(placeRef)).exists()) return;
      tx.set(placeRef, { title: item.title, category: item.category, intro: '', toConfirm: '',
        additionalInfo: '', infoUrls: [], visitNotes: '', createdBy: uid,
        createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    });
  }
}
export async function toggleInterest(db: Firestore, placeId: string, uid: string, interested: boolean): Promise<void> {
  const target = doc(db, 'places', placeId, 'interests', uid);
  if (interested) await deleteDoc(target);
  else await setDoc(target, { uid, createdAt: serverTimestamp() });
}
export interface ProposalFields { placeId: string; date: string; time: string; participantUids: string[] }
export async function saveProposal(db: Firestore, uid: string, fields: ProposalFields, proposalId?: string): Promise<string> {
  if (!isTripDate(fields.date) || !fields.placeId || fields.participantUids.length < 1) throw new Error('Date, place and participants are required');
  if (proposalId) { await updateDoc(doc(db, 'proposals', proposalId), { date: fields.date, time: fields.time, participantUids: fields.participantUids, updatedAt: serverTimestamp() }); return proposalId; }
  const created = await addDoc(collection(db, 'proposals'), { ...fields, status: 'proposed', visitId: null,
    createdBy: uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  return created.id;
}
export async function setProposalStatus(functions: Functions, proposalId: string, status: 'proposed'|'confirmed'): Promise<string | null> {
  const call = httpsCallable<{ proposalId: string; status: string }, { status: string; visitId: string | null }>(functions, 'setProposalStatus');
  return (await call({ proposalId, status })).data.visitId;
}
export async function toggleAgreement(db: Firestore, proposalId: string, uid: string, agreed: boolean): Promise<void> {
  const target = doc(db, 'proposals', proposalId, 'agreements', uid);
  if (agreed) await deleteDoc(target);
  else await setDoc(target, { uid, createdAt: serverTimestamp() });
}
export async function addComment(db: Firestore, path: string, uid: string, text: string): Promise<void> {
  const clean = text.trim();
  if (!clean) throw new Error('Comment is empty');
  await addDoc(collection(db, path), { authorUid: uid, text: clean, createdAt: serverTimestamp() });
}
export async function createPastVisit(db: Firestore, uid: string, placeId: string, label: string, year: string): Promise<string> {
  const clean = label.trim();
  if (!clean || (year && !/^\d{4}$/.test(year))) throw new Error('Album name or year is invalid');
  const item = await addDoc(collection(db, 'visits'), { placeId, label: clean, year, kind: 'past', proposalId: null,
    createdBy: uid, createdAt: serverTimestamp() });
  return item.id;
}
export async function saveReview(db: Firestore, visitId: string, uid: string, text: string): Promise<void> {
  const target = doc(db, 'visits', visitId, 'reviews', uid);
  if (!text.trim()) { await deleteDoc(target); return; }
  await setDoc(target, { authorUid: uid, text: text.trim(), updatedAt: serverTimestamp() });
}
function imageType(file: File): string {
  const known = file.type.toLowerCase();
  if (known === 'image/jpg') return 'image/jpeg';
  const ext = file.name.split('.').pop()?.toLowerCase();
  const fromExtension = ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif', heic: 'image/heic', heif: 'image/heif' } as Record<string,string>)[ext ?? ''] ?? '';
  return known && known !== 'application/octet-stream' ? known : fromExtension;
}
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const IMAGE_TYPES = ['image/jpeg','image/png','image/webp','image/gif','image/avif','image/heic','image/heif'];
export async function uploadPhoto(services: Services, visitId: string, file: File): Promise<void> {
  const contentType = imageType(file);
  if (!IMAGE_TYPES.includes(contentType) || file.size < 1 || file.size > MAX_FILE_BYTES) throw new Error('JPEG, PNG, WebP, GIF, AVIF or HEIC images up to 25 MB only');
  const reserve = httpsCallable<{ visitId: string; name: string; contentType: string; size: number }, { photoId: string; storagePath: string }>(services.functions, 'reservePhotoUpload');
  const { photoId, storagePath } = (await reserve({ visitId, name: file.name, contentType, size: file.size })).data;
  try { await uploadBytes(ref(services.storage, storagePath), file, { contentType }); }
  catch (error) {
    try { await httpsCallable(services.functions, 'cancelPhotoUpload')({ visitId, photoId }); } catch { /* Stale reservation expires on the server. */ }
    throw error;
  }
  // A Storage trigger also finalizes the file if the phone disconnects here.
  await httpsCallable(services.functions, 'finalizePhotoUpload')({ visitId, photoId });
}
export async function downloadPhoto(storage: FirebaseStorage, photo: Id<Photo>): Promise<void> {
  const blob = await getBlob(ref(storage, photo.storagePath));
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = photo.originalName; document.body.append(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
export async function deleteOwnPhoto(functions: Functions, visitId: string, photoId: string): Promise<void> {
  await httpsCallable(functions, 'deletePhoto')({ visitId, photoId });
}
export async function getPhotoBlob(storage: FirebaseStorage, photo: Id<Photo>): Promise<Blob> {
  return getBlob(ref(storage, photo.storagePath));
}
export async function getMember(db: Firestore, uid: string): Promise<Member | null> {
  const snap = await getDoc(doc(db, 'members', uid));
  return snap.exists() ? snap.data() as Member : null;
}
export type { Place, Proposal, Visit, Comment, Review };
