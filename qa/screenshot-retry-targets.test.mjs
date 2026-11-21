import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRetryTargets } from './screenshot-retry-targets.mjs';

test('selects only unresolved network navigations from both archived suites', () => {
  const originals = [
    {persona:'admin',locale:'de',captures:[
      {route:'/de/school/home',width:390,httpStatus:200,files:['a.png']},
      {route:'/de/school/more/invoices',width:390,error:'net::ERR_CONNECTION_REFUSED'},
      {route:'/de/school/more/bank',width:390,httpStatus:404,error:'inaccessible or redirected for this persona'}
    ]},
    {persona:'guardian',locale:'de',captures:[{route:'/de/school/more/exams',width:1280,error:'net::ERR_CONNECTION_RESET'}]}
  ];
  assert.deepEqual(buildRetryTargets(originals),{
    'admin-de':[{route:'/de/school/more/invoices',width:390}],
    'guardian-de':[{route:'/de/school/more/exams',width:1280}]
  });
});
