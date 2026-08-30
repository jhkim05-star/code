# 목소리 바꾸기

기본값은 **기기에 내장된 한국어 음성**(아이폰이면 보통 '유나')이고, 설정 › 음성에서
음 높이를 올려 밝은 톤으로 맞출 수 있습니다. 코드를 고치지 않아도 여기까지는 그대로 됩니다.

더 마음에 드는 목소리로 바꾸고 싶으면, 아래 규칙대로 오디오 파일을 넣고
`manifest.json` 에 등록하기만 하면 됩니다. 등록된 키는 파일로 재생되고,
등록되지 않은 키는 내장 음성이 그대로 읽습니다. 그래서 **숫자만 먼저 녹음하고
나머지는 천천히 채워도** 문제없이 돌아갑니다.

## 1. 파일 준비

- 형식: `.mp3` 또는 `.m4a` (아이폰 사파리에서 둘 다 재생됩니다)
- 길이: 숫자 하나당 0.5초 안쪽. 앞뒤 무음은 잘라내세요 — 무음이 남으면 카운트가 밀립니다.
- 음량: 파일마다 크기가 들쭉날쭉하지 않게 맞춰 두세요.

## 2. 폴더에 넣기

목소리별로 폴더를 나누면 나중에 갈아 끼우기 편합니다.

```
audio/
  manifest.json
  ko-f/
    count-1.mp3 … count-30.mp3
    ready.mp3  start.mp3  last.mp3 …
```

## 3. manifest.json 에 등록

```json
{
  "voice": "밝은 여성 목소리",
  "clips": {
    "count.1": "./audio/ko-f/count-1.mp3",
    "count.2": "./audio/ko-f/count-2.mp3",

    "cue.ready":        "./audio/ko-f/ready.mp3",
    "cue.start":        "./audio/ko-f/start.mp3",
    "cue.last":         "./audio/ko-f/last.mp3",
    "cue.set_done":     "./audio/ko-f/set-done.mp3",
    "cue.rest_start":   "./audio/ko-f/rest-start.mp3",
    "cue.rest_soon":    "./audio/ko-f/rest-soon.mp3",
    "cue.rest_done":    "./audio/ko-f/rest-done.mp3",
    "cue.next_exercise":"./audio/ko-f/next.mp3",
    "cue.workout_done": "./audio/ko-f/done.mp3"
  }
}
```

## 4. 키 목록

| 키 | 읽는 말 | 쓰이는 곳 |
|---|---|---|
| `count.1` … `count.30` | 하나, 둘, 셋 … | 횟수 세기 · 시작 전 카운트다운 |
| `cue.ready` | 준비 | 세트 시작 직전 |
| `cue.start` | 시작 | 첫 횟수 직전 |
| `cue.last` | 마지막 | 설정한 횟수만큼 남았을 때 |
| `cue.set_done` | 세트 완료 | 세트를 마쳤을 때 |
| `cue.rest_start` | 휴식 | 휴식 시작 |
| `cue.rest_soon` | 십 초 남았습니다 | 휴식 끝나기 전 |
| `cue.rest_done` | 휴식 끝 | 휴식이 끝났을 때 |
| `cue.next_exercise` | 다음 운동 | 다음 종목으로 넘어갈 때 |
| `cue.workout_done` | 오늘 운동 완료 | 전체를 마쳤을 때 |

`cue.next_exercise` 는 내장 음성일 때 "다음 운동, 랫풀다운"처럼 종목 이름까지 읽지만,
파일로 등록하면 종목 이름 없이 그 파일만 재생됩니다.

카운트다운을 3초로 쓴다면 `count.1` ~ `count.3` 은 반드시 필요하고,
횟수는 평소 하는 최대 횟수까지만 있으면 됩니다(보통 `count.20` 정도).
없는 숫자는 자동으로 내장 음성이 읽어 줍니다.

## 5. 캐시 비우기

파일을 바꿔 넣었는데 예전 소리가 나면, 서비스 워커가 캐시해 둔 것입니다.
브라우저에서 새로고침을 한 번 더 하거나, 홈 화면 앱을 껐다 켜면 반영됩니다.
