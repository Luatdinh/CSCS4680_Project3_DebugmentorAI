import React, {useEffect,useMemo,useRef,useState} from 'react';
import {
  Activity, ArrowDownRight, ArrowLeft, ArrowRight, BookOpen, BrainCircuit, Braces, Bug, Check,
  CheckCheck, CheckCircle2, ChevronDown, ChevronRight, CircleAlert, Clipboard, Code2, Command,
  Copy, FileCode2, GitCompareArrows, GraduationCap, Info, Layers3, Lightbulb, LoaderCircle, Menu,
  MessageCircleQuestion, PanelLeftClose, Play, Plus, RefreshCcw, Rocket, Send, ShieldCheck, Sparkles,
  Terminal, WandSparkles, Wrench, X, Zap
} from 'lucide-react';
import {EXAMPLES,exampleById,getOfflineFeedback} from './samples.js';
const LABELS={python:'Python',javascript:'JavaScript',java:'Java'};
const MODE_CONFIG={
  hint:{label:'Hint first',icon:Lightbulb,short:'Get a clue, not the answer',button:'Get a hint'},
  explain:{label:'Explain',icon:BookOpen,short:'Understand the root cause',button:'Explain the bug'},
  fix:{label:'Show fix',icon:Wrench,short:'Correct it and learn why',button:'Generate fix'}
};
const API={
  async post(url,body){const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    let data;try{data=await r.json()}catch{throw new Error('The server returned an invalid response.');}
    if(!r.ok)throw new Error(data.error||'Something went wrong.');return data;}
};
function Logo({small=false}){return <div className={`brandmark ${small?'brandmark-small':''}`}><Braces size={small?18:21} strokeWidth={2.5}/><span className="brandmark-dot"/></div>}
function Pill({children,tone=''}){return <span className={`pill ${tone}`}>{children}</span>}
function SectionEyebrow({children}){return <div className="eyebrow">{children}</div>}
function CodePanel({value,language}) {
  const [copied,setCopied]=useState(false);
  const copy=async()=>{try{await navigator.clipboard.writeText(value);setCopied(true);setTimeout(()=>setCopied(false),1800)}catch{}};
  return <div className="code-result"><div className="code-result-top"><span className="mono">{LABELS[language]||language} · suggested correction</span><button className="icon-btn" onClick={copy} title="Copy corrected code">{copied?<Check size={15}/>:<Copy size={15}/>}</button></div><pre><code>{value}</code></pre></div>;
}
function App(){
  const [page,setPage]=useState('workspace');
  const [mobileNav,setMobileNav]=useState(false);
  const [activeId,setActiveId]=useState(EXAMPLES[0].id);
  const [language,setLanguage]=useState('python');
  const [level,setLevel]=useState('beginner');
  const [code,setCode]=useState(EXAMPLES[0].code);
  const [errorMessage,setErrorMessage]=useState(EXAMPLES[0].errorMessage);
  const [mode,setMode]=useState('hint');
  const [result,setResult]=useState(null);
  const [comparison,setComparison]=useState(null);
  const [history,setHistory]=useState([]);
  const [question,setQuestion]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [execution,setExecution]=useState(null);
  const [runBusy,setRunBusy]=useState(false);
  const [runError,setRunError]=useState('');
  const revisionRef=useRef(0);
  const [aiConfigured,setAiConfigured]=useState(false);
  const [healthChecked,setHealthChecked]=useState(false);
  const [demoMode,setDemoMode]=useState(false);
  const codeRef=useRef(null);const resultsRef=useRef(null);
  const currentExample=exampleById(activeId);
  const exactExample=currentExample && code.trim()===currentExample.code.trim() && language===currentExample.language;
  const lineCount=useMemo(()=>Math.max(12,code.split('\n').length),[code]);
  const ready=Boolean(code.trim()&&!busy&&!runBusy);
  const modeLabel=MODE_CONFIG[mode].label;
  useEffect(()=>{
    let alive=true;
    fetch('/api/health').then(r=>{if(!r.ok)throw new Error('Server unavailable');return r.json()}).then(data=>{
      if(alive){setAiConfigured(data.aiConfigured);setDemoMode(!data.aiConfigured);setHealthChecked(true);}
    }).catch(()=>{if(alive){setDemoMode(true);setHealthChecked(true);}});
    return ()=>{alive=false};
  },[]);
  const resetResults=()=>{revisionRef.current++;setResult(null);setComparison(null);setExecution(null);setRunError('');setRunBusy(false);setHistory([]);setError('');setQuestion('')};
  function loadExample(e){setActiveId(e.id);setLanguage(e.language);setCode(e.code);setErrorMessage(e.errorMessage);resetResults();setPage('workspace')}
  function changeLanguage(next){setLanguage(next);setActiveId('');setCode('');setErrorMessage('');resetResults()}
  const makeBody=(desiredMode=mode,nextQuestion=question)=>({code,language,level,mode:desiredMode,
    errorMessage:execution?.status==='error'||execution?.status==='timeout'
      ? [execution.errorType,execution.stderr].filter(Boolean).join(' — ').slice(0,1800)
      : errorMessage,
    question:nextQuestion,history:history.slice(-6)});
  async function runCurrentCode(){
    if(!ready)return;
    const revision=++revisionRef.current;
    setRunBusy(true);setRunError('');setError('');setExecution(null);
    setResult(null);setHistory([]);
    try{
      const data=await API.post('/api/run',{code,language});
      if(revision!==revisionRef.current)return;
      setExecution(data);
      // Replace stale pasted error messages with the error actually observed.
      setErrorMessage(data.status==='success'?'':data.stderr.slice(0,1800));
    }catch(e){if(revision===revisionRef.current)setRunError(e.message)}
    finally{if(revision===revisionRef.current)setRunBusy(false)}
  }
  function setFatal(message){setError(message);setBusy(false)}
  async function analyze(desiredMode=mode,nextQuestion=question){
    if(!ready)return;
    setBusy(true);setError('');setMode(desiredMode);
    const request=nextQuestion.trim() || MODE_CONFIG[desiredMode].button;
    try{
      let feedback,source,model;
      if(demoMode){
        if(!exactExample)throw new Error('Offline examples work only with an unchanged built-in sample. Load an example or switch to Live AI after configuring an API key.');
        feedback=getOfflineFeedback(currentExample,desiredMode,history.length);
        source='offline-example';model='Prewritten sample';
      }else{
        const data=await API.post('/api/analyze',makeBody(desiredMode,nextQuestion));
        feedback=data.feedback;source=data.source;model=data.model;
      }
      setResult({feedback,source,model,mode:desiredMode});
      const answer=JSON.stringify(feedback).slice(0,2900);
      setHistory(previous=>[...previous.slice(-5),{request,answer}]);
      setQuestion('');
      if(window.innerWidth<1100)setTimeout(()=>resultsRef.current?.scrollIntoView({behavior:'smooth',block:'start'}),100);
    }catch(e){setError(e.message)}finally{setBusy(false)}
  }
  async function compare(){
    if(!ready)return;
    setBusy(true);setError('');setPage('lab');
    try{
      let data;
      if(demoMode){
        if(!exactExample)throw new Error('Prompt comparison in offline mode requires an unchanged built-in example.');
        data={baseline:currentExample.baseline,tutored:getOfflineFeedback(currentExample,'explain'),source:'offline-example',model:'Prewritten samples'};
      }else data=await API.post('/api/compare',makeBody('explain',''));
      setComparison(data);
    }catch(e){setError(e.message)}finally{setBusy(false)}
  }
  function onCodeKey(e){if(e.key==='Tab'){e.preventDefault();revisionRef.current++;setExecution(null);setRunError('');setErrorMessage('');setResult(null);setHistory([]);setComparison(null);const textarea=e.target,start=textarea.selectionStart,end=textarea.selectionEnd;setCode(old=>old.slice(0,start)+'    '+old.slice(end));requestAnimationFrame(()=>{textarea.selectionStart=textarea.selectionEnd=start+4});}}
  const iconFor=(tab)=>tab==='workspace'?Code2:tab==='lab'?GitCompareArrows:GraduationCap;
  const navItems=[{id:'workspace',label:'Workspace',icon:Code2,detail:'Debug your code'},{id:'lab',label:'Prompt Lab',icon:GitCompareArrows,detail:'Compare AI strategies'},{id:'guide',label:'Project Guide',icon:BookOpen,detail:'About this project'}];
  function navigate(id){setPage(id);setMobileNav(false);setError('')}
  return <div className="app-shell">
    <div className={`mobile-scrim ${mobileNav?'open':''}`} onClick={()=>setMobileNav(false)}/>
    <aside className={`sidebar ${mobileNav?'sidebar-open':''}`}>
      <div className="side-head"><Logo/><div className="wordmark"><strong>debugmentor<span>.ai</span></strong><small>YOUR CODING COMPANION</small></div><button className="mobile-close icon-btn" onClick={()=>setMobileNav(false)}><X size={20}/></button></div>
      <div className="sidebar-section-label">WORKSPACE</div>
      <nav className="side-nav">{navItems.map(item=>{const Icon=item.icon;return <button key={item.id} className={`nav-item ${page===item.id?'active':''}`} onClick={()=>navigate(item.id)}><Icon size={18}/><span>{item.label}<small>{item.detail}</small></span>{page===item.id&&<div className="nav-active-dot"/>}</button>})}</nav>
      <div className="sidebar-section-label examples-label">QUICK START EXAMPLES</div>
      <div className="example-nav">{EXAMPLES.map((item,i)=><button key={item.id} className={`example-nav-item ${activeId===item.id?'selected':''}`} onClick={()=>loadExample(item)}><div className={`example-badge example-${item.language}`}><FileCode2 size={15}/></div><span><strong>{LABELS[item.language]}</strong><small>{item.name}</small></span><ChevronRight size={15}/></button>)}</div>
      <div className="sidebar-bottom"><div className="mentor-card"><div className="mentor-card-icon"><Sparkles size={17}/></div><strong>Learn, don't just copy.</strong><p>Every bug is a chance to become a better developer.</p><button onClick={()=>navigate('guide')}>Explore the project <ArrowRight size={14}/></button></div><div className="side-footer"><span className="tiny-orb"/> CS4680 · Prompt Engineering</div></div>
    </aside>
    <main className="main">
      <header className="topbar"><div className="topbar-left"><button className="mobile-menu icon-btn" onClick={()=>setMobileNav(true)} aria-label="Open menu"><Menu size={20}/></button><span className="breadcrumb">PROJECTS</span><ChevronRight size={13} className="muted"/><span className="breadcrumb-current">{page==='workspace'?'Debugging Workspace':page==='lab'?'Prompt Engineering Lab':'Project Guide'}</span></div><div className="topbar-right"><span className={`status ${demoMode?'status-demo':'status-live'}`}><span className="status-dot"/>{demoMode?'Offline examples':aiConfigured?'AI key configured':'Checking AI'}</span><div className="avatar">CS</div></div></header>
      <div className="content">
        {page==='workspace'&&<>
          <section className="hero"><div><SectionEyebrow><span className="eyebrow-spark">✦</span> YOUR AI CODING MENTOR</SectionEyebrow><h1>Understand the bug.<br/><span>Own the fix.</span></h1><p>Not just answers. Real understanding. Debug smarter with AI-powered guidance tailored to your level.</p><div className="hero-badges"><span><CheckCircle2 size={14}/> Python, JavaScript & Java</span><span><ShieldCheck size={14}/> Isolated code execution</span></div></div><div className="hero-art" aria-hidden="true"><div className="floating-symbol symbol-one">{'{ }'}</div><div className="floating-symbol symbol-two">{'</>'}</div><div className="hero-orbit"><div className="hero-orbit-inner"><Bug size={45} strokeWidth={1.35}/></div></div><div className="hero-spark top">✦</div><div className="hero-spark bottom">+</div></div></section>
          <div className="workspace-heading"><div><h2>Debugging workspace <span className="heading-count">01 / 02</span></h2><p>Paste code, run it to see its real output or error, then ask your AI tutor for help.</p></div><div className="heading-right"><span className="subtle-tip"><Zap size={14}/> Guided learning</span></div></div>
          <div className="workspace-grid">
            <section className="panel editor-panel"><div className="panel-header"><div className="panel-header-title"><div className="header-icon purple"><Code2 size={18}/></div><div><h3>Your code</h3><p>Let's find what's going wrong</p></div></div><button className="text-button" onClick={()=>{setCode('');setActiveId('');setErrorMessage('');resetResults();codeRef.current?.focus()}}><RefreshCcw size={14}/> Clear</button></div>
              <div className="editor-controls"><label>LANGUAGE<select value={language} onChange={e=>changeLanguage(e.target.value)}>{Object.entries(LABELS).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label>YOUR LEVEL<select value={level} onChange={e=>{setLevel(e.target.value);resetResults()}}><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></select></label></div>
              <div className="file-tab"><div className="file-tab-selected"><span className={`lang-dot ${language}`}/>{`main.${language==='python'?'py':language==='javascript'?'js':'java'}`}<span className="file-tab-cross">×</span></div><span className="editor-lang">{LABELS[language]}</span></div>
              <div className="editor-area"><div className="line-numbers" aria-hidden="true">{Array.from({length:lineCount},(_,i)=><div key={i}>{i+1}</div>)}</div><textarea ref={codeRef} aria-label="Source code" value={code} onChange={e=>{revisionRef.current++;setCode(e.target.value);setErrorMessage('');setExecution(null);setRunError('');setResult(null);setHistory([]);setComparison(null)}} onKeyDown={onCodeKey} spellCheck="false" autoCapitalize="off" autoCorrect="off" placeholder={'// Paste your code here...'} /></div>
              <div className="editor-foot"><span><span className="editor-ready"/> Ready for review</span><span>{code.split('\n').length} lines · {code.length} characters</span></div>
              <div className="execution-section">
                <div className="execution-intro"><div><strong><Terminal size={16}/> Run code first</strong><p>See actual program output or compiler/runtime errors before requesting AI guidance.</p></div><button className="run-button" disabled={!ready} onClick={runCurrentCode}>{runBusy?<LoaderCircle size={16} className="spin"/>:<Play size={16}/>} {runBusy?'Running...':'Run code'}</button></div>
                {execution&&<div className={`execution-result execution-${execution.status}`} role="status">
                  <div className="execution-result-head"><strong>{execution.status==='success'?<><CheckCircle2 size={16}/> Executed successfully</>:<><CircleAlert size={16}/> {execution.errorType||'Execution error'}</>}</strong><span>{execution.durationMs} ms · exit {execution.exitCode??'—'}</span></div>
                  {execution.stdout&&<div className="execution-stream"><small>PROGRAM OUTPUT (STDOUT)</small><pre>{execution.stdout}</pre></div>}
                  {execution.stderr&&<div className="execution-stream"><small>COMPILER / ERROR OUTPUT (STDERR)</small><pre>{execution.stderr}</pre></div>}
                  {!execution.stdout&&!execution.stderr&&<p className="execution-no-output">{execution.status==='success'?'Program completed without printing output.':'No additional diagnostic output was captured.'}</p>}
                  {execution.status!=='success'&&<p className="execution-next-step">Now choose Hint first below to understand this error with Ollama AI.</p>}
                </div>}
                {runError&&<div className="execution-run-error" role="alert"><CircleAlert size={16}/><span>{runError}</span></div>}
                <p className="execution-note">Runs in an isolated Docker container with no network access. Docker Desktop must be running. Never run untrusted code in a public deployment.</p>
              </div>
              <div className="error-entry"><label htmlFor="errmsg">ERROR MESSAGE <span>(OPTIONAL — AUTO-FILLED AFTER RUN)</span></label><input id="errmsg" value={errorMessage} onChange={e=>setErrorMessage(e.target.value)} placeholder="Paste an exception or compiler error..." maxLength={1800}/></div>
              <div className="mode-section"><div className="section-mini-title">HOW SHOULD I HELP?</div><div className="mode-picker">{Object.entries(MODE_CONFIG).map(([key,item])=>{const Icon=item.icon;return <button key={key} className={`mode-option ${mode===key?'selected':''}`} onClick={()=>setMode(key)}><Icon size={19}/><strong>{item.label}</strong><small>{item.short}</small></button>})}</div></div>
              <div className="editor-actions"><button className="primary-btn" disabled={!ready} onClick={()=>analyze()}>{busy?<LoaderCircle size={17} className="spin"/>:<Sparkles size={17}/>} {busy?'Analyzing...':MODE_CONFIG[mode].button} <ArrowRight size={17}/></button><button className="secondary-btn" disabled={!ready} onClick={compare}><GitCompareArrows size={17}/> Compare prompts</button></div>
              {demoMode&&<div className="demo-notice"><Info size={16}/><span><strong>Offline sample mode:</strong> feedback is prewritten, not generated by AI. Use an unchanged example, or configure an API key for live debugging.</span></div>}
            </section>
            <section className="panel feedback-panel" ref={resultsRef}><div className="panel-header"><div className="panel-header-title"><div className="header-icon blue"><BrainCircuit size={18}/></div><div><h3>AI Tutor</h3><p>Personalized debugging feedback</p></div></div><Pill tone={result?'violet':'neutral'}>{result?'REVIEW READY':'AWAITING CODE'}</Pill></div>
              {busy?<div className="loading-state"><div className="loading-orbit"><BrainCircuit size={32}/></div><h3>Thinking through your code...</h3><p>Examining the root cause and tailoring feedback to your learning mode.</p><div className="loading-bar"><div/></div></div>:result?<div className="feedback-content"><div className="feedback-intro"><div className="result-label"><span className="result-check"><Check size={14}/></span> DEBUGGING INSIGHT <span className="result-dash"/> <span>{result.mode.toUpperCase()} MODE</span></div><h2>{result.feedback.title}</h2><p>{result.feedback.summary}</p><div className="response-tags"><Pill tone="blue">{result.feedback.confidence} confidence</Pill>{result.feedback.unstructured&&<Pill tone="amber">Plain-text model response</Pill>}<Pill tone={result.source==='offline-example'?'amber':'green'}>{result.source==='offline-example'?'Prewritten example':'Live AI response'}</Pill></div></div>
                  {result.feedback.issues?.map((issue,index)=><div className="issue-card" key={`${index}-${issue.line}`}><div className="issue-header"><div><CircleAlert size={18}/><strong>{issue.type||'Potential issue'}</strong></div><span>LINE {issue.line??'—'}</span></div><p>{issue.explanation}</p>{issue.hint&&<div className="hint-box"><Lightbulb size={16}/><span>{issue.hint}</span></div>}</div>)}
                  {!!result.feedback.steps?.length&&<div className="learning-steps"><h4><Layers3 size={16}/> What to learn from this</h4>{result.feedback.steps.map((step,i)=><div className="learning-step" key={i}><span>{String(i+1).padStart(2,'0')}</span><p>{step}</p></div>)}</div>}
                  {result.feedback.fixedCode&&<CodePanel key={result.feedback.fixedCode} value={result.feedback.fixedCode} language={language}/>}
                  {result.feedback.takeaway&&<div className="takeaway"><span><GraduationCap size={17}/></span><div><strong>Key takeaway</strong><p>{result.feedback.takeaway}</p></div></div>}
                  <div className="followup"><div className="followup-heading"><MessageCircleQuestion size={16}/><strong>Keep learning</strong></div><p>{result.feedback.followUp}</p><div className="quick-actions"><button disabled={busy} onClick={()=>analyze('hint','Give me a different hint based on previous guidance.')}>Another hint</button><button disabled={busy} onClick={()=>analyze('explain','Explain the cause more deeply, considering our previous rounds.')}>Explain more</button><button disabled={busy} onClick={()=>analyze('fix','Now show the full correction and explain the change.')}>Show the fix</button></div><form onSubmit={e=>{e.preventDefault();if(question.trim())analyze(mode,question)}}><input value={question} onChange={e=>setQuestion(e.target.value)} maxLength={1800} placeholder="Ask your tutor a follow-up..." aria-label="Follow-up question"/><button type="submit" disabled={!question.trim()||busy} aria-label="Send follow-up"><Send size={17}/></button></form></div>
                </div>:<div className="empty-state"><div className="empty-illustration"><div className="empty-code-card card-back">{'< / >'}</div><div className="empty-code-card card-front"><Sparkles size={35}/></div><div className="empty-asterisk">✳</div></div><h3>Every bug has a lesson.</h3><p>Your debugging insights will appear here. Choose a learning mode and analyze your code to get started.</p><div className="empty-features"><span><Lightbulb size={16}/> Guided hints</span><span><BookOpen size={16}/> Clear explanations</span><span><Wrench size={16}/> Thoughtful fixes</span></div></div>}
            </section>
          </div>
          {!!error&&<div role="alert" className="error-banner"><CircleAlert size={18}/>{error}<button onClick={()=>setError('')} aria-label="Dismiss"><X size={16}/></button></div>}
          <div className="bottom-info"><div><div className="bottom-info-icon"><ShieldCheck size={20}/></div><span><strong>Safe by design</strong><small>Run Code uses an isolated local Docker container; AI guidance is generated separately through Ollama.</small></span></div><button onClick={()=>navigate('lab')}>See how prompt engineering works <ArrowRight size={16}/></button></div>
        </>}
        {page==='lab'&&<><section className="page-hero"><SectionEyebrow>THE SCIENCE BEHIND THE ASSISTANT</SectionEyebrow><h1>Prompt Engineering <span>Lab.</span></h1><p>See why instructions matter. Compare a generic AI request against a carefully engineered tutor on the very same code.</p></section>
          <div className="lab-patterns"><div className="pattern-card"><div className="pattern-icon"><GraduationCap size={22}/></div><div><small>PATTERN 01</small><h3>Persona</h3><p>An experienced, patient programming instructor explains causes and adapts to the learner.</p></div></div><div className="pattern-card"><div className="pattern-icon purple"><RefreshCcw size={22}/></div><div><small>PATTERN 02</small><h3>Iterative refinement</h3><p>Earlier feedback and new questions guide progressively deeper hints, explanations, and fixes.</p></div></div><div className="pattern-card"><div className="pattern-icon orange"><Layers3 size={22}/></div><div><small>PATTERN 03</small><h3>Few-shot examples</h3><p>A concrete example teaches the model the expected diagnosis format and level of detail.</p></div></div></div>
          <section className="comparison-box"><div className="compare-top"><div><h2><GitCompareArrows size={22}/> Side-by-side prompt comparison</h2><p>Same code, different instructions. This is the project's core prompt engineering demonstration.</p></div><button className="primary-btn compare-run" onClick={compare} disabled={!ready}>{busy?<LoaderCircle size={17} className="spin"/>:<Play size={17}/>} {busy?'Comparing...':'Run comparison'}</button></div>
            <div className="compare-columns"><div className="compare-column baseline"><div className="compare-column-head"><span className="comparison-letter">A</span><div><strong>Basic prompt</strong><small>No structured teaching strategy</small></div><Pill tone="neutral">BASELINE</Pill></div><div className="prompt-snippet"><div>PROMPT</div><code>"Find bugs in this code and give feedback."</code></div><div className="compare-answer">{comparison?<p>{typeof comparison.baseline==='string'?comparison.baseline:JSON.stringify(comparison.baseline)}</p>:<div className="compare-placeholder"><MessageCircleQuestion size={29}/><span>Run a comparison to see baseline AI output.</span></div>}</div></div>
            <div className="compare-column improved"><div className="compare-column-head"><span className="comparison-letter">B</span><div><strong>DebugMentor prompt</strong><small>Persona + Few-shot + guided output</small></div><Pill tone="violet">ENGINEERED</Pill></div><div className="prompt-snippet"><div>PROMPT STRATEGY</div><code>"Act as a patient debugging tutor. Explain root causes, show specific evidence, and guide learning..."</code></div><div className="compare-answer">{comparison?<><h4>{comparison.tutored.title}</h4><p>{comparison.tutored.summary}</p>{comparison.tutored.issues?.map((i,n)=><div className="mini-issue" key={n}><strong>{i.line?'Line '+i.line+' · ':''}{i.type}</strong><p>{i.explanation}</p></div>)}{comparison.tutored.takeaway&&<div className="mini-takeaway">Takeaway: {comparison.tutored.takeaway}</div>}</>:<div className="compare-placeholder"><Sparkles size={29}/><span>Structured learning-focused feedback appears here.</span></div>}</div></div></div>
            {comparison&&<div className="comparison-source"><Info size={15}/>{comparison.source==='offline-example'?'Illustrative prewritten outputs—not a live model comparison. Enable the API for real results.':'Both responses came from live model requests using the same code. Compare quality yourself; better prompts do not guarantee a better answer every time.'}</div>}
          </section>
          <section className="lab-process"><div className="process-head"><h2>How refinement works</h2><p>Your follow-up requests build on earlier tutoring rounds.</p></div><div className="process-grid"><div><span className="process-num">01</span><Lightbulb size={24}/><strong>Ask for a hint</strong><p>Receive targeted clues without a complete solution.</p></div><ArrowRight className="process-arrow" size={20}/><div><span className="process-num">02</span><BookOpen size={24}/><strong>Ask for detail</strong><p>Carry the earlier hint into a deeper explanation.</p></div><ArrowRight className="process-arrow" size={20}/><div><span className="process-num">03</span><Wrench size={24}/><strong>Request the fix</strong><p>See a correction along with the reasoning behind it.</p></div></div><button className="secondary-btn" onClick={()=>navigate('workspace')}><ArrowLeft size={16}/> Return to workspace</button></section>
          {!!error&&<div className="error-banner" role="alert"><CircleAlert size={17}/>{error}<button onClick={()=>setError('')}><X size={16}/></button></div>}
        </>}
        {page==='guide'&&<><section className="page-hero"><SectionEyebrow>CS4680 · AI ASSISTANT PROJECT</SectionEyebrow><h1>Built to teach, <span>not replace.</span></h1><p>DebugMentor AI is a minimum viable product designed around real programming challenges, human-centered UX, and purposeful prompt engineering.</p></section>
          <div className="guide-stat-grid"><div><strong>03</strong><span>Supported languages</span></div><div><strong>03</strong><span>Prompt techniques</span></div><div><strong>03</strong><span>Tutoring modes</span></div><div><strong>01</strong><span>Isolated code runner</span></div></div>
          <div className="guide-columns"><section className="guide-section"><h2><CheckCircle2 size={20}/> Assignment requirement checklist</h2>{[
            ['Identify a real problem','Beginners struggle to learn from cryptic debugging output.'],
            ['Design an intuitive workflow','Paste code → Run → inspect actual output/error → AI hint → ask follow-ups.'],
            ['Build a working AI MVP','React frontend, Express backend, and Ollama Cloud API integration.'],
            ['Use at least two patterns','Persona + iterative refinement, supported by few-shot prompting.'],
            ['Provide a functional UI','Responsive editor, code output, error feedback, and comparison lab.'],
            ['Prepare a live demonstration','Starter examples and a before-versus-after comparison.']
          ].map(([name,detail])=><div className="guide-check" key={name}><CheckCircle2 size={18}/><span><strong>{name}</strong><small>{detail}</small></span></div>)}</section>
          <section className="guide-section"><h2><Rocket size={20}/> Suggested live demo</h2>{[
            ['Load a Python bug','Pick “Index out of range” in Quick Start.'],
            ['Run the actual program','Click Run code to show an IndexError before asking the AI.'],
            ['Get a guiding hint','Show that the tutor helps without revealing code.'],
            ['Refine the response','Select “Explain more” to use prior conversation context.'],
            ['Reveal the correction','Choose “Show the fix” and explain the code change.'],
            ['Compare prompt strategies','Open Prompt Lab and run the side-by-side analysis.']
          ].map(([title,detail],i)=><div className="guide-demo-step" key={title}><span>{String(i+1).padStart(2,'0')}</span><div><strong>{title}</strong><p>{detail}</p></div></div>)}<div className="guide-cta"><Sparkles size={19}/><p>For real API demonstrations, configure <code>OLLAMA_API_KEY</code> in the root .env and restart the server.</p></div></section></div>
          <section className="ethics"><ShieldCheck size={22}/><div><h3>Responsible behavior</h3><p>Code execution is restricted to disposable local Docker containers with limits and no network, but containerization is not a perfect security boundary. Do not publicly expose the runner. AI feedback may be incorrect; verify its suggested fixes. Never submit credentials or confidential code to an external AI service.</p></div></section><button className="primary-btn guide-start" onClick={()=>navigate('workspace')}>Open debugging workspace <ArrowRight size={17}/></button>
        </>}
        <footer className="footer"><span>© 2026 DebugMentor AI · CS4680 Prompt Engineering</span><span><span className="tiny-orb"/> Made for learning, not shortcuts</span></footer>
      </div>
    </main>
  </div>
}
export default App;
