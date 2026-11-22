import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeCaptures, assertCompleteAudit, selectRetryTargets } from './screenshot-audit-policy.mjs';
const ready=(route='/de/school/home', width=390)=>({route,width,httpStatus:200,finalPath:route,files:['screenshots/ready.png'],terminalState:'ready'});

test('loading skeleton cannot be accepted as terminal screenshot evidence',()=> {
  assert.throws(()=>assertCompleteAudit([{...ready(),terminalState:'loading'}],{expected:1}),/terminal|loading/i);
});
test('missing terminal-state contract cannot be accepted as ready',()=> {
  assert.throws(()=>assertCompleteAudit([{...ready(),terminalState:undefined}],{expected:1}),/terminal|state/i);
});
test('a raw 404 without role-specific evidence fails even in a baseline run',()=>{
  assert.throws(()=>assertCompleteAudit([ready(),{route:'/ar/school/more/bank',width:390,httpStatus:404,terminalState:'forbidden'}],{expected:2}),/HTTP 404/);
});
test('missing one required width fails even when attempt count is the same',()=>{
  const records=[ready('/de/school/home',390),ready('/de/school/home',390)];
  assert.throws(()=>assertCompleteAudit(records,{expected:2,targets:[{route:'/de/school/home',width:390},{route:'/de/school/home',width:1280}]}),/duplicate|missing|1280/i);
});
test('client error/redirect is not successful even if an image file was written',()=>{
  assert.throws(()=>assertCompleteAudit([{...ready(),finalPath:'/de/account/sign-in'}],{expected:1}),/redirect|finalPath/i);
});
test('network loss remains a failure even with screenshot bytes',()=>{
  assert.throws(()=>assertCompleteAudit([{...ready(),error:'net::ERR_CONNECTION_REFUSED'}],{expected:1}),/ERR_CONNECTION_REFUSED/);
});
test('explicit verified persona denial stays separate from captured count',()=>{
  const records=[ready(),{route:'/de/school/more/bank',width:390,httpStatus:403,finalPath:'/de/school/more/bank',terminalState:'forbidden'}];
  const result=assertCompleteAudit(records,{expected:2,verifiedDenials:['/de/school/more/bank']});
  assert.equal(result.captured,1);assert.equal(result.denied,1);assert.equal(result.failed,0);
});
test('visible ready and legitimate empty capture count as terminal states',()=>{
  const records=[ready(),{...ready('/ar/school/more/homework'),terminalState:'empty'}];
  assert.equal(assertCompleteAudit(records,{expected:2}).captured,2);
});
test('retry targets retain persona locale and width matching',()=>{
  const targets={'teacher-de':[{route:'/de/school/home',width:390}]};
  assert.equal(selectRetryTargets(targets,'teacher','de','/de/school/home',390),true);
  assert.equal(selectRetryTargets(targets,'guardian','de','/de/school/home',390),false);
});


const stamped=(extra={})=>({...ready(),role:'guardian',locale:'de',mode:'standard',sha:'sha-1',...extra});
test('302 document cannot count as successful screenshot coverage',()=>{
 assert.throws(()=>assertCompleteAudit([stamped({httpStatus:302})],{expected:1}),/HTTP 302/);
});
test('same route at same width in distinct modes counts as two required scenes',()=>{
 const records=[stamped(),stamped({mode:'text-200'})];
 assert.equal(assertCompleteAudit(records,{expected:2,targets:records.map(x=>({role:x.role,locale:x.locale,route:x.route,width:x.width,mode:x.mode}))}).captured,2);
});
test('role-locale dimensions must match each required screenshot scene',()=>{
 assert.throws(()=>assertCompleteAudit([stamped({role:'admin'})],{expected:1,targets:[{route:'/de/school/home',width:390,mode:'standard',role:'guardian',locale:'de'}]}),/missing|unexpected|coverage/i);
});
test('real evidence checks refuse a missing file even with a nonempty path',()=>{
 assert.throws(()=>assertCompleteAudit([stamped({files:['/does-not-exist/madrasty.png']})],{expected:1,verifyFiles:true}),/missing|file|screenshot/i);
});
test('real evidence requires nonempty SHA linked to scene identity',()=>{
 assert.throws(()=>assertCompleteAudit([stamped({sha:''})],{expected:1,requireIdentity:true,expectedSha:'sha-1'}),/sha/i);
});
