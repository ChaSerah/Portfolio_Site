# 반응속도 대결 (Reaction Duel)

휴대폰 한 대를 테이블에 놓고 두 사람이 마주 앉아 하는 반응속도 게임입니다.
화면이 초록(민트)색으로 바뀌는 순간 자기 쪽 화면을 먼저 누르는 사람이 이깁니다.

- 배포 주소: https://reaction-duel-one-phone.vercel.app (→ `/reaction/` 으로 이동)
- QR 화면만 띄우기: https://reaction-duel-one-phone.vercel.app/reaction/?qr
- 서버·DB 없이 브라우저에서만 동작하는 정적 사이트입니다. (빌드 과정 없음)

---

## 1. 파일 구성

```
reaction/
├─ index.html     화면 구조와 문구 (홈 · 게임 · 결과 · QR 4개 화면)
├─ config.js      ★ 색 · 게임 시간 · 배경 빛 설정 (대부분의 수정은 여기서)
├─ reaction.css   레이아웃 · 글꼴 · 크기 · 간격
├─ reaction.js    게임 규칙 (라운드 진행, 부정출발, 승패 계산, 결과표, QR 생성)
├─ circuit.js     배경 회로 그림 + 회로를 따라 흐르는 빛 (canvas)
├─ frames.js      버튼 · 입력칸 · 패널 · 카드 테두리 (canvas)
├─ gamefx.js      게임 화면 HUD: 모서리 브래킷 · P1/P2 상태 · 승리 칸 · 가운데 띠 (canvas)
└─ vendor/qrcode.js   QR 코드 생성 라이브러리 (MIT, 수정 불필요)
```

스크립트 실행 순서: `config.js` → `circuit.js` → `gamefx.js` → `frames.js` → `vendor/qrcode.js` → `reaction.js`

---

## 2. 자주 하는 수정

| 바꾸고 싶은 것 | 수정할 곳 |
|---|---|
| 플레이어 색, 신호(초록) 색, 대기 화면 색, 회로 색 | `config.js` → `colors` |
| 대기 시간, 신호 후 제한 시간, 부정출발 기준, 카운트다운 | `config.js` → `timing` |
| 배경 빛 개수 · 속도 · 회로 진하기 | `config.js` → `circuit` |
| 제목, 안내 문구, 규칙 설명, 버튼 이름 | `index.html` |
| "기다리세요…", "터치!", "부정출발!", "승리!" 같은 게임 중 문구 | `reaction.js` (`startRound`, `foul`, `finishRound` 함수) |
| 라운드 선택지 (3 · 5 · 7) | `index.html` 의 `.rounds` 부분 (기본 선택은 `checked`) |
| 글꼴 | `index.html` 의 Google Fonts 링크 + `reaction.css` 맨 위 `--font-*` 변수 |
| 글자 크기 · 여백 · 버튼 높이 | `reaction.css` |
| 버튼 · 입력칸 테두리 모양(깎인 모서리, 줄무늬 등) | `frames.js` (`drawPrimary`, `drawGhost`, `drawInput`, `drawPanel`, `drawCard`, `drawRound`) |
| 게임 화면 장식 (브래킷, 상태 문구 STANDBY/GO/WIN…, 승리 칸) | `gamefx.js` (`drawHalf`, `drawBar`) |
| 배경 회로 모양 | `circuit.js` 의 `traces`(선) · `marks`(끝점) 좌표 |

> ⚠️ **색은 `config.js` 에서만 바꾸세요.** 같은 색이 CSS와 canvas 양쪽에 쓰이는데,
> `config.js` 가 두 곳에 동시에 반영합니다. `reaction.css` 의 색만 바꾸면
> canvas로 그리는 테두리·글자는 안 바뀝니다.

---

## 3. 왜 canvas로 그리나요? (삼성 인터넷 다크모드)

삼성 인터넷은 휴대폰이 다크모드일 때 **웹페이지의 CSS 색을 임의로 어둡게 바꿉니다.**
(`color-scheme: dark` 같은 표준 설정도 무시하는 경우가 있음)
그래서 하늘색 버튼이 청록색이 되고, 초록 신호가 어두운 올리브색이 되는 문제가 있었습니다.
canvas로 그린 그림은 바꾸지 않기 때문에, 색이 중요한 부분은 모두 canvas로 그립니다.

canvas로 그리는 것:
- 배경 회로와 빛 (`circuit.js`)
- 버튼 · 입력칸 · 라운드 선택 · 패널 · 결과 카드 테두리, P1/P2 표시, 플레이어 색 점 (`frames.js`)
- 안내 문구의 "초록색" 글자, 결과표의 이긴 기록 숫자 (`frames.js` 의 `drawWord`)
- 게임 화면 HUD (`gamefx.js`)
- 신호(터치!) 화면 전체 (`reaction.js` 의 `paintGo`)
- QR 코드 (`reaction.js` 의 `renderQr`) — 다크모드가 흰 바탕을 뒤집으면 QR이 안 찍히므로

**새로 색 있는 요소를 추가할 때:** 일반 CSS로 만든 뒤, 삼성 인터넷 다크모드에서 색이 변하면
`frames.js` 의 `rules` 목록에 `[선택자, 여백, 그리는함수]` 를 추가해 canvas로 그리세요.
`frames.js` 가 동작하면 `<html>` 에 `has-fx` 클래스가 붙고, `reaction.css` 의 `.has-fx …` 규칙이
CSS 쪽 테두리를 숨깁니다. (JS가 실패해도 CSS 테두리가 대신 보이도록 남겨 둔 것)

---

## 4. 게임 규칙 (현재 구현)

- 시작 시 3 → 2 → 1 카운트다운, 이후 매 라운드 대기(빨강) → 신호(초록)
- 대기 화면에서 누르면 **부정출발 → 그 라운드는 상대 승점**
- 신호 후 `minHumanMs`(80ms) 안에 누르면 예측 출발로 보고 부정출발 처리
- 신호 후 `goTimeout`(1.5초) 안에 안 누르면 시간 초과
- 승수가 같으면 평균 반응속도가 빠른 쪽이 최종 승리
- 닉네임은 저장하지 않음 (매번 빈 칸으로 시작)
- PC(마우스 환경)로 열면 QR 화면이 먼저 뜨고, 휴대폰은 닉네임 입력 화면부터 뜸
- 게임 중에는 배경 애니메이션을 멈춤 (반응속도 측정에 영향 없도록)

---

## 5. 내 컴퓨터에서 실행하기

빌드가 필요 없어서 아무 정적 서버로 열면 됩니다.

```bash
# 저장소 최상위 폴더에서
python3 -m http.server 8000
# 브라우저에서 http://localhost:8000/reaction/ 열기
```

- 휴대폰 화면으로 보려면 크롬 개발자 도구(F12) → 기기 모드(Ctrl+Shift+M)
- PC에서 열면 QR 화면이 먼저 뜹니다. 바로 게임 화면을 보려면 `?play` 를 붙이세요:
  `http://localhost:8000/reaction/?play`
- 파일을 바꾼 뒤 휴대폰에서 예전 화면이 보이면 새로고침하세요.
  배포할 때는 `index.html` 안의 `?v=...` 값을 바꿔 주면 캐시가 확실히 갱신됩니다.

---

## 6. 배포 (Vercel)

Vercel 프로젝트 `reaction-duel-one-phone` 에 게임 폴더만 올립니다.

```bash
# 저장소 최상위 폴더에서 (vercel CLI 로그인 필요)
bash deploy/reaction-duel/deploy.sh
```

- `deploy/reaction-duel/vercel.json` : 사이트 첫 주소(`/`)를 `/reaction/` 으로 보내는 설정
- 배포는 프로젝트 관리자 계정으로 해야 합니다. 팀원이 직접 배포하려면 Vercel 팀에 초대가 필요합니다.
- 배포 후 휴대폰(특히 삼성 인터넷 다크모드)에서 한 번 확인해 주세요.

---

## 7. 수정 후 확인 목록

- [ ] 휴대폰에서 한 판 끝까지 (위·아래 터치 모두 반응하는지)
- [ ] 대기 화면에서 눌러서 부정출발 → 상대에게 승점이 가는지
- [ ] 결과 화면 → 다시 대결 / 처음으로
- [ ] QR 공유 화면 → 다른 폰 카메라로 QR이 찍히는지
- [ ] 삼성 인터넷 + 다크모드에서 색이 그대로인지
- [ ] 위쪽 플레이어 화면이 거꾸로(마주 앉은 사람 기준) 보이는지
