# 하루살림 가계부

한국형 카드 결제주기, 빠른 직접 입력, 예산, 통계, Notion 가져오기에 집중한 개인용 local-first PWA입니다. `budget/`은 `reading/`, `workout/`과 코드·저장소·서비스 워커 캐시가 분리되어 있습니다.

## 데이터와 개인정보

- IndexedDB 데이터베이스 `jhkim-budget`의 `authoritative` snapshot이 유일한 기준입니다.
- snapshot에는 `transactions`, `cards`, `categories`, `budgets`, `imports`, `settings`, `meta`가 들어갑니다. 저장할 때 revision을 비교하므로 다른 창의 변경을 덮어쓰지 않습니다.
- 손상되거나 알 수 없는 데이터는 자동 초기화하지 않습니다. 화면에 오류를 남기고 기존 데이터를 보존합니다.
- Notion ZIP·CSV 가져오기는 사용자가 파일을 직접 선택할 때만 동작합니다. 온라인 Notion과 카드 알림 가져오기는 각각의 **새로고침** 버튼을 누를 때만 동작합니다.
- `NOTION_TOKEN`은 앱에 입력하거나 저장하지 않습니다. Cloudflare Worker secret으로만 보관합니다.
- 알림 원문은 장기 저장하지 않습니다. 파싱된 거래 필드와 중복 방지용 source ID만 저장합니다.
- JSON 백업에는 금액·가맹점·메모 등 민감정보가 포함됩니다. 안전한 위치에 보관하세요.

## 거래 모델과 중복 방지

```js
{
  id, date, time,
  billingDate,       // Notion에 결제일이 있을 때만 사용하는 선택 필드
  type,              // 신규 입력: expense | transfer
  amount, merchant, categoryId,
  paymentMethod, cardId,
  source,            // manual | notion | kakao | paste | import
  sourceId, memo, installment,
  cancelled, linkedOriginal,
  createdAt, updatedAt
}
```

카드는 `id`, `issuer`, `name`, `billingDay`, `cycleRule`, `aliases`, `active`를 사용합니다. 외부 데이터는 `sourceId`와 `날짜 + 금액 + 정규화 가맹점 + 카드 + 승인/취소` fingerprint를 함께 비교합니다. 중복 후보는 미리보기로 분리하며 자동 이중 등록하지 않습니다.

## 카드 결제주기

`assets/js/domain.js`의 `cardCycle(date, card)`는 브라우저 상태에 의존하지 않는 순수 함수입니다.

- 결제일 기준 offset: 결제일이 14일이고 `startOffset: -44`, `endOffset: -15`이면 2026-01-05의 현재 주기는 `2026-01-01–2026-01-30`, 다음 결제일은 `2026-02-14`입니다.
- 월 범위: `startDay: 16`, `endDay: 15`, `dueMonthOffset: 1`, 결제일 20일이면 2026-09-05의 주기는 `2026-08-16–2026-09-15`, 결제일은 `2026-10-20`입니다.
- 29·30·31일은 해당 월의 마지막 날로 보정합니다. 윤년 2월도 같은 규칙입니다.
- 할부는 승인 총액을 월수로 나누고 나머지 1원씩 앞 회차에 배분합니다. 카드 주기 합계에는 해당 기간의 회차분만 포함합니다.
- 승인취소는 원거래를 찾으면 `linkedOriginal`로 연결하고 기간 통계와 카드 합계에서 차감합니다.

카드사마다 실제 이용기간과 청구 확정 규칙이 다르고 바뀔 수 있으므로, 카드 명세서의 이용기간을 확인한 뒤 값을 직접 설정하세요.

## Notion 내보내기 ZIP·CSV 가져오기

Notion API 연결 없이 데이터베이스에서 내보낸 `.zip` 또는 `.csv`를 설정 화면에서 직접 선택할 수 있습니다. 파일은 브라우저 안에서만 읽으며 서버로 보내지 않습니다.

- ZIP에 현재 보기 CSV와 전체 데이터 CSV가 함께 있으면 `_all.csv`를 우선 사용합니다.
- 열 순서와 관계없이 `지출 내역`, `금액`, `날짜`를 필수로 읽고 `결제일`, `메모`, `카드`, `카테고리`를 선택적으로 읽습니다.
- `June 11, 2025` 같은 Notion 영문 날짜를 ISO 날짜로 바꾸되, `날짜`와 `결제일`은 서로 합치지 않습니다.
- 원화 기호와 천 단위 쉼표를 정규화합니다. 등록된 카드 이름·카드사·별칭과 정확히 맞으면 연결하고, 아니면 원래 카드 이름을 남긴 채 미연결 상태로 가져올 수 있습니다.
- 기존에 없는 카테고리는 원래 이름으로 함께 추가합니다. `고정비`만 고정 카테고리로 표시하며, 다른 분류의 의미를 임의로 추측하지 않습니다.
- 신규·중복 후보·오류를 먼저 보여주고 사용자가 확인한 신규 거래만 하나의 snapshot으로 저장합니다. 읽기나 저장에 실패하면 기존 데이터는 바뀌지 않습니다.

## Notion 온라인 연결

이 앱은 Notion API `2025-09-03`의 data source 경로를 사용합니다. 브라우저가 Notion에 직접 요청하지 않고 `proxy/worker.js`를 거칩니다.

1. Notion에서 내부 integration(connection)을 만들고 읽기 권한을 부여합니다.
2. 대상 데이터베이스 오른쪽 위 메뉴의 **Add connections**에서 해당 connection과 공유합니다.
3. 데이터베이스의 **Manage data sources**에서 **Copy data source ID**를 선택합니다. 데이터베이스 URL의 ID와 혼동하지 마세요.
4. Cloudflare Worker에 `proxy/worker.js`를 배포합니다.
5. Worker secret `NOTION_TOKEN`과 충분히 긴 임의 문자열 `CLIENT_TOKEN`을 설정합니다.
6. `ALLOWED_ORIGIN`은 앱의 정확한 origin으로 지정합니다. 여러 origin은 쉼표로 구분합니다.
7. 앱 설정에 Worker URL, data source ID, Notion 속성명을 입력합니다. `CLIENT_TOKEN`은 매 요청 때 입력하며 앱에 저장되지 않습니다.

기본 속성 매핑은 `날짜`, `금액`, `구분`, `가맹점`, `카테고리`, `카드`, `메모`입니다. 첫 동기화는 cursor pagination으로 전체를 읽고, 이후에는 `last_edited_time`을 우선 필터링합니다. 모든 페이지를 받은 다음 신규·중복 후보·오류를 나눈 미리보기를 보여주며, 사용자가 고른 신규 거래만 snapshot 하나로 적용합니다. 네트워크·매핑·저장 실패 시 기존 거래는 바뀌지 않습니다.

## 카카오톡·카드 알림의 플랫폼 차이

정적 웹/PWA는 카카오톡 대화나 다른 앱의 알림을 임의로 읽을 수 없습니다. 카카오톡 계정 세션 스크래핑, 비공식 로그인, 백그라운드 메시지 수집을 구현하지 않습니다.

- 웹/PWA: 사용자가 복사한 텍스트 붙여넣기, `.txt` 파일 선택, OS가 지원할 때 Web Share Target으로 전달한 텍스트만 처리합니다.
- Android/Capacitor(로드맵): 사용자가 Android 설정에서 알림 접근 권한을 명시적으로 허용한 경우에만 `NotificationListenerService`가 금융 알림을 로컬 inbox에 넣습니다. JS에는 동일한 `listFinancialNotifications(sinceCursor)` interface만 노출합니다. 자세한 계약은 `docs/android-adapter.md`에 있습니다.
- iOS: 다른 앱의 카카오톡 메시지를 직접 읽지 않습니다. 공유 시트, 복사·붙여넣기, 사용자가 내보낸 채팅 텍스트 파일만 받습니다.

파서 registry는 신한, KB국민, 현대, 삼성, 롯데, 하나, 우리, BC 계열의 승인·승인취소 합성 fixture로 테스트합니다. 카드 이름·카드사·aliases로 한 카드만 매칭되지 않으면 적용 전에 사용자가 카드를 선택해야 합니다. 처리 cursor를 저장해 같은 inbox를 반복 등록하지 않습니다.

## 초기화와 버전 확인

- 설정의 **데이터 초기화**는 첫 안내와 최종 안내를 모두 확인한 경우에만 실행됩니다. 거래, 카드, 예산, 가져오기 기록, 설정과 가계부 공유 inbox를 비우며 reading/workout 저장소나 캐시는 건드리지 않습니다.
- 초기화는 현재 revision 다음 번호로 빈 snapshot을 원자적으로 저장합니다. 다른 창의 오래된 상태가 뒤늦게 덮어쓰는 것을 revision 검사로 막고, 저장 실패 시 메모리와 기존 snapshot을 유지합니다.
- **버전 확인**은 캐시를 사용하지 않고 배포된 `version.json`을 확인합니다. **앱 새로고침**은 서비스워커 업데이트 확인 후 화면을 다시 엽니다.
- 신규 화면과 가져오기에서는 지출과 이체만 지원합니다. 과거 snapshot에 남은 income 형식은 데이터 손상을 피하기 위해 읽기 호환성만 유지하고 화면·집계에서 제외하며, 사용자가 명시적으로 초기화하면 다른 가계부 데이터와 함께 제거됩니다.

## 통계와 예산

- 월·연도별 지출, 카테고리 비중, 카드별 사용액, 전월부터 선택한 기준월까지의 가맹점 Top 5, 고정비·변동비, 카드 결제주기 사용액을 계산합니다.
- 카드 사용기간은 카드마다 `전월 시작일–당월 종료일`을 직접 선택할 수 있으며, 기존 offset·월 범위 규칙도 읽기 호환성을 유지합니다.
- 계좌 이체는 지출 통계에서 제외합니다. 취소는 순액으로 처리합니다.
- 전체 월 예산과 카테고리별 예산을 저장할 수 있습니다. 80% 이상은 `예산 임박`, 100% 초과는 `예산 초과` 문구를 색상과 함께 표시합니다.
- 차트는 외부 라이브러리 없이 SVG와 CSS로 그립니다.

## 오프라인과 테스트

서비스 워커는 `budget-pwa-*` cache만 만들고 `/budget/` 요청만 다룹니다. 설치 후 홈·내역·직접입력·통계·설정은 오프라인에서 동작하며 외부 동기화만 온라인이 필요합니다.

지원 브라우저에서는 WebMCP의 `read_budget_summary`와 `create_budget_transaction` 도구도 등록합니다. 화면과 같은 repository/validation 경로를 사용하므로 자동화 입력도 중복 차단과 revision 보호를 건너뛰지 않습니다.

```sh
cd budget
npm test
```

테스트 범위에는 validation, CRUD/revision, 손상 데이터 보존, 중복 후보, 카드 주기·월말·윤년, 할부, 승인취소, Notion ZIP·CSV 선택·날짜·카드·카테고리 정규화, Notion API 매핑·pagination·미리보기, 카드사 parser registry·cursor, 이체 제외, 취소 순액, 월/연 통계 기반 집계, 예산, 테마 저장, 서비스 워커 scope, 모바일 overflow 규칙, `Asia/Seoul`·`America/New_York` 날짜 경계가 포함됩니다.

정적 파일 서버의 루트가 저장소 최상위가 되게 실행하고 `/budget/`을 여세요. ES module과 서비스 워커 때문에 `file://`로 직접 열지 않는 편이 안전합니다. 이 변경은 자동 배포하지 않습니다.
