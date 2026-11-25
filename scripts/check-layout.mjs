// Run after the dashboard build. Uses an isolated headless browser, no server.
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {layoutFixture} from './layout-fixture.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'fleet-layout-'));
const chrome=spawn(process.env.CHROME_PATH || (process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':'google-chrome'),['--headless','--disable-gpu','--no-sandbox','--remote-debugging-port=0','--no-first-run','--user-data-dir='+temporary,'about:blank']);
// `close` also waits for stdio held by Chrome's children to close.
const closed=new Promise(resolve=>chrome.once('close',resolve));
let socket;
const timer=setTimeout(()=>{chrome.kill();console.error('Layout check timed out');process.exitCode=1},45000);
try {
 const endpoint=await new Promise((resolve,reject)=>{chrome.stderr.on('data',b=>{const m=String(b).match(/DevTools listening on (ws:\/\/\S+)/);if(m)resolve(m[1])});chrome.once('error',reject);chrome.once('exit',()=>reject(Error('Browser exited before startup')))});
 socket=new WebSocket(endpoint);await new Promise(r=>socket.addEventListener('open',r,{once:true}));let id=0;const pending=new Map();socket.addEventListener('message',e=>{const p=JSON.parse(e.data);if(p.id){const item=pending.get(p.id);pending.delete(p.id);p.error?item.reject(p.error):item.resolve(p.result)}});
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{pending.set(++id,{resolve,reject});socket.send(JSON.stringify({id,method,params,sessionId}))});
 const {targetId}=await send('Target.createTarget',{url:'about:blank'});const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
 const fixture=layoutFixture(Date.now()/1000);
 await send('Page.addScriptToEvaluateOnNewDocument',{source:`const fixture=${JSON.stringify(fixture)};window.fetch=async url=>new Response(JSON.stringify(fixture[url]),{status:200,headers:{'Content-Type':'application/json'}});`},sessionId);
 await send('Page.enable',{},sessionId);
 for(const [width,height,mobile] of [[320,640,true],[390,844,true],[768,1024,true],[1024,768,true],[1920,1080,false],[2560,1440,false],[3440,1440,false]]) {
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile},sessionId);
  await send('Page.navigate',{url:pathToFileURL(path.join(root,'web/dist/index.html')).href},sessionId);
  for(let i=0;i<100;i++){const v=await send('Runtime.evaluate',{expression:'document.querySelectorAll(".processes-panel").length===5',returnByValue:true},sessionId);if(v.result.value)break;await new Promise(r=>setTimeout(r,30));}
  const report=(await send('Runtime.evaluate',{expression:`(()=>{
   const collisions=[];
   for(const parent of document.querySelectorAll('.machine,.tiles,.tile,.row,.footer,.x-axis,.y-axis,.legend,.compact-zfs,.process-columns,.process-list li,.process-memory-context,.process-details,.gpu-process-summary')) {
    const nodes=[...parent.children].filter(el=>el.getBoundingClientRect().width&&el.getBoundingClientRect().height);
    nodes.forEach((a,i)=>nodes.slice(i+1).forEach(b=>{const x=a.getBoundingClientRect(),y=b.getBoundingClientRect();if(Math.min(x.right,y.right)-Math.max(x.left,y.left)>1&&Math.min(x.bottom,y.bottom)-Math.max(x.top,y.top)>1)collisions.push(parent.className+': '+a.className+' / '+b.className)}));
   }
   return {width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,panels:document.querySelectorAll('.processes-panel').length,collisions,zfs:[...document.querySelectorAll('.compact-zfs')].map(el=>({visible:el.clientHeight,content:el.scrollHeight})),tables:[...document.querySelectorAll('.table-scroll')].map(el=>({visible:el.clientWidth,content:el.scrollWidth}))};
  })()`,returnByValue:true},sessionId)).result.value;
  console.log(`${width}×${height}`,JSON.stringify(report));
  if(process.env.LAYOUT_SCREENSHOTS){fs.mkdirSync(process.env.LAYOUT_SCREENSHOTS,{recursive:true});const {data}=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},sessionId);fs.writeFileSync(path.join(process.env.LAYOUT_SCREENSHOTS,`${width}.png`),Buffer.from(data,'base64'))}
  assert.equal(report.panels,5,'all process panels rendered');assert.ok(report.width<=width,'horizontal page overflow');assert.deepEqual(report.collisions,[],'overlapping contents');
  if(width>=2560){assert.ok(report.height<=height,'kiosk requires vertical scrolling');for(const z of report.zfs)assert.ok(z.content<=z.visible,'kiosk ZFS content requires scrolling');for(const t of report.tables)assert.ok(t.content<=t.visible,'kiosk table requires horizontal scrolling')}
 }
 await send('Browser.close');
 // The protocol reply only acknowledges shutdown. Let Chrome flush its profile
 // and stop its children before removing it; killing it here races those writes.
 await closed;
} finally {
 clearTimeout(timer);
 socket?.close();
 // Only terminate a browser left running by an assertion/startup failure.
 if(chrome.exitCode===null&&chrome.signalCode===null)chrome.kill();
 const forceStop=setTimeout(()=>chrome.kill('SIGKILL'),5000);
 try {await closed} finally {clearTimeout(forceStop)}
 await fs.promises.rm(temporary,{recursive:true,force:true,maxRetries:10,retryDelay:100});
}
