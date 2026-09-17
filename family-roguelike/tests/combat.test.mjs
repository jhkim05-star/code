import test from 'node:test';
import assert from 'node:assert/strict';
import { createBattle, endTurn, playCard, startBattle } from '../src/game/combat.ts';
import { STARTER_DECK } from '../src/game/cards.ts';

const fixedRandom = () => 0;
const cardCounts = cards => cards.reduce((counts, card) => {
  counts[card] = (counts[card] ?? 0) + 1;
  return counts;
}, {});
const allCards = state => [...state.drawPile, ...state.hand, ...state.discardPile];
const firstCard = (state, card) => state.hand.indexOf(card);

test('first turn starts with five cards, three energy and intact deck', () => {
  const state = startBattle(fixedRandom);
  assert.equal(state.phase, 'player');
  assert.equal(state.hand.length, 5);
  assert.equal(state.drawPile.length + state.hand.length + state.discardPile.length, 10);
  assert.equal(state.energy, 3);
  assert.equal(state.playerHp, 30);
  assert.equal(state.enemyHp, 30);
  assert.deepEqual(cardCounts(allCards(state)), cardCounts(STARTER_DECK));
});

test('attack spends energy and damages enemy without mutating previous state', () => {
  const before = startBattle(fixedRandom);
  const after = playCard(before, firstCard(before, 'strike'));
  assert.equal(after.enemyHp, 24);
  assert.equal(after.energy, 2);
  assert.equal(after.hand.length, 4);
  assert.equal(after.discardPile.length, 1);
  assert.equal(before.enemyHp, 30);
  assert.equal(before.hand.length, 5);
});

test('block absorbs enemy attack and resets when the next turn begins', () => {
  const start = startBattle(fixedRandom);
  const defended = playCard(start, firstCard(start, 'guard'));
  const next = endTurn(defended, fixedRandom);
  assert.equal(next.playerHp, 29);
  assert.equal(next.playerBlock, 0);
  assert.equal(next.energy, 3);
  assert.equal(next.turn, 2);
  assert.equal(next.hand.length, 5);
});

test('unaffordable and invalid card plays cannot change combat values', () => {
  let state = startBattle(fixedRandom);
  state = playCard(state, 0);
  state = playCard(state, 0);
  state = playCard(state, 0);
  assert.equal(state.energy, 0);
  const blocked = playCard(state, 0);
  assert.equal(blocked.enemyHp, state.enemyHp);
  assert.equal(blocked.playerBlock, state.playerBlock);
  assert.equal(blocked.hand.length, state.hand.length);
  assert.deepEqual(cardCounts(allCards(blocked)), cardCounts(STARTER_DECK));
  assert.equal(playCard(state, -1), state);
});

test('starting deck is shuffled using the supplied random source', () => {
  let calls = 0;
  const state = startBattle(() => { calls++; return 0; });
  assert.equal(calls, STARTER_DECK.length - 1);
  assert.notDeepEqual([...state.hand, ...state.drawPile], STARTER_DECK);
  assert.deepEqual(cardCounts(allCards(state)), cardCounts(STARTER_DECK));
});

test('discard pile is reshuffled when drawing after the draw pile empties', () => {
  let state = startBattle(fixedRandom);
  state = endTurn(state, fixedRandom);
  const beforeReshuffle = [...state.discardPile, ...state.hand];
  let calls = 0;
  state = endTurn(state, () => { calls++; return 0; });
  assert.equal(calls, STARTER_DECK.length - 1);
  assert.notDeepEqual([...state.hand, ...state.drawPile], beforeReshuffle);
  assert.deepEqual(cardCounts(allCards(state)), cardCounts(STARTER_DECK));
  assert.equal(state.hand.length, 5);
});

test('card counts remain unchanged across repeated turns and reshuffles', () => {
  let state = { ...startBattle(fixedRandom), playerHp: 100 };
  for (let turn = 0; turn < 10; turn++) {
    if (state.hand.length) state = playCard(state, 0);
    assert.deepEqual(cardCounts(allCards(state)), cardCounts(STARTER_DECK));
    state = endTurn(state, fixedRandom);
    assert.deepEqual(cardCounts(allCards(state)), cardCounts(STARTER_DECK));
  }
});

test('played card cannot be used again while it is outside the hand', () => {
  const state = { ...startBattle(fixedRandom), hand: ['strike'], drawPile: [], discardPile: [], enemyHp: 30 };
  const used = playCard(state, 0);
  assert.equal(used.enemyHp, 24);
  assert.deepEqual(used.hand, []);
  assert.deepEqual(used.discardPile, ['strike']);
  assert.equal(playCard(used, 0), used);
});

test('victory and defeat stop further turns until restart', () => {
  const almostWon = { ...startBattle(fixedRandom), enemyHp: 6 };
  const won = playCard(almostWon, firstCard(almostWon, 'strike'));
  assert.equal(won.phase, 'won');
  assert.equal(won.enemyHp, 0);
  assert.equal(endTurn(won), won);

  const almostLost = { ...startBattle(fixedRandom), playerHp: 4 };
  const lost = endTurn(almostLost);
  assert.equal(lost.phase, 'lost');
  assert.equal(lost.playerHp, 0);
  assert.equal(playCard(lost, 0), lost);
  assert.equal(startBattle(fixedRandom).phase, 'player');
});

test('attack order increases flurry damage and resets next turn', () => {
  const enemy = { name: 'combo target', maxHp: 40, attack: 1 };
  let state = createBattle({ enemy, playerHp: 30, deck: ['jab', 'flurry', 'guard', 'guard', 'guard'] }, fixedRandom);
  state = playCard(state, state.hand.indexOf('jab'));
  state = playCard(state, state.hand.indexOf('flurry'));
  assert.equal(state.enemyHp, 30);
  assert.equal(state.attacksPlayed, 2);
  state = endTurn(state, fixedRandom);
  assert.equal(state.attacksPlayed, 0);
});

test('counter adds block and retaliates after a survivable enemy attack', () => {
  const enemy = { name: 'counter target', maxHp: 30, attack: 6 };
  let state = createBattle({ enemy, playerHp: 30, deck: ['counter'] }, fixedRandom);
  state = playCard(state, 0);
  assert.equal(state.playerBlock, 4);
  assert.equal(state.counterDamage, 5);
  state = endTurn(state, fixedRandom);
  assert.equal(state.playerHp, 28);
  assert.equal(state.enemyHp, 25);
  assert.equal(state.counterDamage, 0);
});

test('poison stacks, catalyst doubles it, and lethal poison prevents enemy attack', () => {
  const enemy = { name: 'poison target', maxHp: 6, attack: 20 };
  let state = createBattle({ enemy, playerHp: 30, deck: ['toxin', 'catalyst'] }, fixedRandom);
  state = playCard(state, state.hand.indexOf('toxin'));
  assert.equal(state.enemyPoison, 3);
  state = playCard(state, state.hand.indexOf('catalyst'));
  assert.equal(state.enemyPoison, 6);
  state = endTurn(state, fixedRandom);
  assert.equal(state.phase, 'won');
  assert.equal(state.enemyHp, 0);
  assert.equal(state.playerHp, 30);
  assert.equal(playCard(state, 0), state);
});

test('upgraded cards use their upgraded values', () => {
  const enemy = { name: 'upgrade target', maxHp: 30, attack: 1 };
  const start = createBattle({ enemy, playerHp: 30, deck: ['strikePlus', 'guardPlus'] }, fixedRandom);
  const attacked = playCard(start, start.hand.indexOf('strikePlus'));
  assert.equal(attacked.enemyHp, 22);
  const defended = playCard(attacked, attacked.hand.indexOf('guardPlus'));
  assert.equal(defended.playerBlock, 7);
});
