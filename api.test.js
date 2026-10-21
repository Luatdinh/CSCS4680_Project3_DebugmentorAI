import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../src/app.js';
const input={code:'print(1)',language:'python',level:'beginner',mode:'hint'};
async function withApi(testFn) {
 const requests=[];
 const review=async(body,options={})=>{
    requests.push({body,options});
    return {feedback:options.basic?'generic':{title:'Tutor response',summary:'Sample',issues:[],steps:[],confidence:'high',fixedCode:'',takeaway:'',followUp:''},model:'mock-test'};
 };
 const app=createApp({review,configured:()=>false});
 const server=app.listen(0);
 try {await testFn(`http://127.0.0.1:${server.address().port}`,requests);} finally {await new Promise(resolve=>server.close(resolve));}
}
test('health endpoint and validation',()=>withApi(async(base)=>{
 const health=await(await fetch(`${base}/api/health`)).json();
 assert.equal(health.aiConfigured,false);
 const invalid=await fetch(`${base}/api/analyze`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...input,language:'unknown'})});
 assert.equal(invalid.status,400);
}));
test('analyze and compare invoke expected prompt strategies',()=>withApi(async(base,requests)=>{
 const post=(endpoint,data)=>fetch(`${base}${endpoint}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
 const r=await post('/api/analyze',input);
 assert.equal(r.status,200);
 assert.equal((await r.json()).feedback.title,'Tutor response');
 const c=await post('/api/compare',input);
 assert.equal(c.status,200);
 const result=await c.json();
 assert.equal(result.baseline,'generic');
 assert.equal(result.tutored.title,'Tutor response');
 assert.equal(requests.length,3);
 assert.equal(requests[1].options.basic,true);
 assert.equal(requests[2].options.basic,false);
}));
