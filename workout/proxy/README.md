# 개인 AI 프록시 배포

OpenAI/Claude 제공자 키를 공개 정적 앱에 넣지 않고, 개인 Cloudflare Worker의 비밀 환경변수에 둡니다. 이 폴더를 GitHub Pages에 올리는 것만으로 Worker가 배포되지는 않습니다.

## 1. 구성 확인

`wrangler.toml`의 `ALLOWED_ORIGIN`은 `https://jhkim05-star.github.io`입니다. `/code/workout` 경로는 Origin에 넣지 않습니다. 계정·도메인이 다르면 수정하세요. 로컬 개발 출처를 허용하려면 테스트용 Worker를 따로 배포하는 편이 안전합니다. `*` 허용은 구현하지 않았습니다.

기본 모델 ID는 `gpt-5.4-mini`와 `claude-sonnet-5`입니다. 계정에서 실제 사용 가능한 모델을 공식 문서·모델 조회로 확인하고 `OPENAI_MODEL` / `CLAUDE_MODEL`을 조정하세요. 연결 확인은 모델 접근 확인일 뿐 실제 계획 생성 테스트가 아닙니다.

레이트리밋 네임스페이스 1003은 예시입니다. 동일 계정의 다른 Worker가 쓰는 번호와 겹치지 않게 하세요. Rate Limiting 바인딩을 지원하는 Wrangler **4.36.0 이상**이 필요합니다.

## 2. 비밀값 등록

로컬 터미널에서 다음을 실행합니다. 실제 키는 명령 인자로 쓰지 말고 비밀값 입력 프롬프트에 넣으세요. 키나 접속 토큰을 Git·메신저·채팅에 붙여넣지 마세요.

```sh
cd code/workout/proxy
npx wrangler login
npx wrangler secret put OPENAI_API_KEY
# Claude도 사용할 때:
npx wrangler secret put ANTHROPIC_API_KEY
```

그다음 32자 이상의 임의 접속 토큰을 **본인 컴퓨터에서** 생성합니다.

```sh
python -c "import secrets; print(secrets.token_urlsafe(32))"
npx wrangler secret put CLIENT_TOKEN
npx wrangler deploy
```

생성한 토큰을 `CLIENT_TOKEN` 입력 프롬프트에 붙여넣고, 비밀번호 관리 앱 등에 개인 보관합니다. 나중에 앱 설정에 넣는 것도 이 토큰이며 OpenAI API 키가 아닙니다. 한 제공자만 사용할 때는 다른 제공자의 키를 등록하지 않아도 해당 제공자만 동작합니다.

## 3. 앱에 연결

설정 → AI 계획에서 제공자를 선택하고 Worker 주소와 프록시 접속 토큰을 입력합니다. 주소 예: `https://workout-ai-proxy.<계정>.workers.dev`.

**프록시 연결 확인 → 운동계획의 AI로 생성 → 미리보기 검토 → 적용** 순서입니다. 실제 생성은 API 이용료가 발생할 수 있습니다. 본 패키지 작성 과정에서는 실제 키·실제 유료 생성 요청을 사용하지 않았습니다.

## 보안·운영 한계

Origin은 브라우저의 출처 제한이지 로그인 인증이 아닙니다. 서버는 별도 토큰도 검증합니다. 유출 토큰으로 제한된 개인 프록시를 호출할 수 있으므로 잃어버리거나 공유했다면 새 값으로 교체하세요. 다수 사용자에게 공개할 서비스라면 이 단일 사용자 토큰 구조 대신 사용자 인증과 사용자별 권한·한도가 필요합니다.

기본 한도는 동일 사용자 키로 60초에 3회이며 `/health`도 횟수에 포함합니다. Cloudflare 한도는 처리 위치별·최종 일관성 방식이므로 **전 세계 단일 정확한 사용량 집계나 결제 상한이 아닙니다.** 제공자 계정의 사용량·제한도 함께 관리하세요. 브라우저 취소는 화면 적용을 막고 요청 중단을 시도하지만, 이미 제공자가 처리한 호출의 비용 취소를 보장하지 않습니다.

프롬프트·응답은 이 Worker 코드에서 로그로 남기지 않으며 Observability를 기본 꺼 둡니다. 다만 이것이 제공자/플랫폼의 모든 운영 로그·보관 정책을 제어한다는 뜻은 아닙니다. OpenAI 요청은 `store:false`를 지정합니다.

공식 참고:
- https://help.openai.com/en/articles/5112595-best-practices-for-api-key-safety
- https://developers.openai.com/api/docs/guides/structured-outputs
- https://developers.openai.com/api/docs/models/gpt-5.4-mini
- https://platform.claude.com/docs/en/build-with-claude/structured-outputs
- https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
