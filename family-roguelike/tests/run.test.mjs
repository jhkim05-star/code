import test from 'node:test';
import assert from 'node:assert/strict';
import { STARTER_DECK } from '../src/game/cards.ts';
import { FLOOR_ENEMIES } from '../src/game/enemies.ts';
import { applyDeckAction, cancelDeckAction, chooseDeckAction, chooseReward, endRunTurn, FINAL_FLOOR, playRunCard, rollRewards, skipReward, startRun } from '../src/game/run.ts';

const fixedRandom = () => 0;

function oneHitFromWin(run, playerHp = run.playerHp) {
  return {
    ...run,
    playerHp,
    battle: { ...run.battle, playerHp, enemyHp: 6, energy: 1, hand: ['strike'] },
  };
}

test('a new run starts on floor one with the starter deck and prior best intact', () => {
  const run = startRun(4, fixedRandom);
  assert.equal(run.phase, 'battle');
  assert.equal(run.floor, 1);
  assert.equal(run.bestFloor, 4);
  assert.equal(run.playerHp, 30);
  assert.deepEqual(run.deck, STARTER_DECK);
  assert.equal(run.battle.enemy, FLOOR_ENEMIES[0]);
  assert.equal(run.battle.hand.length, 5);
});

test('winning a normal floor requires exactly one reward before the next battle', () => {
  const before = oneHitFromWin(startRun(0, fixedRandom), 23);
  const reward = playRunCard(before, 0, fixedRandom);
  assert.equal(reward.phase, 'reward');
  assert.equal(reward.floor, 1);
  assert.equal(reward.playerHp, 23);
  assert.equal(endRunTurn(reward), reward);
  assert.equal(playRunCard(reward, 0), reward);
  assert.equal(chooseReward(reward, -1), reward);
  assert.equal(chooseReward(reward, reward.rewardOptions.length), reward);

  const next = chooseReward(reward, 1, fixedRandom);
  assert.equal(next.phase, 'battle');
  assert.equal(next.floor, 2);
  assert.equal(next.bestFloor, 2);
  assert.equal(next.playerHp, 23);
  assert.equal(next.battle.playerHp, 23);
  assert.equal(next.battle.enemy, FLOOR_ENEMIES[1]);
  assert.equal(next.deck.length, STARTER_DECK.length + 1);
  assert.equal(next.deck.at(-1), reward.rewardOptions[1]);
  assert.equal(next.battle.hand.length + next.battle.drawPile.length, next.deck.length);
  assert.equal(chooseReward(next, 0), next);
  assert.equal(before.deck.length, STARTER_DECK.length);
});

test('four rewards build the deck and the fifth floor ends at the boss', () => {
  let run = startRun(0, fixedRandom);
  for (let floor = 1; floor <= FINAL_FLOOR; floor++) {
    run = playRunCard(oneHitFromWin(run), 0, fixedRandom);
    if (floor < FINAL_FLOOR) {
      assert.equal(run.phase, 'reward');
      run = chooseReward(run, 0, fixedRandom);
      assert.equal(run.floor, floor + 1);
      assert.equal(run.deck.length, STARTER_DECK.length + floor);
    }
  }
  assert.equal(run.phase, 'won');
  assert.equal(run.floor, FINAL_FLOOR);
  assert.equal(run.bestFloor, FINAL_FLOOR);
  assert.equal(run.deck.length, STARTER_DECK.length + FINAL_FLOOR - 1);
  assert.equal(chooseReward(run, 0), run);
  assert.equal(endRunTurn(run), run);
});

test('defeat locks the run and restarting restores HP and deck while keeping best floor', () => {
  const start = startRun(3, fixedRandom);
  const nearDefeat = { ...start, playerHp: 3, battle: { ...start.battle, playerHp: 3 } };
  const lost = endRunTurn(nearDefeat, fixedRandom);
  assert.equal(lost.phase, 'lost');
  assert.equal(lost.playerHp, 0);
  assert.equal(playRunCard(lost, 0), lost);
  assert.equal(chooseReward(lost, 0), lost);
  const restarted = startRun(lost.bestFloor, fixedRandom);
  assert.equal(restarted.playerHp, 30);
  assert.equal(restarted.floor, 1);
  assert.equal(restarted.bestFloor, 3);
  assert.deepEqual(restarted.deck, STARTER_DECK);
});

test('reward choices are distinct and a rare card can appear', () => {
  const common = rollRewards(fixedRandom);
  assert.deepEqual(common, ['jab', 'heavyStrike', 'fortify']);
  assert.equal(new Set(common).size, 3);
  const rare = rollRewards(() => 0.99);
  assert.equal(rare[0], 'catalyst');
  assert.equal(new Set(rare).size, 3);
});

test('upgrade or removal replaces card gain and can be cancelled', () => {
  const reward = playRunCard(oneHitFromWin(startRun(0, fixedRandom)), 0, fixedRandom);
  const upgrading = chooseDeckAction(reward, 'upgrade');
  assert.equal(upgrading.phase, 'manage');
  assert.equal(chooseReward(upgrading, 0), upgrading);
  assert.equal(applyDeckAction(upgrading, -1), upgrading);
  const back = cancelDeckAction(upgrading);
  assert.equal(back.phase, 'reward');
  assert.deepEqual(back.deck, STARTER_DECK);

  const upgraded = applyDeckAction(upgrading, 0, fixedRandom);
  assert.equal(upgraded.phase, 'battle');
  assert.equal(upgraded.floor, 2);
  assert.equal(upgraded.deck[0], 'strikePlus');
  assert.equal(upgraded.deck.length, STARTER_DECK.length);
  assert.equal(upgraded.battle.hand.includes('strikePlus') || upgraded.battle.drawPile.includes('strikePlus'), true);
  assert.equal(applyDeckAction(upgraded, 0), upgraded);

  const removing = chooseDeckAction(reward, 'remove');
  const removed = applyDeckAction(removing, 0, fixedRandom);
  assert.equal(removed.floor, 2);
  assert.equal(removed.deck.length, STARTER_DECK.length - 1);
  assert.equal(reward.deck.length, STARTER_DECK.length);
  assert.equal(skipReward(reward, fixedRandom).deck.length, STARTER_DECK.length);
});
