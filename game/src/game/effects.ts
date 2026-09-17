// 카드와 적 행동이 공유하는 "효과" 어휘. 카드 텍스트와 적의 다음 행동
// 설명을 같은 방식으로 만들어서 서로 다른 문구로 어긋나는 일이 없게 한다.

import { getStatus, type StatusId, type StatusMap } from './status';

export type CardEffectStep =
  | { type: 'damage'; amount: number; hits?: number; bonusPerAttackPlayed?: number }
  | { type: 'block'; amount: number }
  | { type: 'applyStatus'; target: 'self' | 'enemy'; status: StatusId; amount: number }
  | { type: 'draw'; amount: number }
  | { type: 'gainEnergy'; amount: number }
  | { type: 'heal'; amount: number };

export const STATUS_LABELS: Record<StatusId, string> = {
  strength: '기합',
  dexterity: '유연함',
  weak: '위축',
  vulnerable: '빈틈',
  poison: '잔소리',
  thorns: '정색',
  strengthRegen: '근성',
  dexterityRegen: '홈트 루틴',
  blockRegen: '방패막이 정신',
  poisonAmplify: '잔소리 체질',
};

function describeStep(step: CardEffectStep): string {
  switch (step.type) {
    case 'damage':
      return step.hits && step.hits > 1
        ? `적에게 피해 ${step.amount} × ${step.hits}회`
        : `적에게 피해 ${step.amount}`;
    case 'block':
      return `방어도 ${step.amount} 획득`;
    case 'applyStatus': {
      const label = STATUS_LABELS[step.status];
      return step.target === 'self' ? `${label} ${step.amount} 획득` : `적에게 ${label} ${step.amount} 부여`;
    }
    case 'draw':
      return `카드 ${step.amount}장 뽑기`;
    case 'gainEnergy':
      return `에너지 ${step.amount} 획득`;
    case 'heal':
      return `체력 ${step.amount} 회복`;
  }
}

export function describeEffects(steps: CardEffectStep[]): string {
  return steps.map(describeStep).join(' + ');
}

// 전투 화면 상태 표시줄(HUD)에 쓰는 "기합 2 · 정색 3" 형태 요약.
export function describeStatuses(statuses: StatusMap): string {
  return (Object.keys(statuses) as StatusId[])
    .filter((id) => getStatus(statuses, id) > 0)
    .map((id) => `${STATUS_LABELS[id]} ${getStatus(statuses, id)}`)
    .join(' · ');
}

// 카드 업그레이드·적 난이도 스케일링에 쓰는 공용 수치 상향 공식.
// 최소 +1은 보장하면서 대략 30% 정도 세진다.
export function scaleAmount(amount: number, ratio = 1.3): number {
  return Math.max(amount + 1, Math.round(amount * ratio));
}

export function scaleEffects(steps: CardEffectStep[], ratio = 1.3): CardEffectStep[] {
  return steps.map((step) => {
    if (step.type === 'damage') {
      return {
        ...step,
        amount: scaleAmount(step.amount, ratio),
        bonusPerAttackPlayed:
          step.bonusPerAttackPlayed !== undefined ? scaleAmount(step.bonusPerAttackPlayed, ratio) : undefined,
      };
    }
    if (step.type === 'block' || step.type === 'heal') {
      return { ...step, amount: scaleAmount(step.amount, ratio) };
    }
    if (step.type === 'applyStatus') {
      return { ...step, amount: scaleAmount(step.amount, ratio) };
    }
    return step;
  });
}
