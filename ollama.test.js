import test from 'node:test';
import assert from 'node:assert/strict';
import {getAiReview, hasApiKey} from '../src/ollama.js';

const input = {code:'print(values[3])',language:'python',level:'beginner',mode:'hint'};
const jsonFeedback = JSON.stringify({
  title:'Index bug',summary:'Bounds',confidence:'high',
  issues:[{line:1,type:'IndexError',explanation:'Bad access',hint:'Check length'}],
  steps:['Inspect value'],fixedCode:'no answers yet',takeaway:'Careful',followUp:'Why?'
});

async function withTestKey(cb) {
  const prior = process.env.OLLAMA_API_KEY;
  const priorModel = process.env.OLLAMA_MODEL;
  process.env.OLLAMA_API_KEY = 'test-only-nonreal-key';
  process.env.OLLAMA_MODEL = 'gemma4:31b';
  try { await cb(); }
  finally {
    if (prior === undefined) delete process.env.OLLAMA_API_KEY;
    else process.env.OLLAMA_API_KEY = prior;
    if (priorModel === undefined) delete process.env.OLLAMA_MODEL;
    else process.env.OLLAMA_MODEL = priorModel;
  }
}

test('Ollama Cloud request sends bearer key, messages and native JSON format', async()=>withTestKey(async()=>{
  let url, options;
  const result=await getAiReview(input,{fetchImpl:async(u,o)=>{
    url=u;options=o;
    return {ok:true,json:async()=>({model:'gemma4:31b',message:{role:'assistant',content:jsonFeedback},prompt_eval_count:150,eval_count:80})};
  }});
  const sent=JSON.parse(options.body);
  assert.equal(url,'https://ollama.com/api/chat');
  assert.equal(options.headers.Authorization,'Bearer test-only-nonreal-key');
  assert.equal(sent.stream,false);
  assert.equal(sent.model,'gemma4:31b');
  assert.equal(sent.format,'json');
  assert.equal(sent.messages.length,4);
  assert.equal(result.feedback.fixedCode,'');
  assert.equal(result.feedback.issues[0].line,1);
  assert.equal(result.usage,230);
  assert.equal(result.model,'gemma4:31b');
}));

test('Ollama Prompt Lab baseline uses the same cloud endpoint without JSON mode', async()=>withTestKey(async()=>{
  let sent;
  const result=await getAiReview(input,{basic:true,fetchImpl:async(u,o)=>{
    sent=JSON.parse(o.body);
    return {ok:true,json:async()=>({model:'gemma4:31b',message:{role:'assistant',content:'Check the list index.'}})};
  }});
  assert.equal('format' in sent,false);
  assert.equal(sent.messages.length,2);
  assert.equal(result.feedback,'Check the list index.');
}));

test('rejects invalid Ollama Cloud API credentials', async()=>withTestKey(async()=>{
  await assert.rejects(
    getAiReview(input,{fetchImpl:async()=>({ok:false,status:401,json:async()=>({error:'invalid token'})})}),
    /Ollama rejected the API key/
  );
}));

test('Ollama unstructured content is displayed instead of throwing unexpected response format',async()=>withTestKey(async()=>{
 const result=await getAiReview(input,{fetchImpl:async()=>({ok:true,json:async()=>({model:'gemma4:31b',message:{role:'assistant',content:'This appears to be an IndexError. Check list length.'}})})});
 assert.equal(result.feedback.unstructured,true);
 assert.match(result.feedback.summary,/IndexError/);
}));
