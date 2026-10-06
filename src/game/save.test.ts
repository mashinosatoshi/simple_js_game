import { describe, expect, it } from 'vitest';
import { deserialize, exportSave, importSave, serialize } from './save';
import { createInitialState } from './state';

describe('save', () => {
  it('serialize → deserialize で元に戻る', () => {
    const state = { ...createInitialState(123), coins: 45.6, miners: 7 };
    expect(deserialize(serialize(state))).toEqual(state);
  });

  it('export → import で元に戻る', () => {
    const state = { ...createInitialState(123), coins: 10, miners: 2 };
    expect(importSave(exportSave(state))).toEqual(state);
  });

  it('不正なデータは null', () => {
    expect(deserialize('not json')).toBeNull();
    expect(deserialize('{"version":999,"coins":0,"miners":0,"lastUpdate":0}')).toBeNull();
    expect(deserialize('{"version":1,"coins":-1,"miners":0,"lastUpdate":0}')).toBeNull();
    expect(importSave('!!!')).toBeNull();
  });
});
