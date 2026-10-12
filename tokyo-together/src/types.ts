import type { Timestamp } from 'firebase/firestore';

export type MemberKey = 'jinhyeok' | 'yeonhwa' | 'minseong' | 'sophie';
export type Tab = 'home' | 'plans' | 'places' | 'memories';
export type Id<T> = T & { id: string };
export interface Member { nameKey: MemberKey; displayName: string; email: string }
export interface TripInfo {
  arrivalFlight: string; coupleReturnFlight: string; youngerReturnFlight: string;
  mainStay: string; extraStay: string; updatedAt: Timestamp;
}
export interface Place {
  title: string; category: string; intro: string; mapUrl: string; officialUrl: string;
  visitNotes: string; reservationNotes: string; toConfirm: string;
  createdBy: string; createdAt: Timestamp; updatedAt: Timestamp;
}
export interface Proposal {
  placeId: string; date: string; time: string; participantUids: string[];
  status: 'proposed' | 'confirmed'; visitId: string | null;
  createdBy: string; createdAt: Timestamp; updatedAt: Timestamp;
}
export interface Visit {
  placeId: string; label: string; kind: 'past' | 'trip'; year: string;
  proposalId: string | null; createdBy: string; createdAt: Timestamp;
}
export interface Comment { authorUid: string; text: string; createdAt: Timestamp }
export interface Review { authorUid: string; text: string; updatedAt: Timestamp }
export interface Photo {
  ownerUid: string; originalName: string; contentType: string; size: number;
  storagePath: string; createdAt: Timestamp;
}
