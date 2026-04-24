import test from 'node:test';
import assert from 'node:assert/strict';

import { buildUpkeepDispatch } from './automation-supervisor.js';

test('upkeep supervisor emits idempotent automation execution intents', () => {
  const dispatch = buildUpkeepDispatch({
    automation_id: 'automation:neo_n3:123',
    workflow_id: 'automation.upkeep',
    execution_count: 4,
  });

  assert.equal(dispatch.workflow_id, 'automation.upkeep');
  assert.match(dispatch.idempotency_key, /^automation\.upkeep:/);
  assert.equal(dispatch.replay_window, 'strict');
});

test('upkeep supervisor keeps replay request ids stable when execution_id is provided', () => {
  const dispatch = buildUpkeepDispatch({
    automation_id: 'automation:neo_n3:123',
    chain: 'neo_n3',
    execution_count: 9,
    execution_id: 'workflow-exec-1',
  });

  assert.equal(dispatch.execution_id, 'workflow-exec-1');
  assert.equal(dispatch.request_id, 'automation:neo_n3:workflow-exec-1');
});
