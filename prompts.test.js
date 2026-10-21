import test from 'node:test';
import assert from 'node:assert/strict';
import {createTutorMessages,createBasicMessages,validatePayload,normalizeTutorResponse} from '../src/prompts.js';
const valid={code:'print(values[3])',language:'python',level:'beginner',mode:'hint'};
test('validates required fields and bounds',()=>{
  assert.equal(validatePayload(valid),null);
  assert.match(validatePayload({...valid,code:''}),/enter some code/i);
  assert.match(validatePayload({...valid,language:'bash'}),/unsupported language/i);
  assert.match(validatePayload({...valid,code:'a'.repeat(14001)}),/14,000/i);
  assert.match(validatePayload({...valid,history:[{request:'x',answer:3}]}),/history/i);
});
test('persona, few-shot, hint guardrails and iterative context appear in engineered prompt',()=>{
 const messages=createTutorMessages({...valid,history:[{request:'First hint',answer:'Check the index'}],question:'More details'});
 assert.equal(messages.length,4);
 assert.match(messages[0].content,/programming tutor/i);
 assert.match(messages[1].content,/Example of desired reasoning/i);
 assert.match(messages[2].content,/HINT MODE/);
 assert.match(messages[3].content,/Check the index/);
 assert.match(messages[3].content,/More details/);
 assert.doesNotMatch(messages[3].content,/OLLAMA_API_KEY/);
});
test('basic prompt is distinct from the engineered prompt',()=>{
 assert.equal(createBasicMessages(valid).length,2);
 assert.notEqual(createBasicMessages(valid)[0].content,createTutorMessages(valid)[0].content);
});
test('hint suppresses even an incorrectly supplied full fix',()=>{
 const raw=JSON.stringify({title:'Bug',confidence:'high',issues:[{line:3,type:'IndexError',explanation:'bad index',hint:'inspect'}],fixedCode:'secret fix',steps:['check'],takeaway:'bounds',followUp:'Why?'});
 assert.equal(normalizeTutorResponse(raw,'hint').fixedCode,'');
 assert.equal(normalizeTutorResponse(raw,'fix').fixedCode,'secret fix');
 assert.equal(normalizeTutorResponse('{oops','fix').unstructured,true);
});
