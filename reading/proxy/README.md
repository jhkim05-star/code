# 카카오 책 검색 프록시

책꽂이 앱에서 국내서를 검색할 때 쓰는 작은 중계 서버입니다.
[Cloudflare Workers](https://workers.cloudflare.com) 무료 요금제로 충분히 돌아가고,
비용이 들지 않습니다.

## 왜 프록시가 필요한가

카카오 책 검색 API(`dapi.kakao.com/v3/search/book`)는 REST API 키를
`Authorization` 헤더로 요구합니다. 이 헤더 때문에 브라우저가 먼저 보내는
사전 확인 요청(CORS preflight)을 카카오 서버가 허용하지 않아서, 앱(브라우저)에서
카카오 API를 **직접 부를 수 없습니다.** 그래서 API 키를 대신 들고 있다가
요청을 전달해 주는 서버가 하나 필요한데, 이 폴더(`worker.js`)가 그 역할을 합니다.

API 키는 이 워커의 비밀 환경변수에만 저장되고, 책꽂이 앱(브라우저)에는
**절대 전달되지 않습니다.** 앱은 이 워커의 주소만 알면 됩니다.

> 알라딘 OpenAPI는 2026년 10월 30일 종료될 예정입니다. 그 전까지는 알라딘을
> 먼저 쓰고, 이후에는 여기서 만드는 카카오 프록시로 자연스럽게 넘어갑니다.

## 1. 카카오 REST API 키 발급 (무료)

1. [Kakao Developers](https://developers.kakao.com) 에 카카오 계정으로 로그인
2. **내 애플리케이션 → 애플리케이션 추가하기** 로 앱을 하나 만듭니다(이름은 자유)
3. 만든 앱을 열어 **앱 키** 탭에서 **REST API 키** 값을 복사해 둡니다
4. **제품 설정 → 카카오 로그인** 등은 필요 없습니다. 책 검색은 REST API 키만
   있으면 바로 쓸 수 있습니다(별도 활성화 절차 없음)

## 2. Cloudflare Workers 준비 (무료)

1. [Cloudflare](https://dash.cloudflare.com/sign-up) 무료 계정을 만듭니다
2. 로컬(내 컴퓨터)에 Node.js 가 있다면 터미널에서:
   ```bash
   npm install -g wrangler
   wrangler login
   ```
   브라우저가 열리며 Cloudflare 계정과 연결하라고 물어봅니다. 승인하면 끝입니다.

## 3. 배포

이 폴더(`reading/proxy/`)로 이동해서:

```bash
cd reading/proxy
wrangler secret put KAKAO_REST_API_KEY
# 여기서 물어보면 1번에서 복사해 둔 REST API 키를 붙여넣고 Enter
wrangler deploy
```

배포가 끝나면 터미널에 이렇게 생긴 주소가 나옵니다.

```
https://bookshelf-kakao-proxy.<내계정>.workers.dev
```

이 주소를 책꽂이 앱의 **설정 → 카카오 책 검색 프록시** 칸에 붙여넣고
저장하면 됩니다. **연결 확인** 버튼으로 바로 되는지 확인할 수 있습니다.

## 4. (선택) 아무나 내 API 키로 검색하지 못하게 막기

이 워커 주소를 알면 누구나 호출할 수 있고, 그 요청은 전부 내 카카오 API
사용량으로 잡힙니다(카카오 책 검색은 일일 무료 호출 한도가 넉넉해서 개인
사용에는 큰 문제가 없지만, 그래도 좁혀 두는 게 안전합니다).

`wrangler.toml` 을 열어 아래 부분의 주석을 풀고, 본인의 GitHub Pages
주소로 채운 뒤 다시 `wrangler deploy` 합니다.

```toml
[vars]
ALLOWED_ORIGIN = "https://<사용자명>.github.io"
```

이렇게 하면 그 출처(책꽂이 앱)에서 온 요청만 받고, 나머지는 거절합니다.

## 확인 방법

배포된 주소를 브라우저 주소창에 이렇게 입력해 봅니다.

```
https://bookshelf-kakao-proxy.<내계정>.workers.dev/?query=해리포터
```

카카오 검색 결과가 JSON 으로 보이면 정상입니다. `{"error": "..."}` 가 뜨면
`worker.js` 의 에러 메시지를 그대로 읽어 원인을 확인합니다(키 미등록,
카카오 쪽 오류 등).

## 다시 배포하려면

`worker.js` 를 고친 뒤에는 이 폴더에서 `wrangler deploy` 만 다시 실행하면
됩니다. `KAKAO_REST_API_KEY` 는 한 번 등록해 두면 계속 남아 있어 다시
넣을 필요가 없습니다.
