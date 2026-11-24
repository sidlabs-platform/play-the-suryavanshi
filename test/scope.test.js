import assert from "node:assert/strict";
import test from "node:test";
import {spawnSync} from "node:child_process";
const check=(list,total)=>spawnSync(process.execPath,["scripts/scope.js","pr",String(total)],{input:JSON.stringify([list]),encoding:"utf8"});
test("a gameplay-only feature passes; moving a control into game scope does not",()=>{
  assert.equal(check([{filename:"site/game.js"}],1).status,0);
  assert.equal(check([{filename:"site/referee.js",previous_filename:"scripts/scope.js"}],1).status,1);
});
test("incomplete PR metadata cannot produce a passing gate",()=>{
  assert.notEqual(check([{filename:"site/game.js"}],2).status,0);
});
