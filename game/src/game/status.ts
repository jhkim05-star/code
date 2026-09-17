// 상태 효과(버프/디버프) 정의. cards.ts와 combat.ts 양쪽에서 참조하므로
// 순환 참조를 피하기 위해 독립 모듈로 둔다.

export type StatusId =
  | 'strength' // 기합: 이 전투 동안 공격 피해 +N (영구, 감소하지 않음)
  | 'dexterity' // 유연함: 이 전투 동안 방어도 획득 +N (영구, 감소하지 않음)
  | 'weak' // 위축: 이 상태를 가진 쪽이 주는 피해 -25%. 자기 턴이 끝날 때 1 감소
  | 'vulnerable' // 빈틈: 이 상태를 가진 쪽이 받는 피해 +50%. 자기 턴이 끝날 때 1 감소
  | 'poison' // 잔소리: 자기 턴 시작 시 스택만큼 피해(방어 무시), 이후 1 감소
  | 'thorns' // 정색: 공격을 받을 때마다 스택만큼 반사 피해(영구, 감소하지 않음)
  | 'strengthRegen' // 근성: 자기 턴 시작 시 기합 +N (영구 능력치)
  | 'dexterityRegen' // 홈트 루틴: 자기 턴 시작 시 유연함 +N (영구 능력치)
  | 'blockRegen' // 방패막이 정신: 자기 턴 시작 시 방어도 +N (영구 능력치)
  | 'poisonAmplify'; // 잔소리 체질: 잔소리를 걸 때마다 스택 +N 추가 부여 (영구 능력치)

export type StatusMap = Partial<Record<StatusId, number>>;

// 매 턴 시작 시 감소하는 상태(지속시간 개념). 나머지는 전투 내내 유지된다.
const DECAYING_STATUSES: StatusId[] = ['weak', 'vulnerable'];

export function getStatus(statuses: StatusMap, id: StatusId): number {
  return statuses[id] ?? 0;
}

export function addStatus(statuses: StatusMap, id: StatusId, amount: number): StatusMap {
  if (amount === 0) return statuses;
  const next = { ...statuses, [id]: getStatus(statuses, id) + amount };
  if ((next[id] ?? 0) <= 0) delete next[id];
  return next;
}

// 공격자의 기합/위축을 반영해 최종 피해량을 계산한다.
export function applyOutgoingModifiers(baseAmount: number, attacker: StatusMap): number {
  let amount = baseAmount + getStatus(attacker, 'strength');
  if (getStatus(attacker, 'weak') > 0) amount = Math.floor(amount * 0.75);
  return Math.max(0, amount);
}

// 방어자의 빈틈을 반영해 최종 피해량을 계산한다.
export function applyIncomingModifiers(amount: number, defender: StatusMap): number {
  if (getStatus(defender, 'vulnerable') > 0) return Math.ceil(amount * 1.5);
  return amount;
}

// 자기 턴 시작 시 처리: 잔소리(poison) 피해 계산 + poison/weak/vulnerable 감소.
export function tickStartOfTurn(statuses: StatusMap): { statuses: StatusMap; poisonDamage: number } {
  let next = { ...statuses };
  const poisonDamage = getStatus(next, 'poison');
  if (poisonDamage > 0) next = addStatus(next, 'poison', -1);
  for (const id of DECAYING_STATUSES) {
    if (getStatus(next, id) > 0) next = addStatus(next, id, -1);
  }
  return { statuses: next, poisonDamage };
}

// 턴 시작 시 발동하는 영구 능력치(파워) 효과. 반환값은 이번 턴에 추가로
// 얻는 방어도(있다면)이며, 기합/유연함은 statuses에 바로 반영된다.
export function applyRegenPowers(statuses: StatusMap): { statuses: StatusMap; bonusBlock: number } {
  let next = statuses;
  const strengthGain = getStatus(next, 'strengthRegen');
  if (strengthGain > 0) next = addStatus(next, 'strength', strengthGain);
  const dexGain = getStatus(next, 'dexterityRegen');
  if (dexGain > 0) next = addStatus(next, 'dexterity', dexGain);
  const bonusBlock = getStatus(next, 'blockRegen');
  return { statuses: next, bonusBlock };
}
