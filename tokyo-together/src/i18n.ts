export type Locale = 'ko' | 'en';
export function initialLocale(): Locale {
  try { return localStorage.getItem('tokyoTogether.locale') === 'en' ? 'en' : 'ko'; } catch { return 'ko'; }
}
export function rememberLocale(locale: Locale): void {
  try { localStorage.setItem('tokyoTogether.locale', locale); } catch { /* Preference is optional. */ }
}
const strings = {
  home: ['홈', 'Home'], plans: ['일정 만들기', 'Plans'], places: ['장소', 'Places'], memories: ['추억', 'Memories'],
  subtitle: ['함께 만들고, 함께 기억하는 도쿄 여행', 'Plan together, remember together'],
  tripDates: ['2026년 12월 17일–22일', '17–22 December 2026'],
  setupTitle: ['Firebase 연결이 필요해요', 'Firebase setup needed'],
  setupBody: ['현재 공동 저장은 연결되지 않았습니다. Firebase 프로젝트 정보를 .env.local에 넣고 다시 실행하세요. 로컬 체험 데이터를 가족 공유 데이터처럼 표시하지 않습니다.', 'Shared storage is not connected. Add your Firebase project settings to .env.local and restart. No local data is presented as shared family data.'],
  signedOut: ['가족 계정으로 로그인', 'Sign in with your family account'],
  email: ['이메일', 'Email'], password: ['비밀번호', 'Password'], signIn: ['로그인', 'Sign in'], signOut: ['로그아웃', 'Sign out'],
  notMember: ['로그인은 됐지만 이 여행의 가족 계정으로 등록되지 않았습니다. 관리자에게 계정 UID 등록을 요청하세요.', 'Signed in, but this account is not registered for this family trip. Ask the project owner to add your account UID.'],
  live: ['Firebase 프로젝트 설정됨', 'Firebase project configured'], emulator: ['로컬 Firebase 에뮬레이터 · 실제 가족 공유 아님', 'Local Firebase emulator · not shared with family'],
  proposed: ['검토 중', 'Proposed'], confirmed: ['확정', 'Confirmed'], timeOpen: ['시간 미정', 'Time undecided'],
  empty: ['아직 정해지지 않았어요', 'Nothing decided yet'], homeIntro: ['함께 채우는 여행', 'A trip we fill together'],
  homeConfirmed: ['확정 일정', 'Confirmed plans'], homeIdeas: ['검토 중인 제안', 'Ideas under review'], openItems: ['확인할 사항', 'Things to confirm'], bookings: ['항공·숙소', 'Flights & stays'],
  unknown: ['미확인', 'Unconfirmed'], needsCheck: ['예약메일 대조 필요', 'Check booking email'],
  addProposal: ['일정 제안', 'Propose a plan'], editProposal: ['일정 수정', 'Edit plan'], addPlace: ['장소 추가', 'Add place'], editPlace: ['장소 수정', 'Edit place'],
  choosePlace: ['장소 선택', 'Choose a place'], date: ['날짜', 'Date'], time: ['시간 (선택)', 'Time (optional)'], participants: ['참여자', 'Participants'],
  save: ['저장', 'Save'], cancel: ['취소', 'Cancel'], close: ['닫기', 'Close'],
  agree: ['동의 표시', 'Agree'], unagree: ['동의 취소', 'Remove agreement'], agreeCount: ['동의', 'Agreements'],
  confirmPlan: ['최종일정에 반영', 'Add to final plan'], reconsider: ['다시 검토', 'Move back to review'],
  comment: ['댓글', 'Comments'], addComment: ['댓글 남기기', 'Post comment'], commentPlaceholder: ['의견을 적어 주세요', 'Share a thought'],
  interest: ['관심 장소', 'Save interest'], removeInterest: ['관심 해제', 'Remove interest'],
  intro: ['소개', 'Introduction'], map: ['지도', 'Map'], official: ['공식 사이트', 'Official site'], notes: ['방문 메모', 'Visit notes'],
  reservation: ['예약 관련 정보', 'Reservation information'], toConfirm: ['확인할 사항', 'To confirm'],
  album: ['방문 앨범', 'Visit albums'], pastAlbum: ['과거 방문 앨범', 'Past visit album'], addPastAlbum: ['과거 방문 앨범 만들기', 'Create past visit album'],
  albumTitle: ['앨범 이름', 'Album name'], year: ['방문 연도 (선택)', 'Visit year (optional)'], tripAlbum: ['이번 여행', 'This trip'], past: ['과거 여행', 'Past trip'],
  photo: ['사진', 'Photos'], upload: ['원본 사진 올리기', 'Upload original photos'], download: ['원본 다운로드', 'Download original'], deletePhoto: ['내 사진 삭제', 'Delete my photo'],
  photoRule: ['한 사람 · 한 장소 · 한 방문당 최대 20장. 원본 그대로 저장하며 파일당 최대 25MB입니다. HEIC는 업로드·다운로드되지만 기기에 따라 미리보기가 안 될 수 있습니다.', 'Up to 20 photos per person, place and visit. Originals are kept, up to 25 MB each. HEIC can be uploaded and downloaded, but previews may vary by device.'],
  review: ['짧은 후기', 'Short reviews'], myReview: ['내 후기', 'My review'], exportReviews: ['후기 JSON 내보내기', 'Export reviews as JSON'],
  albumComments: ['앨범 댓글', 'Album comments'], loading: ['불러오는 중…', 'Loading…'], busy: ['처리 중…', 'Working…'],
  seed: ['관심 후보 카드 넣기', 'Add starter idea cards'], seedNote: ['후보일 뿐 방문 확정이나 과거 방문 기록이 아닙니다.', 'These are ideas, not confirmed plans or past visits.'],
  noAlbum: ['아직 앨범이 없습니다.', 'No albums yet.'], noPhoto: ['아직 사진이 없습니다.', 'No photos yet.'],
  retry: ['다시 시도', 'Try again'], error: ['오류가 발생했습니다', 'Something went wrong'],
  departure: ['귀국', 'Return flight'], allFamily: ['가족 모두', 'All family'],
  filterAll: ['전체', 'All'], filterMine: ['내 관심 장소', 'My saved places'],
  showAlbum: ['앨범 보기', 'View album'], fromPlace: ['이 장소로 일정 제안', 'Propose this place'],
  fieldRequired: ['필수 항목을 입력해 주세요.', 'Please complete the required fields.'],
  website: ['웹사이트', 'Website'], copy: ['복사', 'Copy'], noLink: ['링크 미입력', 'No link added'],
  deleteConfirm: ['이 사진을 삭제할까요? 삭제 후 다시 올릴 수 있습니다.', 'Delete this photo? The space will become available again.'],
  pngUnavailable: ['이 기기에서 미리보기를 지원하지 않을 수 있어요. 원본은 다운로드할 수 있습니다.', 'Preview may not be supported here. You can still download the original.'],
} as const;
export type TextKey = keyof typeof strings;
export function t(key: TextKey, locale: Locale): string { return strings[key][locale === 'ko' ? 0 : 1]; }
