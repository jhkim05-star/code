import test from 'node:test';
import assert from 'node:assert/strict';
import { STARTER_DECK } from '../src/game/cards.ts';
import {
  applyChapterDeckAction, buyShopCard, buyShopHeal, buyShopRemoval, canTravel,
  cancelChapterDeckAction, CHAPTER_FLOORS, chooseChapterReward, chooseEvent,
  endChapterTurn, enterNode, generateMap, leaveShop, playChapterCard, restHeal,
  restUpgrade, shopPrice, skipChapterReward, startChapter,
} from '../src/game/chapter.ts';
import { createBattle, endTurn, playCard } from '../src/game/combat.ts';
import { CHAPTER_ENEMIES, enemyAction } from '../src/game/enemies.ts';

const fixedRandom = () => 0;
const nearWin = chapter => ({ ...chapter, battle: { ...chapter.battle, enemyHp: 6, energy: 1, hand: ['strike'] } });

test('chapter map has twelve connected rows and ends at the unique boss', () => {
  const map = generateMap(fixedRandom);
  assert.equal(map.length, CHAPTER_FLOORS);
  assert.equal(map[0].length, 1);
  assert.deepEqual(map.at(-1).map(node => node.kind), ['boss']);
  assert.equal(canTravel(map, [], 0), true);
  assert.equal(canTravel(map, [], 1), false);
  const path = [];
  for (let row = 0; row < map.length; row++) {
    const next = map[row].findIndex((_, index) => canTravel(map, path, index));
    assert.notEqual(next, -1);
    path.push(next);
  }
  assert.equal(path.length, CHAPTER_FLOORS);
});

test('enemy intent changes, block absorbs damage, and power increases later attacks', () => {
  let state = createBattle({ enemy: CHAPTER_ENEMIES.sock, playerHp: 30, deck: ['strike', 'guard'] }, fixedRandom);
  assert.equal(enemyAction(state.enemy, state.turn).type, 'attack');
  state = endTurn(state, fixedRandom);
  assert.equal(state.playerHp, 26);
  assert.equal(enemyAction(state.enemy, state.turn).type, 'block');
  state = endTurn(state, fixedRandom);
  assert.equal(state.enemyBlock, 5);
  state = playCard(state, state.hand.indexOf('strike'));
  assert.equal(state.enemyHp, CHAPTER_ENEMIES.sock.maxHp - 1);

  let powered = createBattle({ enemy: CHAPTER_ENEMIES.dust, playerHp: 30, deck: ['guard'] }, fixedRandom);
  powered = endTurn(powered, fixedRandom);
  powered = endTurn(powered, fixedRandom);
  assert.equal(powered.enemyStrength, 1);
  assert.equal(enemyAction(powered.enemy, powered.turn).value + powered.enemyStrength, 7);
});

test('battle victory grants gold and exactly one deck reward before the map', () => {
  const start = startChapter(0, fixedRandom);
  const entered = enterNode(start, 0, fixedRandom);
  assert.equal(entered.phase, 'battle');
  assert.equal(entered.path.length, 1);
  const reward = playChapterCard(nearWin(entered), 0, fixedRandom);
  assert.equal(reward.phase, 'reward');
  assert.equal(reward.gold, 34);
  assert.equal(reward.rewardOptions.length, 3);
  assert.equal(new Set(reward.rewardOptions).size, 3);
  assert.equal(endChapterTurn(reward), reward);
  const next = chooseChapterReward(reward, 0);
  assert.equal(next.phase, 'map');
  assert.equal(next.deck.length, STARTER_DECK.length + 1);
  assert.equal(next.deck.at(-1), reward.rewardOptions[0]);
  assert.equal(chooseChapterReward(next, 0), next);
  assert.equal(skipChapterReward(reward).deck.length, STARTER_DECK.length);
  assert.equal(start.deck.length, STARTER_DECK.length);
});

test('rest, events, and shop change resources without bypassing their choices', () => {
  const start = startChapter(0, fixedRandom);
  const event = { ...start, phase: 'event', eventId: 'remote', playerHp: 20 };
  const found = chooseEvent(event, 1);
  assert.equal(found.phase, 'map');
  assert.equal(found.playerHp, 17);
  assert.equal(found.deck.at(-1), 'remoteBounce');
  assert.equal(chooseEvent(found, 0), found);

  const rest = { ...start, phase: 'rest', playerHp: 19 };
  assert.equal(restHeal(rest).playerHp, 30);
  const upgrading = restUpgrade(rest);
  assert.equal(upgrading.phase, 'manage');
  assert.equal(cancelChapterDeckAction(upgrading).phase, 'rest');
  assert.equal(applyChapterDeckAction(upgrading, 0).deck[0], 'strikePlus');

  const shop = { ...start, phase: 'shop', gold: 100, playerHp: 20, shopStock: ['jab', null, 'catalyst'] };
  const bought = buyShopCard(shop, 0);
  assert.equal(bought.deck.at(-1), 'jab');
  assert.equal(bought.gold, 100 - shopPrice('jab'));
  assert.equal(buyShopCard(bought, 0), bought);
  const healed = buyShopHeal(shop);
  assert.equal(healed.playerHp, 30);
  assert.equal(buyShopHeal(healed), healed);
  const removeChoice = buyShopRemoval(shop);
  assert.equal(removeChoice.phase, 'manage');
  assert.equal(removeChoice.gold, 100);
  assert.equal(cancelChapterDeckAction(removeChoice).gold, 100);
  const removed = applyChapterDeckAction(removeChoice, 0);
  assert.equal(removed.phase, 'shop');
  assert.equal(removed.gold, 65);
  assert.equal(removed.deck.length, 9);
  assert.equal(leaveShop(removed).phase, 'map');
});

test('a complete path reaches the boss and then locks the chapter', () => {
  let chapter = startChapter(0, fixedRandom);
  for (let row = 0; row < CHAPTER_FLOORS; row++) {
    const index = chapter.map[row].findIndex((_, i) => canTravel(chapter.map, chapter.path, i));
    chapter = enterNode(chapter, index, fixedRandom);
    if (chapter.phase === 'battle') {
      chapter = playChapterCard(nearWin(chapter), 0, fixedRandom);
      if (chapter.phase === 'reward') chapter = skipChapterReward(chapter);
    } else if (chapter.phase === 'event') chapter = chooseEvent(chapter, 0);
    else if (chapter.phase === 'rest') chapter = restHeal(chapter);
    else if (chapter.phase === 'shop') chapter = leaveShop(chapter);
  }
  assert.equal(chapter.phase, 'won');
  assert.equal(chapter.bestFloor, CHAPTER_FLOORS);
  assert.equal(chapter.path.length, CHAPTER_FLOORS);
  assert.equal(enterNode(chapter, 0), chapter);
  assert.equal(playChapterCard(chapter, 0), chapter);
});

test('defeat stops progress and a new chapter starts fresh with the best record', () => {
  const entered = enterNode(startChapter(5, fixedRandom), 0, fixedRandom);
  const nearDefeat = { ...entered, playerHp: 2, battle: { ...entered.battle, playerHp: 2 } };
  const lost = endChapterTurn(nearDefeat, fixedRandom);
  assert.equal(lost.phase, 'lost');
  assert.equal(lost.playerHp, 0);
  assert.equal(enterNode(lost, 0), lost);
  const fresh = startChapter(lost.bestFloor, fixedRandom);
  assert.equal(fresh.playerHp, 30);
  assert.equal(fresh.path.length, 0);
  assert.equal(fresh.bestFloor, 5);
});
