import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Queryable } from '../src/db.js';
import { assertMissionTrainee } from '../src/missions/assertMissionTrainee.js';

const MISSION = '01a15000-0000-7000-8000-000000000001';
const TRAINEE = '01a15000-0000-7000-8000-0000000000aa';
const OTHER = '01a15000-0000-7000-8000-0000000000bb';

function fakeDb(rows: unknown[]): Queryable & { calls: unknown[][] } {
  const calls: unknown[][] = [];
  return {
    calls,
    async query<R>(_text: string, values?: readonly unknown[]) {
      calls.push([...(values ?? [])]);
      return { rows: rows as R[], rowCount: rows.length };
    },
  };
}

describe('assertMissionTrainee', () => {
  it('passa quando quem chama é o aprendiz', async () => {
    const db = fakeDb([{ trainee_id: TRAINEE }]);
    await assertMissionTrainee(db, MISSION, TRAINEE);
    assert.deepEqual(db.calls, [[MISSION]]);
  });

  it('outro jogador: 403 NOT_MISSION_TRAINEE (rule_not_trainee)', async () => {
    await assert.rejects(assertMissionTrainee(fakeDb([{ trainee_id: TRAINEE }]), MISSION, OTHER),
      (e: any) => e.status === 403 && e.code === 'NOT_MISSION_TRAINEE');
  });

  it('missão inexistente: 404', async () => {
    await assert.rejects(assertMissionTrainee(fakeDb([]), MISSION, TRAINEE),
      (e: any) => e.status === 404 && e.code === 'MISSION_NOT_FOUND');
  });
});
