import type { Id, Member, Proposal, Visit } from './types';
export const TRIP_DATES = ['2026-12-17','2026-12-18','2026-12-19','2026-12-20','2026-12-21','2026-12-22'] as const;
export const FAMILY_ORDER = ['jinhyeok','yeonhwa','minseong','sophie','soeun'] as const;
const TRAVELER_KEYS: readonly string[] = ['jinhyeok','yeonhwa','minseong','sophie'];
export function isTraveler(member: Member): boolean { return TRAVELER_KEYS.includes(member.nameKey); }
export function dateLabel(date: string, locale: 'ko'|'en'): string {
  const day = Number(date.slice(-2));
  return locale === 'ko' ? `12월 ${day}일` : `${day} Dec`;
}
export function isTripDate(date: string): boolean { return (TRIP_DATES as readonly string[]).includes(date); }
export function visitIdForProposal(proposalId: string): string { return `trip_${proposalId}`; }
export function membersForDate(date: string, members: Id<Member>[]): Id<Member>[] {
  const leaving = date === '2026-12-22';
  return members.filter(member => isTraveler(member) && (!leaving || !['jinhyeok','yeonhwa'].includes(member.nameKey)));
}
export function scheduledForDate(proposals: Id<Proposal>[], date: string, status: Proposal['status']): Id<Proposal>[] {
  return proposals.filter(plan => plan.date === date && plan.status === status).sort((a,b) => (a.time || '99:99').localeCompare(b.time || '99:99'));
}
export function visitsForPlace(visits: Id<Visit>[], placeId: string): Id<Visit>[] {
  return visits.filter(visit => visit.placeId === placeId).sort((a,b) => (b.year || '').localeCompare(a.year || ''));
}
