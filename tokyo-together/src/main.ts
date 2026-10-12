import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth';
import { doc, type Unsubscribe } from 'firebase/firestore';
import { createServices } from './firebase';
import {
  addComment, createPastVisit, deleteOwnPhoto, downloadPhoto, getPhotoBlob, savePlace, saveProposal,
  saveReview, saveTripInfo, seedPlaces, setProposalStatus, toggleAgreement, toggleInterest, uploadPhoto, watch, watchMember, watchTripInfo,
  type PlaceFields, type ProposalFields, type TripInfoFields,
} from './data';
import { initialLocale, rememberLocale, t, type Locale } from './i18n';
import { dateLabel, FAMILY_ORDER, membersForDate, scheduledForDate, TRIP_DATES, visitsForPlace } from './model';
import type { Comment, Id, Member, Photo, Place, Proposal, Review, Tab, TripInfo, Visit } from './types';
import './style.css';

const services = createServices();
const root = document.querySelector<HTMLDivElement>('#app')!;
const modalRoot = document.querySelector<HTMLDivElement>('#modal-root')!;
const state = {
  locale: initialLocale(), tab: 'home' as Tab, user: null as User | null, member: null as Member | null,
  members: [] as Id<Member>[], places: [] as Id<Place>[], proposals: [] as Id<Proposal>[], visits: [] as Id<Visit>[], tripInfo: null as TripInfo | null,
  selectedPlaceId: null as string | null, selectedProposalId: null as string | null, selectedVisitId: null as string | null,
  placeComments: [] as Id<Comment>[], proposalComments: [] as Id<Comment>[], albumComments: [] as Id<Comment>[],
  photos: [] as Id<Photo>[], reviews: [] as Id<Review>[],
  agreements: new Map<string,Set<string>>(), interests: new Map<string,Set<string>>(),
  placeFilter: 'all' as 'all'|'mine', drafts: new Map<string,string>(),
  busy: false, notice: '', error: '', seedAttempted: false, loading: true,
};
const baseUnsubs: Unsubscribe[] = [];
const detailUnsubs: Unsubscribe[] = [];
const agreementUnsubs = new Map<string,Unsubscribe>();
const interestUnsubs = new Map<string,Unsubscribe>();
const previewUrls = new Map<string,string>();
const previewPending = new Set<string>();
let memberUnsub: Unsubscribe | null = null;
let memberWatchingUid: string | null = null;

function tr(ko: string, en: string): string { return state.locale === 'ko' ? ko : en; }
function T(key: Parameters<typeof t>[0]): string { return t(key, state.locale); }
function esc(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]!);
}
function attr(value: unknown): string { return esc(value); }
function safeUrl(value: string): string | null {
  try { const url = new URL(value); return ['https:','http:'].includes(url.protocol) ? url.href : null; } catch { return null; }
}
function link(value: string, label: string): string {
  const url = safeUrl(value);
  return url ? `<a class="text-link" href="${attr(url)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>` : `<span class="muted">${T('noLink')}</span>`;
}
function name(uid: string): string { return state.members.find(item => item.id === uid)?.displayName || uid.slice(0,8); }
function place(id: string): Id<Place> | undefined { return state.places.find(item => item.id === id); }
function visit(id: string): Id<Visit> | undefined { return state.visits.find(item => item.id === id); }
function proposal(id: string): Id<Proposal> | undefined { return state.proposals.find(item => item.id === id); }
function displayDate(value: string): string { return dateLabel(value, state.locale); }
function displayTime(value: string): string { return value || T('timeOpen'); }
function byCreated<T extends { createdAt?: { toMillis?: () => number } }>(a: T,b: T): number {
  return (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0);
}
function clearUnsubs(items: Unsubscribe[]): void { items.splice(0).forEach(unsub => unsub()); }
function clearData(): void {
  clearUnsubs(baseUnsubs); clearUnsubs(detailUnsubs);
  agreementUnsubs.forEach(unsub => unsub()); agreementUnsubs.clear();
  interestUnsubs.forEach(unsub => unsub()); interestUnsubs.clear();
  previewUrls.forEach(url => URL.revokeObjectURL(url)); previewUrls.clear();
  state.members=[]; state.places=[]; state.proposals=[]; state.visits=[]; state.tripInfo=null; state.member=null;
  state.selectedPlaceId=null; state.selectedProposalId=null; state.selectedVisitId=null;
  state.agreements.clear(); state.interests.clear(); state.seedAttempted=false;
}
function problem(error: Error): void { state.error = error.message; render(); }
function watchDetails(): void {
  if (!services) return;
  clearUnsubs(detailUnsubs);
  state.placeComments=[]; state.proposalComments=[]; state.photos=[]; state.reviews=[]; state.albumComments=[];
  if (state.selectedPlaceId) detailUnsubs.push(watch<Comment>(services.db, `places/${state.selectedPlaceId}/comments`, items => { state.placeComments=items.sort(byCreated); render(); }, problem));
  if (state.selectedProposalId) detailUnsubs.push(watch<Comment>(services.db, `proposals/${state.selectedProposalId}/comments`, items => { state.proposalComments=items.sort(byCreated); render(); }, problem));
  if (state.selectedVisitId) {
    const id = state.selectedVisitId;
    detailUnsubs.push(watch<Photo>(services.db, `visits/${id}/photos`, items => { state.photos=items.sort(byCreated); render(); }, problem));
    detailUnsubs.push(watch<Review>(services.db, `visits/${id}/reviews`, items => { state.reviews=items; render(); }, problem));
    detailUnsubs.push(watch<Comment>(services.db, `visits/${id}/comments`, items => { state.albumComments=items.sort(byCreated); render(); }, problem));
  }
  render();
}
function syncInterestWatchers(): void {
  if (!services) return;
  for (const item of state.places) if (!interestUnsubs.has(item.id)) {
    interestUnsubs.set(item.id, watch<{ uid:string }>(services.db, `places/${item.id}/interests`, list => {
      state.interests.set(item.id, new Set(list.map(x => x.uid))); render();
    }, problem));
  }
  for (const [id,unsub] of interestUnsubs) if (!place(id)) { unsub(); interestUnsubs.delete(id); state.interests.delete(id); }
}
function syncAgreementWatchers(): void {
  if (!services) return;
  for (const item of state.proposals) if (!agreementUnsubs.has(item.id)) {
    agreementUnsubs.set(item.id, watch<{ uid:string }>(services.db, `proposals/${item.id}/agreements`, list => {
      state.agreements.set(item.id, new Set(list.map(x => x.uid))); render();
    }, problem));
  }
  for (const [id,unsub] of agreementUnsubs) if (!proposal(id)) { unsub(); agreementUnsubs.delete(id); state.agreements.delete(id); }
}
function beginWatching(): void {
  if (!services) return;
  clearUnsubs(baseUnsubs);
  baseUnsubs.push(watch<Member>(services.db, 'members', items => {
    state.members=items.sort((a,b) => FAMILY_ORDER.indexOf(a.nameKey as typeof FAMILY_ORDER[number]) - FAMILY_ORDER.indexOf(b.nameKey as typeof FAMILY_ORDER[number]));
    render();
  }, problem));
  baseUnsubs.push(watch<Place>(services.db, 'places', items => {
    state.places=items.sort((a,b)=>a.title.localeCompare(b.title));
    syncInterestWatchers(); render();
    if (!state.seedAttempted && items.length===0 && state.user) {
      state.seedAttempted=true;
      seedPlaces(services.db, state.user.uid).catch(problem);
    }
  }, problem));
  baseUnsubs.push(watch<Proposal>(services.db, 'proposals', items => { state.proposals=items; syncAgreementWatchers(); render(); }, problem));
  baseUnsubs.push(watch<Visit>(services.db, 'visits', items => { state.visits=items; render(); }, problem));
  baseUnsubs.push(watchTripInfo(services.db, info => { state.tripInfo=info; render(); }, problem));
}
if (services) onAuthStateChanged(services.auth, user => {
  memberUnsub?.(); memberUnsub=null; memberWatchingUid=null; clearData(); state.user=user; state.loading=false; state.error='';
  if (user) {
    memberWatchingUid=user.uid;
    memberUnsub=watchMember(services.db, user.uid, member => {
      if (member && !state.member) { state.member=member; beginWatching(); }
      else if (!member && state.member) { clearData(); }
      state.member=member; render();
    }, error => { state.member=null; state.error=error.message; render(); });
  }
  render();
}, problem);
else { state.loading=false; render(); }

function pill(text: string, kind=''): string { return `<span class="pill ${kind}">${esc(text)}</span>`; }
function who(uids: string[]): string { return uids.map(name).map(esc).join(' · ') || T('unknown'); }
function statusPill(status: Proposal['status']): string { return pill(status==='confirmed' ? T('confirmed') : T('proposed'), status); }
function nav(): string {
  return `<nav class="tabs" aria-label="${tr('메인 메뉴','Main menu')}">
    ${(['home','plans','places','memories'] as Tab[]).map(tab => `<button class="tab ${state.tab===tab?'active':''}" data-action="tab" data-tab="${tab}" aria-current="${state.tab===tab?'page':'false'}">${T(tab)}</button>`).join('')}
  </nav>`;
}
function header(): string {
  return `<header class="topbar"><div class="topbar-inner"><div class="brand"><div class="brand-mark">東</div><div><strong>Tokyo Together</strong><small>${T('tripDates')}</small></div></div>
    <div class="top-actions">${services?.emulator?'':`<span class="connection">${T('live')}</span>`}
    <button class="locale" data-action="locale" aria-label="Language">${state.locale==='ko'?'EN':'한국어'}</button>
    <span class="user-name">${esc(state.member?.displayName)}</span><button class="signout" data-action="signout">${T('signOut')}</button></div></div></header>${emulatorBanner()}${nav()}`;
}
function emulatorBanner(): string {
  return services?.emulator ? `<div class="emulator-banner" role="status">${T('emulator')}</div>` : '';
}
function setupScreen(): string {
  return `<main class="setup-shell"><div class="intro-art"><span>東京</span><span class="intro-line"></span><span>TOGETHER</span></div><div class="setup-card">
    <div class="eyebrow">2026 · TOKYO</div><h1>Tokyo Together</h1><p class="lead">${T('subtitle')}</p>
    <div class="alert"><strong>${T('setupTitle')}</strong><p>${T('setupBody')}</p></div>
    <p class="muted">${tr('프로젝트의 README에 연결 순서를 정리했습니다.','The project README explains the setup steps.')}</p></div></main>`;
}
function loginScreen(): string {
  return `<main class="setup-shell"><div class="intro-art"><span>東京</span><span class="intro-line"></span><span>TOGETHER</span></div><div class="setup-card">
    <div class="eyebrow">17—22 DECEMBER 2026</div><h1>Tokyo Together</h1><p class="lead">${T('subtitle')}</p>
    <form id="login-form" class="stack"><h2>${T('signedOut')}</h2><label>${T('email')}<input name="email" type="email" autocomplete="username" required /></label>
    <label>${T('password')}<input name="password" type="password" autocomplete="current-password" required /></label>
    <button class="primary" type="submit">${T('signIn')}</button></form></div></main>`;
}
function deniedScreen(): string { return `<main class="main single"><div class="alert"><h2>${T('notMember')}</h2><p class="muted">UID: ${esc(state.user?.uid)}</p><button data-action="signout">${T('signOut')}</button></div></main>`; }
function homePlan(item: Id<Proposal>): string {
  return `<div class="agenda-item"><div class="agenda-dot ${item.status}"></div><div><strong>${esc(place(item.placeId)?.title || T('unknown'))}</strong><small>${esc(displayTime(item.time))} · ${who(item.participantUids)}</small></div>
    <button class="small-link" data-action="open-proposal" data-id="${attr(item.id)}">${tr('보기','View')} →</button></div>`;
}
function home(): string {
  const ideas = state.proposals.filter(item => item.status==='proposed').sort((a,b)=>a.date.localeCompare(b.date));
  return `<div class="page-head"><div><div class="eyebrow">${T('tripDates')} · JAPAN</div><h1>${T('homeIntro')}</h1><p>${T('subtitle')}</p></div>
    <button class="primary" data-action="new-proposal">＋ ${T('addProposal')}</button></div>
    <div class="home-grid"><section class="card wide"><div class="section-title"><div><span class="kicker">01 / ITINERARY</span><h2>${T('homeConfirmed')}</h2></div></div>
      <div class="days">${TRIP_DATES.map(date => {
        const confirmed=scheduledForDate(state.proposals,date,'confirmed');
        const participants=membersForDate(date,state.members);
        return `<div class="day-row"><div class="day-date"><span>DEC</span><strong>${date.slice(-2)}</strong><small>${who(participants.map(x=>x.id))}</small></div><div class="day-content">${confirmed.length?confirmed.map(homePlan).join(''):`<p class="muted">${T('empty')}</p>`}
          ${date==='2026-12-21'?`<div class="travel-note">✈ ${tr('진혁·연화 귀국','Jinhyeok & Yeonhwa return')} · ${esc(state.tripInfo?.coupleReturnFlight || T('unknown'))}</div>`:''}
          ${date==='2026-12-22'?`<div class="travel-note">✈ ${tr('민성·소피 귀국','Minseong & Sophie return')} · ${esc(state.tripInfo?.youngerReturnFlight || T('unknown'))}</div>`:''}</div></div>`;
      }).join('')}</div></section>
      <div class="home-aside"><section class="card"><span class="kicker">02 / IDEAS</span><h2>${T('homeIdeas')}</h2>
      ${ideas.length?ideas.map(item=>`<button class="idea-row" data-action="open-proposal" data-id="${attr(item.id)}"><span>${esc(displayDate(item.date))}</span><strong>${esc(place(item.placeId)?.title || T('unknown'))}</strong><small>→</small></button>`).join(''):`<p class="muted">${T('empty')}</p>`}</section>
      <section class="card"><span class="kicker">03 / TRAVEL NOTES</span><div class="section-title"><h2>${T('bookings')}</h2><button class="small-link" data-action="edit-trip-info">${tr('정보 수정','Edit details')}</button></div>
      <div class="info-row"><span>12/17</span><div><strong>${tr('진혁·연화 입국편','Jinhyeok & Yeonhwa arrival')}</strong><small>${esc(state.tripInfo?.arrivalFlight || T('unknown'))}</small></div></div>
      <div class="info-row"><span>12/21</span><div><strong>${tr('진혁·연화 귀국편','Jinhyeok & Yeonhwa return')}</strong><small>${esc(state.tripInfo?.coupleReturnFlight || T('unknown'))}</small></div></div>
      <div class="info-row"><span>12/22</span><div><strong>${tr('민성·소피 귀국편','Minseong & Sophie return')}</strong><small>${esc(state.tripInfo?.youngerReturnFlight || T('unknown'))}</small></div></div>
      <div class="info-row"><span>12/17–21</span><div><strong>${tr('가족 숙소 · 객실 2개 예정','Family stay · two rooms planned')}</strong><small>${esc(state.tripInfo?.mainStay || T('unknown'))} · ${T('needsCheck')}</small></div></div>
      <div class="info-row"><span>12/21–22</span><div><strong>${tr('민성·소피 추가 숙소','Minseong & Sophie extra stay')}</strong><small>${esc(state.tripInfo?.extraStay || T('unknown'))}</small></div></div></section>
      <section class="card caution"><span class="kicker">04 / OPEN QUESTIONS</span><h2>${T('openItems')}</h2><ul>
        <li>${tr('숙소의 정확한 이름과 예약 조건 · 예약메일 확인','Exact hotel name and booking terms · check confirmation email')}</li>
        ${!state.tripInfo?.extraStay?`<li>${tr('민성·소피 12/21–22 추가 숙소','Minseong & Sophie extra night, 21–22 Dec')}</li>`:''}
        ${!state.tripInfo?.youngerReturnFlight?`<li>${tr('민성·소피 항공편과 귀국 시간','Minseong & Sophie flight details and return time')}</li>`:''}
        <li>${tr('방문 장소·시간·예약 여부는 아직 미정','Places, times and reservation needs are undecided')}</li>
      </ul></section></div></div>`;
}
function planCard(item: Id<Proposal>): string {
  const agreed = state.agreements.get(item.id) ?? new Set<string>();
  return `<article class="card plan-card"><div class="plan-card-top"><div>${statusPill(item.status)}<span class="date-chip">${esc(displayDate(item.date))} · ${esc(displayTime(item.time))}</span></div><span class="count">✓ ${T('agreeCount')} ${agreed.size}</span></div>
    <h3>${esc(place(item.placeId)?.title || T('unknown'))}</h3><p class="muted">${T('participants')}: ${who(item.participantUids)}</p>
    <div class="card-actions"><button data-action="open-proposal" data-id="${attr(item.id)}">${tr('의견 보기','View discussion')} →</button>
    ${item.status==='proposed'?`<button class="outline" data-action="confirm" data-id="${attr(item.id)}">${T('confirmPlan')}</button>`:`<button class="outline" data-action="reconsider" data-id="${attr(item.id)}">${T('reconsider')}</button>`}</div></article>`;
}
function comments(items: Id<Comment>[], key: string): string {
  return `<div class="comments">${items.length?items.map(item=>`<div class="comment"><div class="avatar">${esc(name(item.authorUid).slice(0,1))}</div><div><strong>${esc(name(item.authorUid))}</strong><p>${esc(item.text)}</p></div></div>`).join(''):`<p class="muted">${T('empty')}</p>`}
    <form class="comment-form" data-comment-path="${attr(key)}"><input name="text" value="${attr(state.drafts.get(key) || '')}" placeholder="${T('commentPlaceholder')}" maxlength="2000" required /><button type="submit">${T('addComment')}</button></form></div>`;
}
function proposalDetail(): string {
  const item=state.selectedProposalId && proposal(state.selectedProposalId);
  if (!item) return '';
  const agreed=state.agreements.get(item.id) ?? new Set<string>();
  const mine=Boolean(state.user && agreed.has(state.user.uid));
  return `<section class="card detail"><button class="back-link" data-action="close-proposal">← ${T('plans')}</button>
    <div class="detail-heading"><div>${statusPill(item.status)}<h2>${esc(place(item.placeId)?.title || T('unknown'))}</h2><p>${esc(displayDate(item.date))} · ${esc(displayTime(item.time))} · ${who(item.participantUids)}</p></div>
    ${item.status==='proposed'?`<button data-action="edit-proposal" data-id="${attr(item.id)}">${T('editProposal')}</button>`:''}</div>
    <div class="agreement-box"><strong>${T('agreeCount')} ${agreed.size}</strong><p>${agreed.size?who([...agreed]):T('empty')}</p>
    <button class="outline" data-action="agree" data-id="${attr(item.id)}">${mine?T('unagree'):T('agree')}</button></div>
    <h3>${T('comment')}</h3>${comments(state.proposalComments,`proposals/${item.id}/comments`)}
    <div class="detail-actions">${item.status==='proposed'?`<button class="primary" data-action="confirm" data-id="${attr(item.id)}">${T('confirmPlan')}</button>`:`<button class="outline" data-action="reconsider" data-id="${attr(item.id)}">${T('reconsider')}</button>`}
    ${item.visitId?`<button data-action="open-visit" data-id="${attr(item.visitId)}">${T('showAlbum')} →</button>`:''}</div></section>`;
}
function plans(): string {
  const items=[...state.proposals].sort((a,b)=>a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  return `<div class="page-head"><div><span class="kicker">PLAN TOGETHER</span><h1>${T('plans')}</h1><p>${tr('동의는 의견입니다. 가족 누구나 최종일정에 반영할 수 있어요.','Agreement is feedback. Any family member can confirm a plan.')}</p></div><button class="primary" data-action="new-proposal">＋ ${T('addProposal')}</button></div>
    ${proposalDetail()}<div class="plan-grid">${items.length?items.map(planCard).join(''):`<div class="card empty-card">${T('empty')}</div>`}</div>`;
}
function placeCard(item: Id<Place>): string {
  const saved=Boolean(state.user && state.interests.get(item.id)?.has(state.user.uid));
  const count=visitsForPlace(state.visits,item.id).length;
  return `<article class="card place-card"><div class="place-visual"><span>${esc(item.category || 'TOKYO')}</span><strong>${esc(item.title.slice(0,1))}</strong></div><div class="place-content"><div class="place-meta"><span>${esc(item.category || tr('후보','Idea'))}</span><span>${saved?'♥':'♡'} ${state.interests.get(item.id)?.size||0}</span></div>
  <h3>${esc(item.title)}</h3><p>${esc(item.intro || T('seedNote'))}</p><div class="card-actions"><button data-action="open-place" data-id="${attr(item.id)}">${tr('자세히 보기','Explore')} →</button><span class="muted">${T('album')} ${count}</span></div></div></article>`;
}
function infoSection(label: string, value: string): string { return `<div class="detail-field"><h4>${esc(label)}</h4><p>${value?esc(value):`<span class="muted">${T('empty')}</span>`}</p></div>`; }
function placeDetail(): string {
  const item=state.selectedPlaceId && place(state.selectedPlaceId);
  if (!item) return '';
  const saved=Boolean(state.user && state.interests.get(item.id)?.has(state.user.uid));
  const albums=visitsForPlace(state.visits,item.id);
  return `<section class="card detail"><button class="back-link" data-action="close-place">← ${T('places')}</button>
    <div class="detail-heading"><div><span class="kicker">PLACE / ${esc(item.category || 'TOKYO')}</span><h2>${esc(item.title)}</h2></div><div class="inline-actions">
      <button data-action="interest" data-id="${attr(item.id)}">${saved?'♥ '+T('removeInterest'):'♡ '+T('interest')} · ${state.interests.get(item.id)?.size||0}</button>
      <button data-action="edit-place" data-id="${attr(item.id)}">${T('editPlace')}</button></div></div>
    <div class="field-grid">${infoSection(T('intro'),item.intro)}${infoSection(T('notes'),item.visitNotes)}
    <div class="detail-field"><h4>${T('map')}</h4>${link(item.mapUrl,T('map'))}</div><div class="detail-field"><h4>${T('official')}</h4>${link(item.officialUrl,T('official'))}</div>
    ${infoSection(T('reservation'),item.reservationNotes)}${infoSection(T('toConfirm'),item.toConfirm)}</div>
    <div class="detail-actions"><button class="primary" data-action="new-proposal" data-place-id="${attr(item.id)}">＋ ${T('fromPlace')}</button>
      <button data-action="new-past-visit" data-place-id="${attr(item.id)}">＋ ${T('addPastAlbum')}</button></div>
    <h3>${T('album')}</h3><div class="album-list">${albums.length?albums.map(item=>albumRow(item)).join(''):`<p class="muted">${T('noAlbum')}</p>`}</div>
    ${state.selectedVisitId && visit(state.selectedVisitId)?.placeId===item.id?albumDetail():''}
    <h3>${T('comment')}</h3>${comments(state.placeComments,`places/${item.id}/comments`)}</section>`;
}
function places(): string {
  const shown=state.placeFilter==='mine'?state.places.filter(item=>state.user && state.interests.get(item.id)?.has(state.user.uid)):state.places;
  return `<div class="page-head"><div><span class="kicker">PLACES & POSSIBILITIES</span><h1>${T('places')}</h1><p>${T('seedNote')}</p></div><button class="primary" data-action="new-place">＋ ${T('addPlace')}</button></div>
    ${placeDetail()}<div class="filters"><button class="filter ${state.placeFilter==='all'?'active':''}" data-action="place-filter" data-filter="all">${T('filterAll')}</button><button class="filter ${state.placeFilter==='mine'?'active':''}" data-action="place-filter" data-filter="mine">${T('filterMine')}</button></div>
    <div class="place-grid">${shown.length?shown.map(placeCard).join(''):`<div class="card empty-card">${T('empty')} ${state.places.length===0?`<button data-action="seed">${T('seed')}</button>`:''}</div>`}</div>`;
}
function albumRow(item: Id<Visit>): string {
  return `<button class="album-row ${state.selectedVisitId===item.id?'active':''}" data-action="open-visit" data-id="${attr(item.id)}"><span class="album-icon">${item.kind==='past'?'◌':'✦'}</span><span><strong>${esc(item.label)}</strong><small>${item.kind==='past'?T('past'):T('tripAlbum')} · ${esc(place(item.placeId)?.title || T('unknown'))}</small></span><span>→</span></button>`;
}
function albumDetail(): string {
  const item=state.selectedVisitId && visit(state.selectedVisitId);
  if (!item) return '';
  const myPhotos=state.photos.filter(photo=>photo.ownerUid===state.user?.uid);
  const myReview=state.reviews.find(review=>review.authorUid===state.user?.uid);
  return `<section class="album-detail"><div class="album-heading"><div><span class="kicker">${item.kind==='past'?T('past'):T('tripAlbum')}</span><h3>${esc(item.label)}</h3><p>${esc(place(item.placeId)?.title || T('unknown'))}</p></div><button data-action="export-reviews">${T('exportReviews')}</button></div>
    <div class="photo-toolbar"><div><h4>${T('photo')} ${state.photos.length}</h4><p>${T('photoRule')}</p><small>${esc(name(state.user?.uid||''))}: ${myPhotos.length}/20</small></div>
      <label class="upload-button ${myPhotos.length>=20?'disabled':''}">＋ ${T('upload')}<input id="photo-input" type="file" accept="image/*,.heic,.heif" multiple ${myPhotos.length>=20?'disabled':''} /></label></div>
    <div class="photo-grid">${state.photos.length?state.photos.map((photo,index)=>`<div class="photo-card"><div class="photo-frame" data-photo-preview="${attr(photo.id)}">
      ${index<8 && previewUrls.has(photo.id) && !photo.contentType.includes('hei')?`<img src="${attr(previewUrls.get(photo.id))}" alt="${attr(photo.originalName)}" />`:`<span>📷<small>${index<8?T('loading'):T('pngUnavailable')}</small></span>`}</div>
      <div class="photo-caption"><strong>${esc(photo.originalName)}</strong><small>${esc(name(photo.ownerUid))} · ${(photo.size/1024/1024).toFixed(1)} MB</small></div>
      <div class="photo-actions"><button data-action="download-photo" data-id="${attr(photo.id)}">↓ ${T('download')}</button>${photo.ownerUid===state.user?.uid?`<button class="danger" data-action="delete-photo" data-id="${attr(photo.id)}">${T('deletePhoto')}</button>`:''}</div></div>`).join(''):`<p class="muted">${T('noPhoto')}</p>`}</div>
    <h4>${T('review')}</h4><div class="review-list">${state.reviews.length?state.reviews.map(review=>`<div class="review"><strong>${esc(name(review.authorUid))}</strong><p>${esc(review.text)}</p></div>`).join(''):`<p class="muted">${T('empty')}</p>`}</div>
    <button data-action="edit-review">${myReview?tr('내 후기 수정','Edit my review'):tr('내 후기 작성','Write my review')}</button>
    <h4>${T('albumComments')}</h4>${comments(state.albumComments,`visits/${item.id}/comments`)}</section>`;
}
function memories(): string {
  const current=state.visits.filter(item=>item.kind==='trip').sort((a,b)=>a.label.localeCompare(b.label));
  const past=state.visits.filter(item=>item.kind==='past').sort((a,b)=>b.year.localeCompare(a.year));
  return `<div class="page-head"><div><span class="kicker">MEMORIES TO KEEP</span><h1>${T('memories')}</h1><p>${tr('한 장소의 과거와 이번 여행을 별도 방문 앨범으로 남겨요.','Keep past and current visits to one place in separate albums.')}</p></div></div>
    <div class="memories-layout"><div class="card album-sidebar"><h2>${T('tripAlbum')}</h2>${current.length?current.map(albumRow).join(''):`<p class="muted">${T('noAlbum')}</p>`}
      <h2>${T('past')}</h2>${past.length?past.map(albumRow).join(''):`<p class="muted">${T('noAlbum')}</p>`}</div>
      <div class="card memories-main">${state.selectedVisitId?albumDetail():`<div class="album-placeholder"><span>◌</span><h2>${T('album')}</h2><p>${tr('왼쪽에서 앨범을 선택하세요. 과거 방문 앨범은 장소 카드에서 만들 수 있습니다.','Choose an album. Create a past visit album from a place card.')}</p></div>`}</div></div>`;
}
function render(): void {
  if (state.loading) { root.innerHTML=`<div class="center-loading">${T('loading')}</div>`; return; }
  if (!services) { root.innerHTML=`<div class="language-corner"><button data-action="locale">${state.locale==='ko'?'EN':'한국어'}</button></div>${setupScreen()}`; return; }
  if (!state.user) { root.innerHTML=`${emulatorBanner()}<div class="language-corner"><button data-action="locale">${state.locale==='ko'?'EN':'한국어'}</button></div>${loginScreen()}${state.error?`<div class="toast error">${esc(state.error)}</div>`:''}`; return; }
  if (!state.member) { root.innerHTML=`${header()}${deniedScreen()}${state.error?`<div class="toast error">${esc(state.error)}</div>`:''}`; return; }
  root.innerHTML=`${header()}<main class="main">${state.tab==='home'?home():state.tab==='plans'?plans():state.tab==='places'?places():memories()}</main>
    ${state.busy?`<div class="busy-banner">${T('busy')}</div>`:''}${state.error?`<div class="toast error" role="alert">${esc(state.error)} <button data-action="dismiss-error">×</button></div>`:''}
    ${state.notice?`<div class="toast" role="status">${esc(state.notice)} <button data-action="dismiss-notice">×</button></div>`:''}`;
  void hydratePhotoPreviews();
}
async function hydratePhotoPreviews(): Promise<void> {
  if (!services || !state.selectedVisitId) return;
  for (const photo of state.photos.slice(0,8)) {
    if (photo.contentType.includes('hei') || previewUrls.has(photo.id) || previewPending.has(photo.id)) continue;
    const selectedId: string=state.selectedVisitId;
    previewPending.add(photo.id);
    try {
      const blob=await getPhotoBlob(services.storage,photo);
      const url=URL.createObjectURL(blob); previewUrls.set(photo.id,url);
      if (selectedId!==state.selectedVisitId) continue;
      const container=root.querySelector(`[data-photo-preview="${CSS.escape(photo.id)}"]`);
      if (container) container.innerHTML=`<img src="${attr(url)}" alt="${attr(photo.originalName)}" />`;
    } catch { /* Original remains downloadable even when preview cannot load. */ }
    finally { previewPending.delete(photo.id); }
  }
}
function showTab(tab: Tab): void { state.tab=tab; state.error=''; render(); window.scrollTo(0,0); }
function selectPlace(id: string): void { state.selectedPlaceId=id; state.selectedVisitId=null; state.tab='places'; watchDetails(); window.scrollTo(0,0); }
function selectProposal(id: string): void { state.selectedProposalId=id; state.tab='plans'; watchDetails(); window.scrollTo(0,0); }
function selectVisit(id: string): void { state.selectedVisitId=id; if (state.tab!=='places') state.tab='memories'; watchDetails(); window.scrollTo(0,0); }
function notice(message: string): void { state.notice=message; state.error=''; render(); }
async function action(job: () => Promise<void>, success?: string): Promise<void> {
  if (state.busy) return;
  state.busy=true; state.error=''; render();
  try { await job(); if (success) state.notice=success; }
  catch (error) { state.error=error instanceof Error?error.message:String(error); }
  finally { state.busy=false; render(); }
}
function modal(body: string, onSubmit: (form: HTMLFormElement) => Promise<void>): void {
  modalRoot.innerHTML=`<div class="modal-backdrop"><div class="modal" role="dialog" aria-modal="true"><button type="button" class="modal-close" data-modal-close aria-label="${T('close')}">×</button><form class="modal-form">${body}<div class="modal-actions"><button type="button" data-modal-close>${T('cancel')}</button><button type="submit" class="primary">${T('save')}</button></div></form></div></div>`;
  modalRoot.querySelectorAll('[data-modal-close]').forEach(button=>button.addEventListener('click',()=>modalRoot.innerHTML=''));
  modalRoot.querySelector<HTMLFormElement>('form')!.addEventListener('submit',event=>{
    event.preventDefault();
    const form=event.currentTarget as HTMLFormElement;
    void action(async()=>{ await onSubmit(form); modalRoot.innerHTML=''; });
  });
}
function input(label: string, field: string, value='', extra=''): string {
  return `<label>${esc(label)}<input name="${field}" value="${attr(value)}" ${extra} /></label>`;
}
function textarea(label: string, field: string, value=''): string { return `<label>${esc(label)}<textarea name="${field}" rows="3">${esc(value)}</textarea></label>`; }
function formText(form: HTMLFormElement, field: string): string { return String(new FormData(form).get(field) || '').trim(); }
function tripInfoModal(): void {
  const info=state.tripInfo;
  modal(`<span class="kicker">TRAVEL NOTES</span><h2>${T('bookings')}</h2>
    <p class="muted">${tr('확인된 내용만 입력하세요. 모르는 항목은 비워 두면 미확인으로 표시됩니다.','Enter only confirmed details. Leave unknown items blank.')}</p>
    ${input(tr('12/17 진혁·연화 입국편','17 Dec Jinhyeok & Yeonhwa arrival'),'arrivalFlight',info?.arrivalFlight||'','maxlength="300"')}
    ${input(tr('12/21 진혁·연화 귀국편','21 Dec Jinhyeok & Yeonhwa return'),'coupleReturnFlight',info?.coupleReturnFlight||'','maxlength="300"')}
    ${input(tr('12/22 민성·소피 귀국편','22 Dec Minseong & Sophie return'),'youngerReturnFlight',info?.youngerReturnFlight||'','maxlength="300"')}
    ${input(tr('12/17–21 가족 숙소','17–21 Dec family stay'),'mainStay',info?.mainStay||'','maxlength="300"')}
    ${input(tr('12/21–22 추가 숙소','21–22 Dec extra stay'),'extraStay',info?.extraStay||'','maxlength="300"')}`,async form=>{
    if (!services) return;
    const fields:TripInfoFields={arrivalFlight:formText(form,'arrivalFlight'),coupleReturnFlight:formText(form,'coupleReturnFlight'),youngerReturnFlight:formText(form,'youngerReturnFlight'),mainStay:formText(form,'mainStay'),extraStay:formText(form,'extraStay')};
    await saveTripInfo(services.db,fields);
  });
}
function placeModal(item?: Id<Place>): void {
  modal(`<span class="kicker">PLACE</span><h2>${item?T('editPlace'):T('addPlace')}</h2>
    ${input(tr('장소 이름','Place name'),'title',item?.title||'','required maxlength="120"')}
    ${input(tr('분류','Category'),'category',item?.category||'','maxlength="50"')}
    ${textarea(T('intro'),'intro',item?.intro||'')}
    ${input(T('map'),'mapUrl',item?.mapUrl||'','type="url" maxlength="600"')}
    ${input(T('official'),'officialUrl',item?.officialUrl||'','type="url" maxlength="600"')}
    ${textarea(T('notes'),'visitNotes',item?.visitNotes||'')}
    ${textarea(T('reservation'),'reservationNotes',item?.reservationNotes||'')}
    ${textarea(T('toConfirm'),'toConfirm',item?.toConfirm||'')}`,async form=>{
    if (!services || !state.user) return;
    const fields:PlaceFields={title:formText(form,'title'),category:formText(form,'category'),intro:formText(form,'intro'),mapUrl:formText(form,'mapUrl'),officialUrl:formText(form,'officialUrl'),visitNotes:formText(form,'visitNotes'),reservationNotes:formText(form,'reservationNotes'),toConfirm:formText(form,'toConfirm')};
    const id=await savePlace(services.db,state.user.uid,fields,item?.id); selectPlace(id);
  });
}
function proposalModal(preselectedPlaceId?: string, item?: Id<Proposal>): void {
  const date=item?.date||'2026-12-18';
  const chosen=item?.participantUids||membersForDate(date,state.members).map(member=>member.id);
  modal(`<span class="kicker">PLAN</span><h2>${item?T('editProposal'):T('addProposal')}</h2>
    <label>${T('choosePlace')}<select name="placeId" ${item?'disabled':''} required><option value="">—</option>${state.places.map(p=>`<option value="${attr(p.id)}" ${p.id===(item?.placeId||preselectedPlaceId)?'selected':''}>${esc(p.title)}</option>`).join('')}</select></label>
    ${input(T('date'),'date',date,`type="date" min="2026-12-17" max="2026-12-22" required`)}
    ${input(T('time'),'time',item?.time||'','type="time"')}
    <fieldset><legend>${T('participants')}</legend><div class="checkbox-grid">${state.members.map(member=>`<label><input type="checkbox" name="participants" value="${attr(member.id)}" data-key="${attr(member.nameKey)}" ${chosen.includes(member.id)?'checked':''} />${esc(member.displayName)}</label>`).join('')}</div></fieldset>`,async form=>{
    if (!services || !state.user) return;
    const date=formText(form,'date');
    const participants=Array.from(form.querySelectorAll<HTMLInputElement>('input[name="participants"]:checked')).map(input=>input.value);
    const fields:ProposalFields={placeId:item?.placeId||formText(form,'placeId'),date,time:formText(form,'time'),participantUids:participants};
    if (date==='2026-12-22' && participants.some(uid=>['jinhyeok','yeonhwa'].includes(state.members.find(m=>m.id===uid)?.nameKey||''))) throw new Error(tr('12월 22일은 민성·소피만 참여할 수 있습니다.','Only Minseong and Sophie can be selected on 22 Dec.'));
    const id=await saveProposal(services.db,state.user.uid,fields,item?.id); selectProposal(id);
  });
  const form=modalRoot.querySelector<HTMLFormElement>('form')!;
  form.querySelector<HTMLInputElement>('input[name="date"]')?.addEventListener('change',event=>{
    const late=(event.target as HTMLInputElement).value==='2026-12-22';
    form.querySelectorAll<HTMLInputElement>('input[name="participants"]').forEach(box=>{
      if (['jinhyeok','yeonhwa'].includes(box.dataset.key||'')) { box.disabled=late; if (late) box.checked=false; }
    });
  });
}
function pastVisitModal(placeId: string): void {
  modal(`<span class="kicker">MEMORY</span><h2>${T('addPastAlbum')}</h2>${input(T('albumTitle'),'label','','required maxlength="160"')}${input(T('year'),'year','','inputmode="numeric" pattern="[0-9]{4}" maxlength="4"')}
    <p class="muted">${tr('과거 방문 사실은 직접 확인한 뒤 입력해 주세요.','Add only a past visit you know happened.')}</p>`,async form=>{
    if (!services || !state.user) return;
    const id=await createPastVisit(services.db,state.user.uid,placeId,formText(form,'label'),formText(form,'year'));
    selectVisit(id);
  });
}
function reviewModal(): void {
  const item=state.reviews.find(review=>review.authorUid===state.user?.uid);
  modal(`<span class="kicker">MEMORY</span><h2>${T('myReview')}</h2>${textarea(T('review'),'text',item?.text||'')}
    <p class="muted">${tr('빈 칸으로 저장하면 내 후기가 삭제됩니다.','Save an empty field to remove your review.')}</p>`,async form=>{
    if (!services || !state.user || !state.selectedVisitId) return;
    await saveReview(services.db,state.selectedVisitId,state.user.uid,formText(form,'text'));
  });
}
function exportReviews(): void {
  const item=state.selectedVisitId && visit(state.selectedVisitId); if (!item) return;
  const contents={album:item.label,place:place(item.placeId)?.title||'',kind:item.kind,exportedAt:new Date().toISOString(),reviews:state.reviews.map(review=>({author:name(review.authorUid),text:review.text,updatedAt:review.updatedAt?.toDate?.()?.toISOString?.()||null}))};
  const blob=new Blob([JSON.stringify(contents,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=`tokyo-together-reviews-${item.id}.json`;document.body.append(link);link.click();link.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),60_000);
}
root.addEventListener('click',event=>{
  const target=(event.target as Element).closest<HTMLElement>('[data-action]'); if (!target) return;
  const key=target.dataset.action, id=target.dataset.id||'';
  if (key==='locale') { state.locale=state.locale==='ko'?'en':'ko';rememberLocale(state.locale);render();return; }
  if (key==='dismiss-error') { state.error='';render();return; }
  if (key==='dismiss-notice') { state.notice='';render();return; }
  if (key==='tab') { showTab(target.dataset.tab as Tab);return; }
  if (key==='signout' && services) { void signOut(services.auth);return; }
  if (!services || !state.member || !state.user) return;
  switch (key) {
    case 'edit-trip-info': tripInfoModal();break;
    case 'new-place': placeModal(); break;
    case 'edit-place': placeModal(place(id)); break;
    case 'open-place': selectPlace(id); break;
    case 'close-place': state.selectedPlaceId=null;state.selectedVisitId=null;watchDetails();break;
    case 'new-proposal': proposalModal(target.dataset.placeId); break;
    case 'edit-proposal': proposalModal(undefined,proposal(id));break;
    case 'open-proposal': selectProposal(id);break;
    case 'close-proposal': state.selectedProposalId=null;watchDetails();break;
    case 'open-visit': selectVisit(id);break;
    case 'new-past-visit': pastVisitModal(target.dataset.placeId||'');break;
    case 'edit-review': reviewModal();break;
    case 'export-reviews': exportReviews();break;
    case 'place-filter': state.placeFilter=target.dataset.filter==='mine'?'mine':'all';render();break;
    case 'seed': void action(()=>seedPlaces(services.db,state.user!.uid));break;
    case 'interest': void action(()=>toggleInterest(services.db,id,state.user!.uid,Boolean(state.interests.get(id)?.has(state.user!.uid))));break;
    case 'agree': void action(()=>toggleAgreement(services.db,id,state.user!.uid,Boolean(state.agreements.get(id)?.has(state.user!.uid))));break;
    case 'confirm': void action(async()=>{ const visitId=await setProposalStatus(services.functions,id,'confirmed'); state.selectedProposalId=id; if (visitId) state.selectedVisitId=visitId;watchDetails(); });break;
    case 'reconsider': void action(async()=>{ await setProposalStatus(services.functions,id,'proposed');state.selectedProposalId=id;watchDetails(); });break;
    case 'download-photo': { const photo=state.photos.find(x=>x.id===id);if(photo)void action(()=>downloadPhoto(services.storage,photo));break; }
    case 'delete-photo': { const photo=state.photos.find(x=>x.id===id);if(photo && photo.ownerUid===state.user.uid && window.confirm(T('deleteConfirm')))
      void action(()=>deleteOwnPhoto(services.functions,state.selectedVisitId!,id));break; }
  }
});
root.addEventListener('submit',event=>{
  const form=event.target as HTMLFormElement;
  if (form.id==='login-form' && services) {
    event.preventDefault();void action(async()=>{ await signInWithEmailAndPassword(services.auth,formText(form,'email'),formText(form,'password')); });return;
  }
  if (form.classList.contains('comment-form') && services && state.user) {
    event.preventDefault();const path=form.dataset.commentPath||'';const text=formText(form,'text');
    void action(async()=>{ await addComment(services.db,path,state.user!.uid,text);state.drafts.delete(path); });
  }
});
root.addEventListener('input',event=>{
  const form=(event.target as Element).closest<HTMLFormElement>('.comment-form');
  if (form) state.drafts.set(form.dataset.commentPath||'',(event.target as HTMLInputElement).value);
});
root.addEventListener('change',event=>{
  const input=event.target as HTMLInputElement;
  if (input.id!=='photo-input' || !services || !state.selectedVisitId) return;
  const files=Array.from(input.files||[]);const visitId=state.selectedVisitId;
  if (!files.length) return;
  if (state.photos.filter(photo=>photo.ownerUid===state.user?.uid).length+files.length>20) {
    state.error=tr('이 앨범에서 내 사진은 최대 20장입니다.','You can upload at most 20 of your own photos to this visit.');render();return;
  }
  void action(async()=>{
    for (const file of files) await uploadPhoto(services,visitId,file);
  },tr('원본 사진 업로드를 마쳤습니다.','Original photos uploaded.'));
});
