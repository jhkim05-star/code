// 씬 전반에서 쓰는 색상 팔레트. 정식 아트 없이도 카드 종류·희귀도·맵 노드
// 종류를 색으로 구분해서 "그래픽적 차별화"를 최소한으로 준다.

export const LOGICAL_WIDTH = 960;
export const LOGICAL_HEIGHT = 540;

export const COLORS = {
  background: 0x0d1526,
  panel: 0x16213a,
  panelBorder: 0x2a3a63,
  button: 0x2f7f4f,
  buttonHover: 0x3c9c62,
  buttonDisabled: 0x1c2c22,
  danger: 0x7f2f2f,
  dangerHover: 0x9c3c3c,
  cardBg: {
    attack: 0x3a1f28,
    skill: 0x1f2b4a,
    power: 0x3a2b4a,
  } as Record<string, number>,
  cardBgDisabled: 0x141c30,
  rarityBorder: {
    basic: 0x5c6b8a,
    common: 0xaeb9d4,
    uncommon: 0x4fa3ff,
    rare: 0xf2c94c,
  } as Record<string, number>,
  nodeType: {
    combat: 0x3a1f28,
    elite: 0x5a1533,
    event: 0x1f3a2e,
    rest: 0x1f3350,
    shop: 0x4a3a1f,
    boss: 0x4a1515,
  } as Record<string, number>,
};

export const TEXT = {
  primary: '#ffffff',
  secondary: '#c9d6f5',
  muted: '#7481a3',
  gold: '#f2c94c',
  danger: '#ff8a80',
  good: '#8fd68f',
};
