import test from 'node:test';
import assert from 'node:assert/strict';
import { endTurn, playCard, startBattle } from '../src/game/combat.ts';

test('first turn starts with five cards, three energy and intact deck', () => {
  const state = startBattle();
  assert.equal(state.phase, 'player');
  assert.equal(state.hand.length, 5);
  assert.equal(state.drawPile.length + state.hand.length + state.discardPile.length, 10);
  assert.equal(state.energy, 3);
  assert.equal(state.playerHp, 30);
  assert.equal(state.enemyHp, 30);
});

test('attack spends energy and damages enemy without mutating previous state', () => {
  const before = startBattle();
  const after = playCard(before, 0);
  assert.equal(after.enemyHp, 24);
  assert.equal(after.energy, 2);
  assert.equal(after.hand.length, 4);
  assert.equal(after.discardPile.length, 1);
  assert.equal(before.enemyHp, 30);
  assert.equal(before.hand.length, 5);
});

test('block absorbs enemy attack and resets when the next turn begins', () => {
  const defended = playCard(startBattle(), 1);
  const next = endTurn(defended);
  assert.equal(next.playerHp, 29);
  assert.equal(next.playerBlock, 0);
  assert.equal(next.energy, 3);
  assert.equal(next.turn, 2);
  assert.equal(next.hand.length, 5);
});

test('unaffordable and invalid card plays cannot change combat values', () => {
  let state = startBattle();
  state = playCard(state, 0);
  state = playCard(state, 0);
  state = playCard(state, 0);
  assert.equal(state.energy, 0);
  const blocked = playCard(state, 0);
  assert.equal(blocked.enemyHp, state.enemyHp);
  assert.equal(blocked.hand.length, state.hand.length);
  assert.equal(playCard(state, -1), state);
});

test('discarded cards are drawn again without loss or duplication', () => {
  let state = startBattle();
  state = playCard(state, 0);
  state = endTurn(state);
  state = endTurn(state);
  assert.equal(state.hand.length + state.drawPile.length + state.discardPile.length, 10);
  assert.equal(state.hand.length, 5);
});

test('victory and defeat stop further turns until restart', () => {
  const almostWon = { ...startBattle(), enemyHp: 6 };
  const won = playCard(almostWon, 0);
  assert.equal(won.phase, 'won');
  assert.equal(won.enemyHp, 0);
  assert.equal(endTurn(won), won);

  const almostLost = { ...startBattle(), playerHp: 4 };
  const lost = endTurn(almostLost);
  assert.equal(lost.phase, 'lost');
  assert.equal(lost.playerHp, 0);
  assert.equal(playCard(lost, 0), lost);
  assert.equal(startBattle().phase, 'player');
});
