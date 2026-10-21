/**
 * Runs classroom snippets in disposable, resource-constrained Docker containers.
 * Intentionally NEVER starts language interpreters directly on the host.
 * This is a local teaching MVP, not a hardened public multi-tenant code judge.
 */
import {spawn} from 'node:child_process';
import {mkdtemp, writeFile, rm, chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

const RUNNERS = Object.freeze({
  python: {image:'python:3.12-alpine', filename:'main.py', command:['timeout','-s','KILL','8s','python','-I','-B','/input/main.py']},
  javascript: {image:'node:22-alpine', filename:'main.js', command:['timeout','-s','KILL','8s','node','/input/main.js']},
  java: {image:'eclipse-temurin:21-jdk-alpine', filename:'Main.java', command:['timeout','-s','KILL','10s','sh','-c','javac -d /tmp /input/Main.java && java -Xmx96m -cp /tmp Main']}
});
const MAX_OUTPUT = 18_000;
const TIME_LIMIT = 17_000;

export function validateRunPayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'Expected a JSON object.';
  if (!Object.hasOwn(RUNNERS, body.language)) return 'Choose Python, JavaScript, or Java.';
  if (typeof body.code !== 'string' || !body.code.trim()) return 'Enter some code before running.';
  if (body.code.length > 14_000) return 'Code must be 14,000 characters or fewer.';
  return null;
}

export function identifyError(stderr, language, exitCode) {
  if (!stderr.trim() && exitCode === 0) return null;
  const patterns = [
    /\b(ZeroDivisionError|IndexError|KeyError|NameError|ValueError|TypeError|SyntaxError|IndentationError|AttributeError|ImportError|ModuleNotFoundError|FileNotFoundError|RecursionError|ReferenceError|RangeError|URIError|EvalError|AssertionError|ArithmeticException|ArrayIndexOutOfBoundsException|NullPointerException|NumberFormatException|ClassNotFoundException)\b/,
    /\b([A-Za-z][\w.]*(?:Exception|Error))\b/
  ];
  for (const pattern of patterns) {
    const match = stderr.match(pattern);
    if (match) return match[1];
  }
  if (language === 'java' && /error:|\.java:\d+:/.test(stderr)) return 'Compilation error';
  if (/killed|timed out/i.test(stderr) || exitCode === 137 || exitCode === 124) return 'Time limit exceeded';
  return exitCode === 0 ? null : 'Runtime error';
}

function callProcess(binary,args,{timeoutMs=TIME_LIMIT,spawnImpl=spawn}={}) {
  return new Promise((resolve,reject)=>{
    let child;
    try {child=spawnImpl(binary,args,{shell:false,stdio:['ignore','pipe','pipe']});} catch(err){reject(err);return;}
    let stdout='',stderr='',oversize=false,timedOut=false,finished=false;
    const timer=setTimeout(()=>{timedOut=true;child.kill('SIGKILL');}, timeoutMs);
    const absorb=(which,chunk)=>{
      const str=chunk.toString('utf8');
      if(which==='out') stdout=(stdout+str).slice(0,MAX_OUTPUT);
      else stderr=(stderr+str).slice(0,MAX_OUTPUT);
      if(stdout.length+stderr.length >= MAX_OUTPUT*2) {oversize=true;child.kill('SIGKILL');}
    };
    child.stdout?.on('data',c=>absorb('out',c));
    child.stderr?.on('data',c=>absorb('err',c));
    child.on('error',err=>{
      if(finished) return;finished=true;clearTimeout(timer);reject(err);
    });
    child.on('close',(code,signal)=>{
      if(finished) return;finished=true;clearTimeout(timer);
      resolve({code,signal,stdout,stderr,timedOut,oversize});
    });
  });
}

export async function runCode({language,code},{processFn=callProcess}={}) {
  const message=validateRunPayload({language,code});
  if(message) throw Object.assign(new Error(message),{status:400});
  const setting=RUNNERS[language];
  const temp=await mkdtemp(path.join(tmpdir(),'debugmentor-run-'));
  const filename=path.join(temp,setting.filename);
  const containerName=`debugmentor-${randomUUID().replace(/-/g,'')}`;
  const started=Date.now();
  try {
    // mkdtemp defaults to 0700. The non-root container user must be able to traverse it.
    await chmod(temp,0o755);
    await writeFile(filename,code,{mode:0o644,flag:'wx'});
    const args=[
      'run','--rm','--name',containerName,
      '--network','none','--read-only',
      '--cap-drop','ALL','--security-opt','no-new-privileges',
      '--memory','384m','--memory-swap','384m','--cpus','0.5','--pids-limit','64',
      '--user','65534:65534',
      '--tmpfs','/tmp:rw,nosuid,nodev,size=64m',
      '--mount',`type=bind,source=${temp},target=/input,readonly`,
      '--workdir','/tmp',
      setting.image,...setting.command
    ];
    let result;
    try {result=await processFn('docker',args,{timeoutMs:TIME_LIMIT});}
    catch(error){
      const hint=error.code==='ENOENT'
        ? 'Docker is not installed. Install and start Docker Desktop before using Run Code.'
        : 'Docker could not start. Make sure Docker Desktop is running.';
      throw Object.assign(new Error(hint),{status:503});
    }
    if(result.timedOut || result.oversize) {
      // Docker client may have been terminated but the container can survive; remove it.
      await processFn('docker',['rm','-f',containerName],{timeoutMs:3000}).catch(()=>{});
      return {status:'timeout',exitCode:null,stdout:result.stdout,stderr:result.stderr,
        errorType:result.oversize?'Output limit exceeded':'Time limit exceeded',durationMs:Date.now()-started};
    }
    // Missing images, inaccessible engine, etc. are configuration errors, not user code errors.
    if(result.code===125 || /Cannot connect to the Docker daemon|pull access denied|unable to find image|permission denied while trying to connect to the Docker daemon/i.test(result.stderr)) {
      throw Object.assign(new Error(`Docker couldn't start the runner for ${language}. Make sure Docker Desktop is running and pull ${setting.image}. ${result.stderr.slice(0,220)}`),{status:503});
    }
    if(result.code===124 || result.code===137) {
      return {status:'timeout',exitCode:result.code,stdout:result.stdout,stderr:result.stderr,
        errorType:'Time limit exceeded',durationMs:Date.now()-started};
    }
    const status=result.code===0?'success':'error';
    return {status,exitCode:result.code,stdout:result.stdout,stderr:result.stderr,
      errorType:identifyError(result.stderr,language,result.code),durationMs:Date.now()-started};
  } finally {
    await rm(temp,{force:true,recursive:true});
  }
}
