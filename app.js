import express from 'express';
import {validatePayload} from './prompts.js';
import {getAiReview,hasApiKey} from './ollama.js';
import {runCode,validateRunPayload} from './runner.js';

export function createApp({review=getAiReview,configured=hasApiKey,execute=runCode}={}) {
  const app=express();
  app.disable('x-powered-by');
  app.use(express.json({limit:'100kb'}));
  app.use((req,res,next)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');next();});
  const counter = new Map();
  app.use('/api', (req,res,next)=>{
    // Simple per-process limit for a classroom prototype; use persistent limits for public hosting.
    if (req.method==='GET') return next();
    const key=req.ip||'local';const now=Date.now();let record=counter.get(key);
    if (!record || now-record.started>60000) record={started:now,count:0};
    record.count++;counter.set(key,record);
    if(counter.size>1000) for(const [ip,r] of counter) if(now-r.started>60000) counter.delete(ip);
    if(record.count>18) return res.status(429).json({error:'Too many requests. Please try again in a minute.'});
    next();
  });
  app.get('/api/health',(req,res)=>res.json({ok:true,aiConfigured:configured(),mode:configured()?'live-ready':'offline-examples',provider:'ollama-cloud',name:'DebugMentor AI'}));
  app.post('/api/run',async(req,res)=>{
    if(process.env.NODE_ENV==='production') return res.status(403).json({error:'Local code execution is disabled in production. Do not expose this endpoint to the internet.'});
    const error=validateRunPayload(req.body);
    if(error) return res.status(400).json({error});
    try { return res.json(await execute(req.body)); }
    catch(e) {return res.status(e.status||500).json({error:e.message||'Code execution failed.'});}
  });
  app.post('/api/analyze',async(req,res)=>{
    const error=validatePayload(req.body);
    if(error) return res.status(400).json({error});
    try {
      const result=await review({...req.body,strategy:'tutor'});
      return res.json({...result,source:'live-ai'});
    } catch(e) {return res.status(e.status||500).json({error:e.message||'Unexpected error.'});}
  });
  app.post('/api/compare',async(req,res)=>{
    const error=validatePayload(req.body);
    if(error) return res.status(400).json({error});
    try {
      // Both prompts process identical user input; only prompt strategy changes.
      const [basic,tutor]=await Promise.all([
        review({...req.body,mode:'explain',history:[]},{basic:true}),
        review({...req.body,mode:'explain',history:[]},{basic:false})
      ]);
      return res.json({baseline:basic.feedback,tutored:tutor.feedback,source:'live-ai',model:tutor.model});
    } catch(e) {return res.status(e.status||500).json({error:e.message||'Unexpected error.'});}
  });
  app.use('/api',(req,res)=>res.status(404).json({error:'API route not found.'}));
  app.use((err,req,res,next)=>{
    if(err.type==='entity.too.large') return res.status(413).json({error:'Request too large.'});
    if(err instanceof SyntaxError && 'body' in err) return res.status(400).json({error:'Invalid JSON request.'});
    return res.status(500).json({error:'Unexpected server error.'});
  });
  return app;
}
