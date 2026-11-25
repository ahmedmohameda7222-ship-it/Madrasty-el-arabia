import assert from "node:assert/strict";
import { test } from "node:test";
import { projectReaction } from "../../apps/web/src/features/comms/chat-state";

test("switching an optimistic reaction preserves other participants' counts",()=>{
  const current=[{emoji:"👍" as const,count:2,mine:true},{emoji:"❤️" as const,count:3,mine:false}];
  assert.deepEqual(projectReaction(current,"❤️"),[{emoji:"👍",count:1,mine:false},{emoji:"❤️",count:4,mine:true}]);
  assert.equal(current[0]?.count,2);
  assert.deepEqual(projectReaction(current,null),[{emoji:"👍",count:1,mine:false},{emoji:"❤️",count:3,mine:false}]);
});
test("reaction projection is idempotent against a poll that already includes the change",()=>{
  const current=[{emoji:"👍" as const,count:1,mine:true}];
  const next=projectReaction(current,"❤️");
  assert.deepEqual(next,[{emoji:"❤️",count:1,mine:true}]);
  assert.deepEqual(projectReaction(next,"❤️"),next);
  assert.deepEqual(projectReaction(next,null),[]);
});
