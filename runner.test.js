import test from 'node:test';
import assert from 'node:assert/strict';
import {runCode,validateRunPayload,identifyError} from '../src/runner.js';

test('validate run inputs and reject oversized or unsupported snippets',()=>{
  assert.match(validateRunPayload({language:'python',code:' '}),/Enter some code/);
  assert.match(validateRunPayload({language:'c',code:'printf("hi");'}),/Choose/);
  assert.match(validateRunPayload({language:'java',code:'a'.repeat(14001)}),/14,000/);
  assert.equal(validateRunPayload({language:'python',code:'print(1)'}),null);
});

test('identify Python, JavaScript and Java exception types',()=>{
  assert.equal(identifyError('IndexError: list index out of range','python',1),'IndexError');
  assert.equal(identifyError('TypeError: Cannot read properties of null','javascript',1),'TypeError');
  assert.equal(identifyError('Main.java:4: error: ; expected','java',1),'Compilation error');
  assert.equal(identifyError('', 'python',0),null);
});

test('runner invokes Docker with hardening options and gets stdout',async()=>{
  let seen;
  const data=await runCode({language:'python',code:'print(42)'},{processFn:async(cmd,args)=>{
    seen={cmd,args};return {code:0,stdout:'42\n',stderr:'',timedOut:false,oversize:false};
  }});
  assert.equal(seen.cmd,'docker');
  for(const arg of ['--read-only','none','--cap-drop','ALL','--pids-limit'])assert.ok(seen.args.includes(arg));
  assert.ok(seen.args.some(arg=>arg.includes('target=/input,readonly')));
  assert.equal(seen.args[seen.args.length-1],'/input/main.py');
  assert.equal(data.status,'success');
  assert.equal(data.stdout,'42\n');
});

test('runner classifies actual stderr and keeps user errors distinct from infra errors',async()=>{
  const result=await runCode({language:'javascript',code:'console.log(null.value)'},{processFn:async()=>({code:1,stdout:'',stderr:'TypeError: Cannot read properties of null',timedOut:false,oversize:false})});
  assert.equal(result.status,'error');
  assert.equal(result.errorType,'TypeError');
});

test('runner reports Docker missing without executing code on the host',async()=>{
  await assert.rejects(runCode({language:'python',code:'print(1)'},{processFn:async()=>{throw Object.assign(new Error('spawn docker ENOENT'),{code:'ENOENT'});}}),/Install and start Docker Desktop/);
});

test('Docker timeouts produce timeout status and cleanup attempt',async()=>{
  const calls=[];
  const result=await runCode({language:'python',code:'while True: pass'},{processFn:async(_cmd,args)=>{
    calls.push(args);
    return {code:null,stdout:'',stderr:'',timedOut:true,oversize:false};
  }});
  assert.equal(result.status,'timeout');
  assert.equal(result.errorType,'Time limit exceeded');
  assert.equal(calls.length,2);
  assert.equal(calls[1][0],'rm');
});
