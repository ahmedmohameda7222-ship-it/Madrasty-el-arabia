import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeCaptures, assertCompleteAudit, selectRetryTargets } from './screenshot-audit-policy.mjs';

const captured = (route, width = 390) => ({route, width, httpStatus:200, finalPath:route, files:[`screenshots/${width}.png`]});

test('network failure is a failure even if one screenshot succeeded', () => {
  const records = [captured('/de/school/home'), {route:'/de/school/more/homework',width:1280,error:'net::ERR_CONNECTION_REFUSED'}];
  const result = summarizeCaptures(records);
  assert.equal(result.captured,1);
  assert.equal(result.failed,1);
  assert.throws(() => assertCompleteAudit(records, {expected:2}), /ERR_CONNECTION_REFUSED/);
});

test('documented 403/404 is separate from captured coverage', () => {
  const records=[captured('/ar/school/home'),{route:'/ar/school/more/bank',width:390,httpStatus:404,error:'inaccessible or redirected for this persona'}];
  assert.deepEqual(summarizeCaptures(records), {attempted:2,captured:1,denied:1,failed:0, failures:[]});
  assert.doesNotThrow(()=>assertCompleteAudit(records,{expected:2}));
});

test('unverified 404 is not accepted as success on a failed-route retry', () => {
  const records=[{route:'/de/school/more/homework',width:1280,httpStatus:404,error:'inaccessible or redirected for this persona'}];
  assert.throws(()=>assertCompleteAudit(records,{expected:1,strictRetry:true}), /HTTP 404/);
});

test('missing screenshot is a failure even after HTTP 200', () => {
  assert.throws(()=>assertCompleteAudit([{route:'/de/school/home',width:390,httpStatus:200}],{expected:1}), /no screenshot/);
});

test('wrong attempt count fails instead of quietly passing', () => {
  assert.throws(()=>assertCompleteAudit([captured('/de/school/home')],{expected:2}), /Expected 2/);
});

test('retry selection matches exact persona, locale, width and pathname', () => {
  const targets = {'teacher-de':[{'route':'/de/school/more/homework','width':390}], 'guardian-de':[{'route':'/de/school/more/exams','width':1280}]};
  assert.equal(selectRetryTargets(targets,'teacher','de','/de/school/more/homework',390),true);
  assert.equal(selectRetryTargets(targets,'teacher','de','/de/school/more/homework',1280),false);
  assert.equal(selectRetryTargets(targets,'teacher','ar','/de/school/more/homework',390),false);
});


test('previously evidenced role denial is recorded separately during retry', () => {
  const records=[captured('/de/school/home'),{route:'/de/school/more/bank',width:1280,httpStatus:404,error:'inaccessible or redirected for this persona'}];
  const verifiedDenials=['/de/school/more/bank'];
  const outcome=assertCompleteAudit(records,{expected:2,strictRetry:true,verifiedDenials});
  assert.equal(outcome.captured,1);
  assert.equal(outcome.denied,1);
  assert.equal(outcome.failed,0);
});

test('unknown 404 on retry still fails even when unrelated route is verified', () => {
  const records=[captured('/de/school/home'),{route:'/de/school/more/unknown',width:1280,httpStatus:404,error:'inaccessible'}];
  assert.throws(()=>assertCompleteAudit(records,{expected:2,strictRetry:true,verifiedDenials:['/de/school/more/bank']}),/HTTP 404/);
});
