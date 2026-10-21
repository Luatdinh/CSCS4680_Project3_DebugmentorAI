import test from 'node:test';
import assert from 'node:assert/strict';
import {extractJsonObject,normalizeTutorResponse} from '../src/prompts.js';
const demo=JSON.stringify({title:'Division by zero',summary:'A denominator is zero.',confidence:'high',issues:[],steps:[],fixedCode:'',takeaway:'Validate denominators.',followUp:'Why?'});
test('accepts strict Ollama JSON',()=>assert.equal(normalizeTutorResponse(demo,'hint').title,'Division by zero'));
test('accepts fenced JSON and JSON with explanatory prose',()=>{
 assert.equal(normalizeTutorResponse('```json\n'+demo+'\n```','explain').title,'Division by zero');
 assert.equal(extractJsonObject('Here is the result: '+demo+'\nThank you').title,'Division by zero');
});
test('shows plain text instead of failing the entire analysis',()=>{
 const feedback=normalizeTutorResponse('A **ZeroDivisionError** occurs on line 2.','hint');
 assert.equal(feedback.unstructured,true);
 assert.match(feedback.summary,/ZeroDivisionError/);
 assert.equal(feedback.fixedCode,'');
});
test('ignores model supplied fix for hint and explain',()=>{
 const response=JSON.stringify({...JSON.parse(demo),fixedCode:'fixed code'});
 assert.equal(normalizeTutorResponse(response,'hint').fixedCode,'');
 assert.equal(normalizeTutorResponse(response,'explain').fixedCode,'');
 assert.equal(normalizeTutorResponse(response,'fix').fixedCode,'fixed code');
});
