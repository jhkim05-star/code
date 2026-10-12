import test from 'node:test';
import assert from 'node:assert/strict';
import { TRIP_DATES, isTripDate, membersForDate, scheduledForDate, visitIdForProposal } from '../src/model.ts';
import { canReserve, pruneQuota, slotsUsed } from '../functions/src/quota.ts';

const family = [
  {id:'a',nameKey:'jinhyeok',displayName:'진혁'},
  {id:'b',nameKey:'yeonhwa',displayName:'연화'},
  {id:'c',nameKey:'minseong',displayName:'민성'},
  {id:'d',nameKey:'sophie',displayName:'Sophie'},
];
test('trip dates and different return dates stay distinct',()=>{
  assert.equal(TRIP_DATES.length,6);
  assert.equal(isTripDate('2026-12-18'),true);
  assert.equal(isTripDate('2026-12-23'),false);
  assert.deepEqual(membersForDate('2026-12-21',family).map(x=>x.id),['a','b','c','d']);
  assert.deepEqual(membersForDate('2026-12-22',family).map(x=>x.id),['c','d']);
});
test('proposed and confirmed plans never share the same home bucket',()=>{
  const plans=[
    {id:'p1',date:'2026-12-18',time:'',status:'proposed'},
    {id:'p2',date:'2026-12-18',time:'11:00',status:'confirmed'},
  ];
  assert.deepEqual(scheduledForDate(plans,'2026-12-18','confirmed').map(x=>x.id),['p2']);
  assert.deepEqual(scheduledForDate(plans,'2026-12-18','proposed').map(x=>x.id),['p1']);
});
test('one proposal always names the same visit album',()=>{
  assert.equal(visitIdForProposal('abc'),visitIdForProposal('abc'));
  assert.notEqual(visitIdForProposal('abc'),visitIdForProposal('def'));
});
test('quota counts active photos and pending uploads, then releases expired slots',()=>{
  const now=1_000_000;
  const {quota,expired}=pruneQuota({activeCount:18,pending:{a:now+100,b:now-1}},now);
  assert.deepEqual(expired,['b']);
  assert.equal(slotsUsed(quota),19);
  assert.equal(canReserve(quota),true);
  quota.pending.c=now+100;
  assert.equal(canReserve(quota),false);
  delete quota.pending.a;
  assert.equal(canReserve(quota),true);
});
