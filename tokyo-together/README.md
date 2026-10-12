# Tokyo Together

2026년 12월 17–22일 도쿄 여행을 위한 가족 공동 계획·사진 웹앱입니다. **2026년 10월 12일 `tokyo-together-57264` 프로젝트에 보안 규칙, 함수 7개, 웹 화면을 배포했습니다.** 주소는 [tokyo-together-57264.web.app](https://tokyo-together-57264.web.app/)입니다. 여행자 네 명과 가족 참여자 소은의 Authentication 계정 및 `members` 문서를 연결했고, 확인된 항공편과 확인 필요로 표시한 숙소 요약을 `tripInfo/summary`에 입력했습니다. 소피 계정으로 로그인한 홈 화면과 저장된 여행 정보의 읽기를 확인했습니다. 소은 계정 자체의 로그인과 두 계정 간 공동 편집·사진 업로드는 아직 실서비스에서 검증하지 못했습니다. `.env.local`은 로컬 설정으로만 보관합니다. 로컬 에뮬레이터 데이터는 다른 기기와 공유되지 않습니다.

## 구현 범위

- 4개 탭: 홈, 일정 만들기, 장소, 추억. 한국어/영어 화면 전환.
- 12월 21일/22일 귀국 차이와 숙소·항공 미확인 사항 표시. 확인된 항공편과 숙소 이름은 로그인 뒤 홈의 **정보 수정**에서 입력하며 Firestore에 저장합니다. 공개 정적 파일에는 넣지 않았습니다.
- 장소 후보 30개(맛집 15, 볼거리 5, 쇼핑 5, 즐길거리 5). 맛집은 아침 3, 점심 4, 저녁 4, 카페·디저트 4개입니다. 후보는 날짜나 확정 일정이 아닙니다. 테마·식사 분류·이름/지역 필터, 상세 정보, 지도 검색과 참고 링크를 제공합니다.
- 가족 누구나 장소를 추가·수정할 수 있습니다. 장소 보관·복원은 해당 장소를 추가한 계정 또는 진혁 계정만 할 수 있습니다. 보관 전에 연결된 일정·댓글·앨범·사진·후기 수를 보여주고, 보관해도 연결 기록은 남습니다. 보관된 장소는 일반 목록과 새 일정 제안 선택에서 제외됩니다. 기존에 가져온 후보 장소는 진혁 계정만 보관·복원할 수 있습니다.
- 장소 카드와 관심 표시, 장소·일정·앨범 댓글, 일정 제안/동의/최종 반영/재검토. 동의는 의견으로만 표시합니다. 댓글과 방문 후기는 작성자 또는 진혁 계정만 삭제할 수 있으며 Firestore 규칙에서도 확인합니다. 장소는 기록 보존을 위해 영구 삭제 대신 보관합니다.
- 검토 중인 일정 제안은 가족 누구나 **이번에는 미반영**으로 내려 접이식 목록에 보관할 수 있습니다. 날짜·시간을 고쳐 다시 검토하거나 미반영 목록에서 바로 최종일정에 반영할 수 있습니다. 제안 삭제는 작성자 또는 진혁 계정만 가능하며, 삭제된 제안은 별도 접이식 목록으로 이동하고 같은 권한으로 복구할 수 있습니다. 확정된 일정은 먼저 다시 검토 상태로 바꿔야 미반영·삭제할 수 있습니다. 이 과정에서 기존 의견·댓글과 생성된 방문 앨범·사진은 보존됩니다.
- 장소 추가는 선택 사항으로 표시합니다. 장소 카드에는 확인할 사항, 추가정보와 최대 8개의 제목·URL 링크를 저장할 수 있고, 방문 메모는 방문 후 작성하도록 맨 아래에 둡니다. 기존 지도·공식 사이트·예약 메모가 있는 카드는 편집 전까지 추가정보에 표시하며, 편집하면 새 형식으로 저장합니다.
- 과거 방문 앨범과 일정 확정 시 생성되는 이번 방문 앨범. 장소 상세와 추억 탭이 같은 `visits/{visitId}` 및 사진 데이터를 읽습니다. 같은 제안을 여러 번 확정해도 방문 ID와 앨범은 그대로입니다.
- 개인별 후기 수정, 원본 사진 개별 다운로드, 앨범별 후기 JSON 내보내기.
- Firebase Authentication 계정과 `members/{UID}`에 연결된 가족만 Firestore와 Storage에 접근. 소은은 여행 동행자가 아닌 가족 참여자로서 장소·일정 제안·동의·댓글·앨범·사진을 함께 이용할 수 있지만 날짜별 여행자나 일정의 방문 참여자에는 들어가지 않습니다. 사진은 서버의 Firestore 트랜잭션으로 **방문 ID × 계정당 최대 20장**을 예약·확정합니다. 다른 사람이 올린 사진 삭제는 서버에서 거부합니다.

앨범 전체 ZIP 다운로드는 아직 없습니다. 사진은 개별 다운로드해 주세요. 댓글 자동 번역과 여행기 자동 생성도 없습니다.

## 가족 계정 연결 및 다른 프로젝트에 재배포하기

이 단계는 프로젝트 소유자가 Firebase Console에서 직접 해야 합니다. **Blaze 요금제와 결제 계정 연결이 필요합니다.** Cloud Storage for Firebase는 현재 Blaze가 필요하며, 이 앱은 Cloud Functions도 사용합니다. Blaze에는 일부 무료 사용량이 있지만 실제 이용량에 따라 요금이 생길 수 있습니다. [Storage 요금제 변경](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024), [Firebase 요금](https://firebase.google.com/pricing).

1. [Firebase Console](https://console.firebase.google.com/)에서 새 프로젝트를 만듭니다. 다른 앱과 분리된 프로젝트를 권장합니다. 요금제를 확인하고 Blaze/결제 계정을 연결한 뒤 예산 알림을 설정합니다. 예산 알림은 지출 차단 기능이 아닙니다.
2. **Authentication → Sign-in method**에서 Email/Password를 사용 설정합니다. **Firestore Database**를 만들고 **Storage** 기본 버킷을 만듭니다. Cloud Functions 배포에도 Blaze가 필요합니다. 실제 위치와 과금 조건은 콘솔에서 확인하세요.
3. **Project settings → Your apps**에서 웹앱을 등록하고 웹 설정 값을 확인합니다. `cp .env.example .env.local` 후 `VITE_FIREBASE_*` 값을 채우고 `VITE_USE_EMULATORS=false`로 둡니다. 웹 설정 값은 비밀번호가 아니지만, 관리자 서비스 계정 키나 가족 비밀번호를 코드·환경 파일에 넣지 마세요.
4. `cp functions/.env.example functions/.env` 후 `TOKYO_STORAGE_BUCKET`을 실제 기본 버킷명으로 바꿉니다. 예: `프로젝트ID.firebasestorage.app`. `.env.local`과 `functions/.env`는 Git에서 제외됩니다.
5. Node.js 22와 npm을 설치한 뒤 이 폴더에서 `npm install`, `npm --prefix functions install`, `npm run build`, `npm --prefix functions run build`를 실행합니다. `npx firebase login`, `npx firebase use --add`로 방금 만든 프로젝트를 선택한 뒤 `npm run deploy`로 규칙·함수·호스팅을 배포합니다. 배포 스크립트가 데모 설정과 프로젝트·버킷 불일치를 검사합니다. 프로젝트 ID가 설정되지 않은 상태에서 배포하지 마세요. `firebase.json`은 Hosting에 `dist/`를 게시합니다.
6. Firebase Console **Authentication → Users**에서 가족의 이메일 계정을 만듭니다. 가족에게 각자의 로그인 정보만 전달하고 임시 비밀번호는 별도 안전한 방법으로 바꾸도록 안내합니다. 앱 화면에서는 임의 가입이나 가족 이름 선택을 허용하지 않습니다.
7. 생성된 각 사용자의 **UID**를 복사해 Firestore에 `members/{UID}` 문서를 직접 만듭니다. 각 문서 필드는 `nameKey`(문자열), `displayName`(문자열), `email`(문자열)입니다. 여행자 네 명과 가족 참여자 소은의 문서는 다음과 같습니다:

   | 사람 | `nameKey` | `displayName` |
   | --- | --- | --- |
   | 진혁 | `jinhyeok` | `진혁` |
   | 연화 | `yeonhwa` | `연화` |
   | 민성 | `minseong` | `민성` |
   | 소피 | `sophie` | `Sophie` |
   | 소은 | `soeun` | `소은` |

   `email`은 해당 Authentication 계정의 이메일로 입력합니다. `members` 문서는 관리자만 만들 수 있고 앱 사용자는 수정할 수 없습니다. UID를 잘못 연결하면 의도한 사람이 접근하지 못하거나 다른 사람이 그 가족으로 표시될 수 있으므로 계정을 대조해 주세요. 소은의 계정은 로그인과 공동 편집 권한이 있지만 여행 날짜별 참가자에 포함되지 않습니다.
8. 원본 다운로드/미리보기에 `getBlob()`을 쓰므로 **Storage CORS**를 설정합니다. 현재 프로젝트에는 `web.app`과 `firebaseapp.com`의 두 Hosting 출처, GET, Content-Type, 3600초가 적용됐습니다. 다른 프로젝트에서는 Google Cloud Console의 **버킷 → 구성 → 교차 출처 리소스 공유**에서 같은 항목을 입력하거나 `storage.cors.example.json`의 `YOUR_PROJECT_ID`를 바꿔 `gcloud storage buckets update gs://실제버킷명 --cors-file=storage.cors.example.json`을 실행합니다. CORS는 브라우저 허용 출처 설정이며, 접근 권한은 Storage Rules가 검사합니다. [Firebase 원본 다운로드 안내](https://firebase.google.com/docs/storage/web/download-files), [Google Cloud CORS 설정](https://docs.cloud.google.com/storage/docs/using-cors).
9. 다른 프로젝트에서는 가족 계정으로 로그인한 뒤 홈의 **항공·숙소 → 정보 수정**에서 확인된 항공편 2개와 임시 숙소 정보를 입력합니다. 현재 프로젝트에는 이미 입력했습니다. 민성·소피 항공편과 추가 숙소처럼 모르는 항목은 비워 두세요. 앱은 `tripInfo/summary`에 저장하고 가족 계정에만 읽기를 허용합니다. 숙소 이름과 예약 조건은 예약메일을 대조하기 전까지 화면에서도 확인 필요로 표시됩니다.
10. 두 계정으로 각각 로그인해 장소·댓글·사진 변경이 실시간으로 보이는지 확인합니다. 회원이 아닌 계정에서 접근 거부, 타인 사진 삭제 거부도 확인한 뒤 가족에게 링크를 공유하세요. 실제 기기에서 iPhone HEIC 업로드와 원본 다운로드를 한 번 확인하는 것이 좋습니다.

현재 프로젝트는 여행자 네 계정과 소은 계정의 UID 연결을 마쳤습니다. 소은 계정으로 실제 로그인하고 장소·일정의 읽기와 댓글 저장을 확인하기 전까지 새 계정의 사용 검증이 끝난 상태로 판단하지 마세요. 두 계정으로 실제 공동 저장도 아직 확인해야 합니다.

2026년 10월 12일, 인증 정보 없이 `tripInfo/summary`를 읽는 실서비스 요청은 `403 PERMISSION_DENIED`로 거부됐습니다. 소피 계정의 화면에서는 항공·숙소, 네 가족 이름, 후보 장소 7개가 표시됐고 네 탭과 한영 전환이 동작했습니다. 디즈니랜드 관심 표시를 저장한 뒤 새로고침해 유지되는 것을 확인하고 원래의 관심 없음 상태로 되돌렸습니다. 브라우저에서 844×390과 1024×768 크기의 가로 넘침이 없음을 확인했습니다. 실제 기기 사용성, 두 계정 간 동기화, 사진 업로드·다운로드는 별도로 확인해야 합니다.

장소 입력 화면 변경 후 소피 계정에서 URL이 있는 임시 장소의 저장·표시를 확인하고 해당 임시 카드를 삭제했습니다. 390×844 화면에서 URL 입력과 저장 버튼까지 가로 넘침 없이 접근할 수 있었습니다. 이전 변경의 단위 테스트 4개, TypeScript 검사, 빌드는 통과했습니다. 이 환경에 Java 런타임이 없어 Firestore 에뮬레이터 통합 테스트는 실행하지 못했습니다.

### 2026-10-12 장소 목록 교체

`data/place-catalog.json`은 30개 후보의 **일회성 입력 자료**입니다. 앱을 열거나 다시 배포할 때 읽어서 채우지 않습니다. `scripts/snapshot-firestore.mjs`로 변경 전 Firestore 문서와 하위 컬렉션을 `private-backups/<시각>/firestore.json`에 저장합니다. 백업에는 가족 이름과 댓글 등이 들어갈 수 있으므로 이 폴더는 Git에서 제외하며 공유하지 마세요. 현재 사진 파일이 있다면 이 스냅샷에 원본 사진 바이트는 포함되지 않습니다.

마이그레이션은 `scripts/migrate-place-catalog.mjs --snapshot private-backups/<시각>/firestore.json`으로 사전 점검하고 `--apply`를 붙여 한 번 적용합니다. 실제 프로젝트는 `tokyo-together-57264`로 고정되어 있으며 Firebase CLI 로그인이 필요합니다. 고정 장소 ID를 사용하고 `appMigrations/catalog-2026-10-12` 완료 기록을 저장하므로 재실행해도 후보를 중복 생성하거나 수정한 항목을 덮어쓰지 않습니다. 기존 샘플 중 연결 기록이 없는 6개만 제거하고, 가족이 작성한 댓글과 방문 기록이 연결된 이전 장소·제안 1개는 보관 처리해 일반 일정 화면에서 숨깁니다. 원문은 백업과 보관함에서 확인할 수 있습니다. 이 보관 자료를 삭제하거나 새 후보에 합칠 때는 실제 작성자인지 확인한 뒤 별도 작업으로 처리해야 합니다.

현재 프로젝트 적용 전 백업은 `private-backups/2026-10-12T09-17-59-181Z/firestore.json`입니다. 적용 후 Firestore에는 **활성 후보 30개와 보관 장소 1개**가 있으며, 새 일정 제안·확정 일정은 만들지 않았습니다. 적용 전후 스냅샷에서 가족 구성원 5문서, 여행 기본정보, 이전 댓글과 방문 앨범 문서가 그대로임을 확인했습니다. 실제 사이트에서 분류·검색·링크, 장소 수정과 보관/복원 후 새로고침 유지, 844×390·390×844·1024×768의 가로 넘침 없음을 확인했습니다. 테스트용 장소 수정은 원래 값으로 되돌렸습니다. 단위 테스트 5개와 TypeScript 검사, 빌드가 통과했습니다. Java 런타임이 없어 에뮬레이터 통합 테스트와 실제 사진 업로드 흐름은 이번 작업에서 다시 실행하지 못했습니다.

Firebase Hosting의 로그인 화면과 정적 JavaScript 파일 자체는 URL을 아는 사람에게 제공됩니다. 장소·일정·댓글·항공·숙소 상세·사진 데이터는 Firebase 규칙으로 가족 계정에 제한하지만, 정적 코드에 포함된 여행 기간과 가족 역할 문구까지 감춰지는 것은 아닙니다. 그 정보도 비회원에게 숨겨야 한다면 인증을 거친 뒤 HTML/JavaScript를 제공하는 별도 호스팅 구성이 필요합니다.

## 로컬 개발 및 검증

- 일반 개발: `npm install`, `npm --prefix functions install`, `npm run dev`. `.env.local`에 실제 Firebase 값을 넣었다면 개발 서버도 실제 데이터에 연결됩니다. 실데이터를 시험 목적으로 수정하지 않도록 주의하세요.
- 로컬 에뮬레이터: Java 21, Node 22, Firebase CLI가 필요합니다. `.env.local`에 `demo-tokyo-together`의 데모 값과 `VITE_USE_EMULATORS=true`를 입력하고, `TOKYO_STORAGE_BUCKET=demo-tokyo-together.firebasestorage.app npx firebase emulators:start --project demo-tokyo-together --only auth,firestore,storage,functions`를 실행합니다. 다른 터미널에서 `GCLOUD_PROJECT=demo-tokyo-together FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node tests/seed-emulator.mjs`를 실행하면 데모 다섯 계정이 생성됩니다. 예시 로그인이 스크립트에 표시됩니다. **데모 비밀번호를 실제 Firebase 계정에 쓰지 마세요.** `npm run dev`로 화면을 엽니다.
- 단위 테스트: `npm test`. 통합 테스트는 데모 에뮬레이터가 실행 중일 때 `GCLOUD_PROJECT=demo-tokyo-together FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9199 FIREBASE_STORAGE_BUCKET=demo-tokyo-together.firebasestorage.app FIREBASE_FUNCTIONS_EMULATOR_HOST=127.0.0.1:5001 node tests/integration.mjs`로 실행합니다. 테스트가 데모 에뮬레이터 데이터에 쓰므로 별도 실행 환경을 권장합니다.

사진은 원본 그대로 저장하며 파일당 최대 **25 MiB**입니다. JPEG/PNG/WebP/GIF/AVIF/HEIC/HEIF를 허용합니다. 파일 크기 상한은 업로드 실패와 저장비 증가를 줄이기 위한 MVP 기준입니다. 더 큰 원본은 업로드할 수 없으므로 필요하면 상한과 비용을 함께 재검토하세요. HEIC는 원본으로 내려받을 수 있지만 브라우저별로 미리보기가 없을 수 있습니다. 현재 미리보기는 앨범의 앞 8장 원본을 불러오므로 모바일 데이터 사용량이 늘 수 있습니다.

## 데이터 구조와 정리

- `places/{placeId}`: 장소 카드. `interests`, `comments` 하위 컬렉션.
- `tripInfo/summary`: 항공·숙소 요약. 로그인한 가족만 읽고 수정할 수 있습니다.
- `proposals/{proposalId}`: 일정과 상태. `agreements`, `comments` 하위 컬렉션.
- `visits/{visitId}`: 실제 방문 회차. 과거 방문은 독립 ID, 일정 방문은 `trip_{proposalId}`. `photos`, `reviews`, `comments`, `quotas` 하위 컬렉션.
- `uploadTickets/{photoId}`: 만료되는 업로드 예약. 서버 함수만 읽고 씁니다.
- Storage `visits/{visitId}/{uid}/{photoId}`: 원본 사진 1개. 사진 메타데이터는 Firestore `photos` 문서 1개만 사용합니다.

여행 후에는 먼저 각 가족이 필요한 **원본 사진을 개별 다운로드**하고 각 앨범의 **후기 JSON**을 내보내어 파일을 확인하세요. 현재 ZIP 일괄 다운로드와 전체 백업 버튼이 없으므로 사진이 많다면 여러 번 내려받아야 합니다. 가족 모두 파일을 확인한 뒤에만 Firebase Console에서 Hosting, Authentication, Firestore, Storage, Functions와 프로젝트 삭제 절차를 검토하세요. **이 앱은 자동 삭제하지 않으며, 실제 삭제는 소유자가 별도로 요청하기 전에는 실행하지 않습니다.** 프로젝트를 통째로 삭제하면 데이터와 링크를 복구하기 어려울 수 있습니다.
