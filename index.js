import dotenv from 'dotenv';
import express from 'express';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {existsSync} from 'node:fs';
import {createApp} from './app.js';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
dotenv.config({path:path.resolve(__dirname,'../../.env')});
const app=createApp();
const distPath=path.resolve(__dirname,'../../client/dist');
if(existsSync(path.join(distPath,'index.html'))) {
  app.use(express.static(distPath));
  app.get('*',(req,res)=>res.sendFile(path.join(distPath,'index.html')));
}
const port=Number(process.env.PORT||3001);
// Bind only to localhost: code runner must not be exposed to external visitors.
app.listen(port,'127.0.0.1',()=>console.log(`DebugMentor API listening at http://localhost:${port} (live AI ${process.env.OLLAMA_API_KEY?'configured':'not configured'})`));
