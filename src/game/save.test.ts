import { describe, expect, it } from 'vitest';
import { deserialize, exportSave, importSave, serialize } from './save';
import { createInitialState } from './state';

describe('save', () => {
  it('serialize → deserialize で元に戻る', () => {
    const state = createInitialState(123);
    state.balls = 45;
    state.upgrades.payout = 3;
    expect(deserialize(serialize(state), 0)).toEqual(state);
  });

  it('export → import で元に戻る', () => {
    const state = { ...createInitialState(123), balls: 10, totalDrops: 2 };
    expect(importSave(exportSave(state), 0)).toEqual(state);
  });

  it('v1 (コインのゲーム) のデータは新しいゲームとして始める', () => {
    expect(deserialize('{"version":1,"coins":100,"miners":3,"lastUpdate":0}', 999)).toEqual(createInitialState(999));
  });

  it('保存データにないアップグレードは 0 になる', () => {
    const json = '{"version":2,"balls":5,"bestBalls":5,"totalDrops":0,"upgrades":{"autoDrop":1},"lastUpdate":0}';
    expect(deserialize(json, 0)?.upgrades).toEqual({ autoDrop: 1, payout: 0, penalty: 0 });
  });

  it('不正なデータは null', () => {
    const valid = { ...createInitialState(0) };
    expect(deserialize('not json', 0)).toBeNull();
    expect(deserialize(JSON.stringify({ ...valid, version: 999 }), 0)).toBeNull();
    expect(deserialize(JSON.stringify({ ...valid, balls: -1 }), 0)).toBeNull();
    expect(deserialize(JSON.stringify({ ...valid, balls: 1.5 }), 0)).toBeNull();
    expect(deserialize(JSON.stringify({ ...valid, upgrades: { ...valid.upgrades, penalty: 99 } }), 0)).toBeNull();
    expect(importSave('!!!', 0)).toBeNull();
  });
});
