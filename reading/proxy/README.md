# 국내 도서 검색 프록시

책꽂이 앱에서 국립중앙도서관·네이버 책·카카오를 안전하게 조회하는 Cloudflare Worker입니다. API 비밀키는 Worker에만 저장되고 앱에는 전달되지 않습니다. 개인 노트는 전송하지 않으며 ISBN, 제목, 저자만 검색에 사용합니다.

표지 복구 우선순위는 국립중앙도서관 → 네이버 책 → 카카오이며, 앱이 Google Books와 Open Library를 추가 보조 소스로 사용합니다. 알라딘 OpenAPI는 2026년 10월 30일 종료 예정이므로 새 조회 경로에서 사용하지 않습니다.

## 준비할 키

모두 필수는 아니지만 국립중앙도서관과 네이버를 함께 설정하는 것을 권장합니다.

- `NL_CERT_KEY`: 국립중앙도서관 Open API 인증키
- `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`: 네이버 검색 API 애플리케이션 키
- `KAKAO_REST_API_KEY`: 기존 카카오 REST API 키(선택)
- `ALLOWED_ORIGIN`: 허용할 사이트 출처(예: `https://jhkim05-star.github.io`)

## 배포

```bash
cd reading/proxy
wrangler secret put NL_CERT_KEY
wrangler secret put NAVER_CLIENT_ID
wrangler secret put NAVER_CLIENT_SECRET
wrangler secret put KAKAO_REST_API_KEY
wrangler deploy
```

사용하지 않을 제공처의 비밀키 입력 단계는 생략할 수 있습니다. 배포된 `https://…workers.dev` 주소를 앱의 **설정 → 국내 도서 검색 프록시**에 저장합니다.

## 확인

일반 검색:

```text
https://…workers.dev/?query=책제목
```

ISBN 표지 후보 검색:

```text
https://…workers.dev/?action=cover&query=9780000000000&isbn=9780000000000
```

응답의 `items`에는 출처, ISBN, 표지 주소가 포함됩니다. 앱은 ISBN이 정확히 일치하고 이미지가 실제로 열리는 후보만 저장합니다.
