// =============================================================
//  반응속도 대결 — 팀 편집용 설정 파일
//  색·시간·애니메이션 값은 여기서만 바꾸면 화면 전체(CSS + canvas)에 반영됩니다.
//  (다른 js 파일에 같은 값을 직접 적지 마세요)
// =============================================================
window.GAME_CONFIG = {
  // ---- 색 ----------------------------------------------------
  colors: {
    p1: "#58d5f2", // 아래쪽 플레이어 (하늘색) — 버튼 글자·강조색으로도 사용
    p2: "#ff8fb7", // 위쪽 플레이어 (분홍)
    violet: "#a77bff", // 프레임 그라데이션 끝 색 (보라)
    go: "#4cf0c4", // 신호(터치!) 화면 색 + 안내 문구의 "초록색" 글자
    wait: "#3a0d18", // 대기 화면 바탕 (어두운 빨강)
    waitPulse: "#6e1426", // 대기 화면이 밝아질 때 색 (깜빡임)
    foul: "#f2a43a", // 부정출발 강조색
    circuit: ["#3f5bff", "#5546ff", "#8b45ff"], // 배경 회로선: 위 → 가운데 → 아래
  },

  // ---- 게임 시간 (단위: 밀리초, 1000 = 1초) -------------------
  timing: {
    countdownFrom: 3, // 시작 카운트다운 숫자 (3, 2, 1)
    countdownStep: 700, // 카운트다운 한 칸 간격
    waitMin: 1400, // 대기 화면 최소 시간
    waitRandom: 3200, // 대기 화면에 더해지는 무작위 시간 (0 ~ 이 값)
    goTimeout: 1500, // 신호 후 이 시간 안에 안 누르면 시간 초과
    minHumanMs: 80, // 신호 후 이보다 빨리 누르면 예측 출발(부정출발)로 처리
    nextRoundDelay: 1900, // 라운드 결과를 보여 주는 시간
  },

  // ---- 공유 ---------------------------------------------------
  share: {
    url: "", // QR·포스터에 넣을 주소. 비워 두면 지금 열려 있는 주소를 사용
    posterFileName: "reaction-duel-qr.png", // "이미지 저장" 버튼으로 받는 파일 이름 (한글 이름은 일부 브라우저에서 무시됨)
  },

  // ---- 배경 회로 빛 -------------------------------------------
  circuit: {
    maxPulses: 4, // 동시에 흐르는 빛 개수
    speedMin: 55, // 빛 속도 (최소)
    speedMax: 90, // 빛 속도 (최대)
    opacity: 0.6, // 회로 배경 전체 진하기 (0 ~ 1)
  },
};

// 위 색을 CSS 변수에도 반영 (reaction.css 의 var(--p1) 등이 이 값을 따름)
(() => {
  const c = window.GAME_CONFIG.colors;
  const root = document.documentElement.style;
  root.setProperty("--p1", c.p1);
  root.setProperty("--aqua", c.p1);
  root.setProperty("--p2", c.p2);
  root.setProperty("--violet", c.violet);
  root.setProperty("--go", c.go);
  root.setProperty("--wait", c.wait);
  root.setProperty("--wait-hi", c.waitPulse);
  root.setProperty("--foul", c.foul);
  root.setProperty("--circuit-opacity", String(window.GAME_CONFIG.circuit.opacity));
})();
