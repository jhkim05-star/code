# 가족 로그라이크 — Level 1

Phaser 4 + TypeScript + Vite로 만든 첫 연습 전투입니다. 공격·방어 카드를 사용하고 턴을 종료해 한 명의 적과 겨룹니다. 저장·맵·덱 편집·아트·사운드는 아직 없습니다.

```sh
npm install
npm run dev
npm test
npm run build
```

개발 서버 주소는 터미널에 표시됩니다. 가로 화면을 기준으로 960×540 게임 영역 전체가 화면 안에 맞춰집니다. 세로 화면에서도 영역을 자르지 않고 축소해 보여주므로 글자가 작아질 수 있습니다.

Vite 빌드는 상대 자산 경로를 사용하므로 `/code/family-roguelike/` 같은 GitHub Pages 하위 경로에서도 작동합니다. 배포할 때는 `dist/`의 내용을 해당 경로에 게시해야 합니다.

이 저장소의 Pages 작업은 게임을 빌드한 다음 `dist/`만 `/code/family-roguelike/`에 게시합니다. 기존 정적 앱의 파일은 그대로 유지합니다.
