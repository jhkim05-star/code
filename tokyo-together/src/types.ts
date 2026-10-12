import type { Timestamp } from 'firebase/firestore';

export type MemberKey = 'jinhyeok' | 'yeonhwa' | 'minseong' | 'sophie' | 'soeun';
export type Tab = 'home' | 'plans' | 'places' | 'memories';
export type Id<T> = T & { id: string };
export interface Member { nameKey: MemberKey; displayName: string; email: string }
export interface TripInfo {
  arrivalFlight: string; coupleReturnFlight: string; youngerReturnFlight: string;
  mainStay: string; extraStay: string; updatedAt: Timestamp;
}
export interface PlaceLink { label: string; url: string }
export type PlaceTheme = 'food' | 'sights' | 'shopping' | 'activities';
export type FoodCategory = 'breakfast' | 'lunch' | 'dinner' | 'cafe';
export interface Place {
  title: string; category: string; intro: string; toConfirm: string;
  additionalInfo?: string; infoUrls?: PlaceLink[]; visitNotes: string;
  theme?: PlaceTheme; subcategory?: FoodCategory | ''; area?: string; localName?: string;
  recommendedMenu?: string; route?: string; mapQuery?: string; duration?: string;
  recommended?: boolean; reviewedAt?: string; archived?: boolean;
  // Older place cards may still have these fields until someone edits them.
  mapUrl?: string; officialUrl?: string; reservationNotes?: string;
  createdBy: string; createdAt: Timestamp; updatedAt: Timestamp;
}
export interface Proposal {
  placeId: string; date: string; time: string; participantUids: string[];
  status: 'proposed' | 'confirmed'; visitId: string | null;
  createdBy: string; createdAt: Timestamp; updatedAt: Timestamp;
  archived?: boolean;
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
