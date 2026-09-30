# 잔의 기록 · Sip Journal

와인·위스키의 라벨보다 그날의 경험을 먼저 기록하는 개인 서재입니다. 기존 독서앱과 비슷한 5가지 강조색·3가지 배경, 표지 격자, 평점 레이어와 노트 중심 화면을 사용합니다.

## 바로 사용할 수 있는 기능

- 컬렉션 / 노트 / 찾기 / 돌아보기 / 설정.
- 같은 술에 여러 번의 경험을 따로 기록. 날짜를 모르면 빈 값 그대로 유지.
- 여행·모임, 방문 국가·도시·장소, 함께한 사람, 향·맛·여운, 자유 메모, 가격과 평점.
- 라벨·노트 사진 촬영 또는 선택, 최대 3장의 추억 사진, 원문 보존.
- `지난 일본 여행에서 마셨던 와인은`처럼 장소·여행·종류를 조합해 검색. 방문 국가와 생산 국가를 구분합니다. 키워드/별칭 기반 로컬 검색이며 범용 AI 대화 검색은 아닙니다.
- 초안 복구, 저장 실패 시 입력 유지, 다른 창의 오래된 수정 거부, 사진을 포함한 JSON 백업·선택적 병합/명시적 교체.
- 실제 기록과 섞이지 않는 가상 체험 화면, 독립 서비스워커 캐시와 오프라인 읽기·기록.

## AI 기능의 현재 상태

GitHub Pages 버전은 정적 웹앱입니다. 기록·검색·사진 보관·백업은 바로 동작하지만, 그 주소에 로그인 서버가 자동 생성되는 것은 아닙니다. 서버 설정 없이 AI에 연결됐다고 표시하지 않습니다.

`사진에서 기억 꺼내기 → 기존 ChatGPT·Gemini로 정리하기`에서 요청문을 복사해 평소 AI에 사진과 함께 보내고, 반환된 JSON을 붙여넣으면 여러 기록을 미리보고 가져올 수 있습니다. 자동 분석이 아니라 명시적인 수동 연결 경로입니다.

앱에는 아래 서버 구현도 포함합니다. 실제 자동 분석과 로그인은 HTTPS 서버 배포, 사용자별 키 또는 승인된 OAuth 등록 후 활성화합니다.

| 기능 | 서버 구현 | 별도 준비 |
|---|---|---|
| Gemini 라벨·노트 분석 | generateContent, 이미지 입력, JSON 결과 검증 | 개인 Gemini API 키. Google AI 구독과 별도 |
| OpenAI 라벨·노트 분석 | Responses API, 이미지 입력, JSON 결과 검증 | 개인 OpenAI API 키. ChatGPT 구독과 별도 |
| ChatGPT 구독 기반 분석 | 공식 OIDC·PKCE, 토큰 갱신, 계정별 모델 목록, Responses SSE | 원격 호스팅 앱에 대한 공식 승인 및 client ID / 허용 scope |
| Google 로그인 | 공식 OIDC·PKCE·ID 토큰 검증 | Google OAuth client 등록. 로그인만으로 Gemini API 사용량이 생기지는 않음 |
| 웹 평가 | OpenAI web_search / Gemini Google Search grounding | 선택 AI 연결과 해당 도구 사용 가능 모델. 출처 없으면 저장하지 않음 |

ChatGPT의 단순 신원 로그인은 추론 권한과 다릅니다. 원격 호스팅 앱은 공개 오픈소스 로컬 도구용 토큰 공유 흐름을 임의로 재사용하면 안 됩니다. 등록·승인 전에는 관련 버튼을 숨깁니다. 토큰 갱신이나 API 호출 실패 시 다른 유료 공급자로 자동 전환하지 않습니다.

공식 문서(구현 시 확인):
- https://developers.openai.com/siwc/website
- https://developers.openai.com/siwc/token-sharing-open-source
- https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference
- https://ai.google.dev/gemini-api/docs/image-understanding
- https://ai.google.dev/gemini-api/docs/google-search

## 실행

Node.js 22 이상만 필요합니다. 실행용 외부 의존성은 없습니다.

```sh
cd sip
npm start
# http://localhost:8134/sip/
```

정적 확인만 하려면 저장소 루트에서 일반 웹서버로 `/sip/`을 열어도 됩니다. `file://`은 ES 모듈과 IndexedDB 동작이 브라우저마다 달라 지원하지 않습니다.

## AI 서버를 실제 활성화하기

이 서버는 Node.js 단일 인스턴스와 영속 디스크를 사용하는 가족용 구현입니다. Cloudflare Workers용 코드가 아닙니다. 여러 서버 인스턴스에 동시에 쓰는 구성도 지원하지 않습니다. 앱과 API를 같은 HTTPS 출처의 `/sip/`, `/sip/api/`로 서비스하세요. 다른 출처의 API URL이나 제3자 쿠키에 의존하지 않습니다.

환경변수는 호스팅 서비스의 Secret 입력란에만 등록하세요. 키·토큰·비밀번호·초대 코드를 GitHub나 채팅에 붙여넣지 마세요. `.env.example`은 항목 이름만 보여주는 예시입니다.

필수:
- `SIP_PUBLIC_ORIGIN`: `https://your-domain.example` (경로·마지막 슬래시 없음)
- `SIP_MASTER_KEY`: 암호화용 무작위 32바이트의 base64 값. 분실하면 기존 인증 저장소를 읽을 수 없습니다.
- `SIP_INVITE_CODE`: 가족에게만 전달하는 무작위 24자 이상의 초대 코드.
- `SIP_DATA_DIR`: 영속 디스크의 별도 폴더. 정적 사이트 폴더 밖에 두세요.
- `HOST=0.0.0.0`, `PORT`: 호스팅 제공자의 내부 포트.

키 생성은 자신의 터미널에서 `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`로 할 수 있습니다. 출력값은 공개하지 마세요.

서버 실행 뒤 설정 → 나의 AI 연결에서 초대 코드를 이용해 가족별 계정을 만들고, 각자의 API 키를 등록합니다. 비밀번호는 salted scrypt, 키와 토큰은 AES-256-GCM으로 암호화해 저장됩니다. 서버 세션은 HttpOnly·Secure·SameSite=Lax 쿠키와 CSRF 검증을 사용하며, 세션 확인 시 30일 유효기간을 갱신합니다. 장기간 미사용, 브라우저 데이터 삭제, 권한 철회, 인증 정책 변경에는 재로그인이 필요할 수 있습니다.

선택 OAuth:
- Google: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, 등록 redirect URI `https://your-domain.example/sip/api/oauth/google/callback`.
- ChatGPT: 승인 후 `OPENAI_CLIENT_ID`, 필요시 `OPENAI_CLIENT_SECRET`, `SIP_CHATGPT_APPROVED=1`, `OPENAI_APPROVED_SCOPES`를 승인된 값으로 설정. redirect URI `https://your-domain.example/sip/api/oauth/openai/callback`. 신원 scope만 허용된 경우 추론 연결됨으로 표시하지 않습니다.
- 개발자의 승인 없는 상태에서 임의 client ID나 다른 앱의 토큰을 사용하지 마세요.
- 기본 API 모델은 환경변수 `OPENAI_MODEL`, `GEMINI_MODEL`로 변경 가능. ChatGPT OAuth는 계정의 실제 모델 목록을 조회합니다.

## 개인정보와 정확성

- 시음 기록과 사진은 기기별 IndexedDB `sip-journal`에 저장됩니다. 서버 계정 로그인은 AI 연결용이며, 기록의 기기 간 동기화가 아닙니다.
- 공유 PC/브라우저에서는 다른 사용자에게 로컬 기록이 보일 수 있습니다. 별도 브라우저 프로필 또는 별도 기기를 사용하세요.
- 사진 분석은 선택한 사진과 입력 텍스트만 명시적 동의 후 전송합니다. EXIF 위치정보 없이 축소한 이미지로 보냅니다.
- 웹 평가에는 술 이름·생산자·빈티지만 전송합니다. 여행·사람·감상 전체를 검색에 보내지 않습니다.
- AI 원문은 미리보기 후 저장합니다. 불분명한 날짜·빈티지·평점을 임의 확정하지 않습니다.
- API 무료 등급과 유료 등급의 데이터 처리 정책은 공급자에서 확인하세요.
- JSON 백업에는 사진·개인 메모·동행자 정보가 포함될 수 있습니다. 비공개 위치에 보관하세요.
- 초기화·다른 앱 저장소 삭제·사이트 데이터 삭제를 자동 실행하지 않습니다.

## 테스트

```sh
TZ=Asia/Seoul npm test
TZ=America/New_York npm test
npm run check
# 브라우저 테스트용 개발 의존성만 추가
npm install --no-save --package-lock=false playwright@1.55.0
npx playwright install chromium
node tests/browser.mjs
```

자동 테스트는 API 요청과 응답을 모의합니다. 실제 유료 API 호출·승인된 OAuth 로그인을 대신하지 않습니다. 브라우저 테스트는 로컬 HTTP에서 실제 IndexedDB와 서비스워커를 사용하며, iPhone Safari 실기기 테스트와는 구분합니다.
