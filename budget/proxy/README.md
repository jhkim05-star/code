# Notion proxy Worker

브라우저에 Notion 비밀키를 노출하지 않기 위한 최소 Cloudflare Worker adapter입니다.

- `NOTION_TOKEN`: Notion connection의 secret
- `CLIENT_TOKEN`: 앱 사용자가 새로고침 때 입력하는 별도 공유 문자열
- `ALLOWED_ORIGIN`: 허용할 앱 origin. 정확한 `scheme://host[:port]` 값을 쉼표로 구분

Worker는 `POST /notion/query`만 허용하며 `POST /v1/data_sources/{data_source_id}/query`로 전달합니다. Notion version은 `2025-09-03`으로 고정되어 있습니다. 응답을 캐시하지 않으며 허용되지 않은 Origin, 잘못된 client token, 올바르지 않은 data source ID를 거부합니다.

```sh
wrangler secret put NOTION_TOKEN
wrangler secret put CLIENT_TOKEN
wrangler deploy
```

`wrangler.toml`의 예시 origin을 실제 앱 origin으로 바꾼 뒤 배포하세요. 이 저장소의 앱 배포와 Worker 배포는 별도입니다.
