/**
 * 운동 실행 엔진.
 *
 * 상태 흐름:
 *   ready → countdown(준비 셋 둘 하나) → counting(횟수 세는 중)
 *         → setdone → resting(휴식) → 다음 세트의 ready → … → done
 *
 * 모든 시간은 타임스탬프로 계산합니다. 화면이 잠깐 가려져 타이머가 느려지더라도
 * 다시 돌아왔을 때 실제 경과 시간에 맞게 따라잡습니다.
 */

import { speakCount, cue, beep, stopSpeaking } from './voice.js';
import { settings } from './store.js';
import { uid, todayYmd, clamp } from './util.js';

const TICK_MS = 100;

export class Runner {
  /**
   * @param {object} day   계획의 하루 (blocks 배열을 가짐)
   * @param {object} opts  { weekStart }
   */
  constructor(day, opts = {}) {
    const s = settings();

    this.day = day;
    this.listeners = new Map();

    this.state = 'ready';
    this.exIndex = 0;
    this.setIndex = 0;
    this.rep = 0;

    this.tempo = day.blocks[0]?.tempo ?? s.tempo;
    this.rest = day.blocks[0]?.rest ?? s.restDefault;

    this.lastRepAt = 0;
    this.nextRepAt = 0;
    this.restEndAt = 0;
    this.countdownEndAt = 0;
    this.restWarned = false;

    this.timer = null;
    this.wakeLock = null;

    this.session = {
      id: uid('ses'),
      date: todayYmd(),
      weekStart: opts.weekStart || null,
      dayId: day.id || null,
      title: day.title || '운동',
      startedAt: Date.now(),
      endedAt: null,
      entries: day.blocks.map(b => ({
        exerciseId: b.exerciseId,
        name: b.name,
        group: b.group,
        note: b.note || '',
        sets: (b.sets || []).map(st => ({
          targetReps: st.reps,
          reps: null,
          weight: st.weight ?? null,
          rest: b.rest,
          tempo: b.tempo ?? s.tempo,
          done: false,
          at: null,
        })),
      })),
    };
  }

  // ── 이벤트 ────────────────────────────────────────────────
  on(evt, cb) {
    if (!this.listeners.has(evt)) this.listeners.set(evt, new Set());
    this.listeners.get(evt).add(cb);
    return () => this.listeners.get(evt).delete(cb);
  }

  emit(evt, payload) {
    for (const cb of this.listeners.get(evt) || []) cb(payload);
  }

  // ── 현재 위치 ─────────────────────────────────────────────
  get block()    { return this.day.blocks[this.exIndex] || null; }
  get entry()    { return this.session.entries[this.exIndex] || null; }
  get setRec()   { return this.entry?.sets[this.setIndex] || null; }
  get totalSets() { return this.session.entries.reduce((a, e) => a + e.sets.length, 0); }
  get doneSets()  { return this.session.entries.reduce((a, e) => a + e.sets.filter(s => s.done).length, 0); }
  get targetReps() { return this.setRec?.targetReps ?? this.block?.reps ?? 10; }

  get progress() {
    const t = this.totalSets;
    return t ? this.doneSets / t : 0;
  }

  /** 휴식 남은 초 */
  get restLeft() {
    if (this.state !== 'resting') return 0;
    return Math.max(0, (this.restEndAt - Date.now()) / 1000);
  }

  get countdownLeft() {
    if (this.state !== 'countdown') return 0;
    return Math.max(0, (this.countdownEndAt - Date.now()) / 1000);
  }

  // ── 구동 ──────────────────────────────────────────────────
  start() {
    if (this.timer) return;
    this.requestWakeLock();
    this.timer = setInterval(() => this.tick(), TICK_MS);
    document.addEventListener('visibilitychange', this.onVisible);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
    stopSpeaking();
    this.releaseWakeLock();
    document.removeEventListener('visibilitychange', this.onVisible);
  }

  onVisible = () => {
    // 화면이 꺼졌다 돌아오면 wake lock 이 풀려 있으므로 다시 잡습니다
    if (document.visibilityState === 'visible') this.requestWakeLock();
  };

  async requestWakeLock() {
    if (!settings().keepAwake || this.wakeLock || !navigator.wakeLock) return;
    try {
      this.wakeLock = await navigator.wakeLock.request('screen');
      this.wakeLock.addEventListener('release', () => { this.wakeLock = null; });
    } catch { /* 지원하지 않는 기기 — 무시 */ }
  }

  releaseWakeLock() {
    try { this.wakeLock?.release(); } catch { /* 이미 해제됨 */ }
    this.wakeLock = null;
  }

  tick() {
    const now = Date.now();

    if (this.state === 'countdown') {
      const left = Math.ceil((this.countdownEndAt - now) / 1000);
      if (left !== this._lastCountdown && left > 0) {
        this._lastCountdown = left;
        speakCount(left);
        beep(660, 70);
      }
      if (now >= this.countdownEndAt) this.beginCounting();

    } else if (this.state === 'counting') {
      // 여러 번 밀렸으면 따라잡되, 소리는 마지막 것만 냅니다
      let spoke = false;
      while (now >= this.nextRepAt && this.rep < this.targetReps) {
        this.rep += 1;
        this.lastRepAt = this.nextRepAt;
        this.nextRepAt = this.lastRepAt + this.tempo * 1000;
        spoke = true;
      }
      if (spoke) {
        speakCount(this.rep);
        this.emit('rep', this.rep);
        const left = this.targetReps - this.rep;
        if (left > 0 && left === settings().announceLastReps) {
          setTimeout(() => cue.lastRep(), this.tempo * 500);
        }
      }
      if (this.rep >= this.targetReps) this.finishSet();

    } else if (this.state === 'resting') {
      const left = this.restLeft;
      if (!this.restWarned && left <= settings().restWarnSec && left > 0.4) {
        this.restWarned = true;
        cue.restSoon();
      }
      if (left <= 0) this.finishRest();
    }

    this.emit('tick', this);
  }

  // ── 조작 ──────────────────────────────────────────────────
  /** 세트 시작 (준비 카운트다운부터) */
  beginSet() {
    const s = settings();
    this.rep = 0;
    this.restWarned = false;
    if (s.countdownSec > 0) {
      this.state = 'countdown';
      this._lastCountdown = null;
      this.countdownEndAt = Date.now() + s.countdownSec * 1000;
      cue.ready();
    } else {
      this.beginCounting();
    }
    this.emit('state', this.state);
    this.emit('tick', this);
  }

  beginCounting() {
    this.state = 'counting';
    this.rep = 0;
    const now = Date.now();
    this.lastRepAt = now;
    this.nextRepAt = now + this.tempo * 1000;
    cue.start();
    this.emit('state', this.state);
  }

  /** 목표 횟수를 다 채웠거나 사용자가 직접 끝냈을 때 */
  finishSet(actualReps = null) {
    const rec = this.setRec;
    if (rec) {
      rec.reps = actualReps ?? this.rep ?? rec.targetReps;
      rec.done = true;
      rec.at = Date.now();
      rec.tempo = this.tempo;
      rec.rest = Math.round(this.rest);
    }
    this.state = 'setdone';
    cue.setDone();
    beep(880, 140);
    this.emit('setdone', rec);
    this.emit('state', this.state);

    if (settings().autoStartRest && this.hasMore()) this.beginRest();
    else if (!this.hasMore()) this.finishWorkout();
  }

  /** 아직 남은 세트가 있는지 */
  hasMore() {
    if (this.setIndex + 1 < (this.entry?.sets.length || 0)) return true;
    return this.exIndex + 1 < this.day.blocks.length;
  }

  beginRest(seconds = null) {
    this.state = 'resting';
    this.restWarned = false;
    const dur = seconds ?? this.rest;
    this.restEndAt = Date.now() + dur * 1000;
    cue.restStart();
    this.emit('state', this.state);
    this.emit('tick', this);
  }

  /** 휴식 시간을 실시간으로 늘리거나 줄입니다 */
  adjustRest(deltaSec) {
    this.rest = clamp(this.rest + deltaSec, 10, 600);
    if (this.state === 'resting') {
      this.restEndAt = clamp(this.restEndAt + deltaSec * 1000, Date.now(), Date.now() + 600_000);
      this.restWarned = false;
    }
    this.emit('tick', this);
  }

  /** 휴식 기본값 자체를 바꿉니다 (슬라이더) */
  setRest(sec) {
    const prev = this.rest;
    this.rest = clamp(sec, 10, 600);
    if (this.state === 'resting') {
      this.restEndAt += (this.rest - prev) * 1000;
      this.restWarned = false;
    }
    this.emit('tick', this);
  }

  skipRest() {
    if (this.state !== 'resting') return;
    this.finishRest();
  }

  finishRest() {
    cue.restDone();
    beep(1040, 160);
    this.advance();
  }

  /** 다음 세트 / 다음 운동으로 */
  advance() {
    const entry = this.entry;
    if (this.setIndex + 1 < (entry?.sets.length || 0)) {
      this.setIndex += 1;
    } else if (this.exIndex + 1 < this.day.blocks.length) {
      this.exIndex += 1;
      this.setIndex = 0;
      const b = this.block;
      this.tempo = b.tempo ?? settings().tempo;
      this.rest = b.rest ?? settings().restDefault;
      cue.nextEx(b.name);
    } else {
      this.finishWorkout();
      return;
    }
    // 휴식이 끝나도 다음 세트를 자동으로 시작하지는 않습니다.
    // 무게를 바꾸거나 자리를 옮길 시간이 필요하기 때문에, 준비 상태로 두고 기다립니다.
    this.rep = 0;
    this.state = 'ready';
    this.emit('state', this.state);
    this.emit('tick', this);
  }

  /** 이 세트를 건너뜁니다 */
  skipSet() {
    const rec = this.setRec;
    if (rec) { rec.done = false; rec.skipped = true; }
    if (this.hasMore()) this.advance();
    else this.finishWorkout();
  }

  /** 이 운동의 남은 세트를 모두 건너뛰고 다음 운동으로 */
  skipExercise() {
    if (this.exIndex + 1 < this.day.blocks.length) {
      this.exIndex += 1;
      this.setIndex = 0;
      const b = this.block;
      this.tempo = b.tempo ?? settings().tempo;
      this.rest = b.rest ?? settings().restDefault;
      this.rep = 0;
      this.state = 'ready';
      this.emit('state', this.state);
      this.emit('tick', this);
    } else {
      this.finishWorkout();
    }
  }

  /** 앞 세트로 되돌아가기 (잘못 눌렀을 때) */
  goBack() {
    if (this.setIndex > 0) this.setIndex -= 1;
    else if (this.exIndex > 0) {
      this.exIndex -= 1;
      this.setIndex = this.entry.sets.length - 1;
      this.tempo = this.block.tempo ?? settings().tempo;
      this.rest = this.block.rest ?? settings().restDefault;
    } else return;
    const rec = this.setRec;
    if (rec) { rec.done = false; rec.at = null; }
    this.rep = 0;
    this.state = 'ready';
    this.emit('state', this.state);
    this.emit('tick', this);
  }

  /**
   * 운동 중에 종목을 하나 더 끼워 넣습니다 (자유운동 구성, 또는 즉흥 추가).
   * 지금 하고 있는 위치 바로 다음에 넣습니다.
   * @param {object} ex   exercises.js 의 종목 객체
   * @param {{sets:number, reps:number}} opt
   */
  addExercise(ex, opt = {}) {
    const s = settings();
    const setCount = opt.sets ?? ex.sets ?? 3;
    const reps = opt.reps ?? ex.reps ?? 10;
    const block = {
      exerciseId: ex.id, name: ex.name, group: ex.group, equip: ex.equip,
      rest: ex.rest ?? s.restDefault, tempo: ex.tempo ?? s.tempo,
      sets: Array.from({ length: setCount }, () => ({ reps, weight: null })),
    };
    const entry = {
      exerciseId: ex.id, name: ex.name, group: ex.group, note: '',
      sets: block.sets.map(st => ({
        targetReps: st.reps, reps: null, weight: null,
        rest: block.rest, tempo: block.tempo, done: false, at: null,
      })),
    };
    const insertAt = this.day.blocks.length ? this.exIndex + 1 : 0;
    this.day.blocks.splice(insertAt, 0, block);
    this.session.entries.splice(insertAt, 0, entry);
    this.emit('tick', this);
    return insertAt;
  }

  setTempo(sec) {
    this.tempo = clamp(sec, settings().tempoMin, settings().tempoMax);
    if (this.state === 'counting') {
      // 다음 카운트 시점을 새 속도로 다시 계산
      this.nextRepAt = this.lastRepAt + this.tempo * 1000;
    }
    this.emit('tick', this);
  }

  /** 이 세트만의 무게를 바꿉니다. 세트마다 무게가 다를 수 있으므로 다른 세트에는 번지지 않습니다. */
  setWeight(kg) {
    const rec = this.setRec;
    if (!rec) return;
    rec.weight = kg;
    this.emit('tick', this);
  }

  setTargetReps(n) {
    const rec = this.setRec;
    if (!rec) return;
    rec.targetReps = clamp(Math.round(n), 1, 100);
    this.emit('tick', this);
  }

  /** 목표 위치로 바로 점프 */
  jumpTo(exIndex, setIndex = 0) {
    this.exIndex = clamp(exIndex, 0, this.day.blocks.length - 1);
    this.setIndex = clamp(setIndex, 0, this.entry.sets.length - 1);
    this.tempo = this.block.tempo ?? settings().tempo;
    this.rest = this.block.rest ?? settings().restDefault;
    this.rep = 0;
    this.state = 'ready';
    this.emit('state', this.state);
    this.emit('tick', this);
  }

  finishWorkout() {
    this.state = 'done';
    this.session.endedAt = Date.now();
    cue.allDone();
    this.stop();
    this.emit('state', this.state);
    this.emit('done', this.session);
  }

  /** 중간에 그만두기 — 여기까지 한 것은 저장됩니다 */
  abort() {
    this.session.endedAt = Date.now();
    this.stop();
    this.emit('done', this.session);
  }
}

/** 총 볼륨 (무게 × 횟수 × 세트) */
export function sessionVolume(session) {
  let v = 0;
  for (const e of session.entries || []) {
    for (const s of e.sets || []) {
      if (s.done && s.weight && s.reps) v += s.weight * s.reps;
    }
  }
  return v;
}

export function sessionSetCount(session) {
  return (session.entries || []).reduce((a, e) => a + (e.sets || []).filter(s => s.done).length, 0);
}
