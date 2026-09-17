// "우리 집" 사건(이벤트) 5종. 선택지마다 런 상태를 직접 바꾸는 함수를 들고 있다.

import { CARD_LIBRARY, getObtainableCardPool } from './cards';
import { pickRandom } from './rng';
import {
  addCardToDeck,
  applyPlayerHpDelta,
  pickRandomEligibleCard,
  removeCardFromDeck,
  upgradeCardInDeck,
  type RunState,
} from './run';

export interface EventChoiceResult {
  run: RunState;
  resultText: string;
}

export interface EventChoice {
  id: string;
  label: string;
  apply: (run: RunState) => EventChoiceResult;
}

export interface EventDefinition {
  id: string;
  title: string;
  description: string;
  choices: EventChoice[];
}

export const EVENT_LIBRARY: Record<string, EventDefinition> = {
  fridge_raid: {
    id: 'fridge_raid',
    title: '냉장고를 열었다',
    description: '냉장고 문을 열자 어제 먹다 남긴 무언가가 보인다. 먹어 볼까?',
    choices: [
      {
        id: 'eat',
        label: '일단 먹는다',
        apply: (run) => {
          if (Math.random() < 0.7) {
            return { run: applyPlayerHpDelta(run, 8), resultText: '의외로 맛있었다! 체력 8 회복.' };
          }
          return { run: applyPlayerHpDelta(run, -4), resultText: '상한 것이었다... 체력 4 손실.' };
        },
      },
      {
        id: 'skip',
        label: '참는다',
        apply: (run) => ({ run, resultText: '꾹 참고 냉장고 문을 닫았다.' }),
      },
      {
        id: 'mystery_can',
        label: '정체불명의 통조림을 챙긴다',
        apply: (run) => {
          const def = pickRandom(getObtainableCardPool());
          return { run: addCardToDeck(run, def.id), resultText: `카드 "${def.name}"를 얻었다.` };
        },
      },
    ],
  },

  group_chat: {
    id: 'group_chat',
    title: '가족 단톡방 99+',
    description: '안 읽은 메시지가 99개 넘게 쌓여 있다. 다 읽어볼까?',
    choices: [
      {
        id: 'read_all',
        label: '다 읽는다',
        apply: (run) => {
          const withGold = { ...applyPlayerHpDelta(run, -3), gold: run.gold + 15 };
          return { run: withGold, resultText: '용돈 15 받았지만 피곤해서 체력 3 손실.' };
        },
      },
      {
        id: 'ignore',
        label: '무시한다',
        apply: (run) => ({ run, resultText: '안읽음 99+는 그대로 두기로 했다.' }),
      },
      {
        id: 'funny_reply',
        label: '웃긴 답장을 남긴다',
        apply: (run) => {
          const card = pickRandomEligibleCard(run.deck, (c) => !c.upgraded);
          if (!card) return { run, resultText: '강화할 카드가 없었다.' };
          const def = CARD_LIBRARY[card.defId];
          return { run: upgradeCardInDeck(run, card.uid), resultText: `다들 빵 터졌다! "${def.name}" 카드가 강화됐다.` };
        },
      },
    ],
  },

  homework: {
    id: 'homework',
    title: '숙제를 미뤘다',
    description: '방학 숙제가 아직 그대로다. 지금 해치울까, 좀 더 미룰까?',
    choices: [
      {
        id: 'do_now',
        label: '지금 해치운다',
        apply: (run) => {
          const card = pickRandomEligibleCard(run.deck, (c) => !c.upgraded);
          const afterHp = applyPlayerHpDelta(run, -5);
          if (!card) return { run: afterHp, resultText: '체력 5를 쓰고 숙제를 끝냈다.' };
          const def = CARD_LIBRARY[card.defId];
          return {
            run: upgradeCardInDeck(afterHp, card.uid),
            resultText: `체력 5를 썼지만 뿌듯해서 "${def.name}" 카드가 강화됐다.`,
          };
        },
      },
      {
        id: 'procrastinate',
        label: '일단 미룬다',
        apply: (run) => ({ run: applyPlayerHpDelta(run, 5), resultText: '마음이 편해져 체력 5 회복.' }),
      },
    ],
  },

  closet_cleanup: {
    id: 'closet_cleanup',
    title: '옷장 정리',
    description: '안 입는 옷이 옷장에 가득하다. 정리하면 카드 한 장을 덱에서 뺄 수 있을 것 같다.',
    choices: [
      {
        id: 'clean',
        label: '정리해서 카드를 뺀다',
        apply: (run) => {
          const card = pickRandomEligibleCard(run.deck);
          if (!card) return { run, resultText: '뺄 카드가 없었다.' };
          const def = CARD_LIBRARY[card.defId];
          return { run: removeCardFromDeck(run, card.uid), resultText: `"${def.name}" 카드를 정리해서 덱에서 뺐다.` };
        },
      },
      {
        id: 'later',
        label: '나중에 한다',
        apply: (run) => ({ run, resultText: '옷장 문을 슬쩍 닫았다.' }),
      },
    ],
  },

  sibling_help: {
    id: 'sibling_help',
    title: '형/누나가 도와줬다',
    description: '형/누나가 다가와 뭔가 도와주겠다고 한다.',
    choices: [
      {
        id: 'accept',
        label: '도움을 받는다',
        apply: (run) => {
          const card = pickRandomEligibleCard(run.deck, (c) => !c.upgraded);
          if (!card) return { run, resultText: '강화할 카드가 없었다.' };
          const def = CARD_LIBRARY[card.defId];
          return { run: upgradeCardInDeck(run, card.uid), resultText: `"${def.name}" 카드가 강화됐다.` };
        },
      },
      {
        id: 'decline',
        label: '혼자 해보겠다고 한다',
        apply: (run) => ({ run: { ...run, gold: run.gold + 10 }, resultText: '기특하다며 용돈 10을 받았다.' }),
      },
    ],
  },
};
