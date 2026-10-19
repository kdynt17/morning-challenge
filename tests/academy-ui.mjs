// Isolated browser test. Firebase transport is mocked; no production account/data is used.
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {applyAction} from './fixtures/service.mjs';
import {GAMES,dayKey} from '../academy/functions/domain.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
let state={users:{tester:{name:'테스트 학생',role:'student',points:0}}};
const server=createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  res.setHeader('Content-Type','text/javascript; charset=utf-8');
  if(url.pathname==='/'){
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.end('<!doctype html><meta charset="UTF-8"><link rel="stylesheet" href="/styles.css"><main style="max-width:720px;margin:auto;padding:16px"><div id="brain-root"></div></main><script type="module">import {mountBrain} from "/brain.js";window.dispose=mountBrain({app:{},db:{},user:{uid:"tester"},root:document.querySelector("#brain-root")});</script>');return;
  }
  if(url.pathname==='/free-client.js'){res.end("import {httpsCallable} from '/mock.js';export const freeClient=()=>({action:httpsCallable(),settle:async()=>{},stop:()=>{}});");return;}
  if(url.pathname==='/mock.js'){
    res.end(`const listeners=[];export const getFunctions=()=>({});export const ref=(_,path)=>path;export function onValue(path,cb){const x={path,cb};listeners.push(x);refresh(x);return()=>listeners.splice(listeners.indexOf(x),1);}async function refresh(x){const v=await(await fetch('/snapshot?path='+encodeURIComponent(x.path))).json();x.cb({val:()=>v});}export const httpsCallable=()=>async data=>{const r=await fetch('/action',{method:'POST',body:JSON.stringify({...data,now:Date.now()})});const v=await r.json();if(v.error)throw Error(v.error);await Promise.all(listeners.map(refresh));return {data:v};};`);return;
  }
  if(url.pathname==='/snapshot'){let v=url.searchParams.get('path')==='.info/serverTimeOffset'?0:state; if(typeof v==='object') for(const k of url.searchParams.get('path').replaceAll('academy/','brain/').replace(/brain\/(daily|sessions\/tester)\/(\d{13})/,(_,p,n)=>'brain/'+p+'/'+dayKey(Number(n)-1)).split('/'))v=v?.[k];res.end(JSON.stringify(v??null));return;}
  if(url.pathname==='/action'){
    let body='';for await(const c of req)body+=c;const input=JSON.parse(body);
    try{state=applyAction(structuredClone(state),'tester',input.action,input,input.now);const key=input.mode==='daily'?(input.day||dayKey(input.now)):'practice';res.end(JSON.stringify({session:state.brain.sessions.tester[key],serverNow:input.now}));}catch(e){res.end(JSON.stringify({error:e.message}));}return;
  }
  try{const path=url.pathname.slice(1);if(path.startsWith('assets/')){res.setHeader('Content-Type',path.endsWith('.png')?'image/png':'image/webp');res.end(await readFile(new URL('../academy/'+path,import.meta.url)));return;}if(!['brain.js','styles.css','functions/domain.mjs','game-art.js','brain-score.js','sound.js'].includes(path))throw Error();let body=await readFile(new URL('../academy/'+path,import.meta.url),'utf8');if(path==='brain.js')body=body.replaceAll(/https:\/\/www.gstatic.com\/firebasejs\/10.12.5\/firebase-(functions|database).js/g,'/mock.js');if(path.endsWith('.css'))res.setHeader('Content-Type','text/css');res.end(body);}catch{res.statusCode=404;res.end('');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{channel:'chrome',headless:true});
try{
  const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install({time:new Date('2026-10-18T00:00:00Z')});
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.locator('#brain-start').waitFor();
  assert.equal(await page.locator('[data-practice]:disabled').count(),GAMES.length);
  await page.locator('#brain-start').click();await page.locator('#brain-time').waitFor();
  for(let stage=0;stage<5;stage++){
    if(stage)await page.clock.fastForward(5100);
    await page.clock.fastForward(2000);
    // Submit one generated correct answer via visible controls, including memory/selection games.
    const answer=await page.evaluate(async(stage)=>{const {lineup,question}=await import('/functions/domain.mjs');return question(lineup('2026-10-18')[stage],`2026-10-18:${stage}`,0);},stage);
    await page.clock.fastForward(answer.preview+1000);
    // 풍선은 떠다니므로 force 클릭. 블록매치는 같은 조각 칸이 여러 개라 첫 칸을 누른다.
    for(const i of answer.answer)await page.locator(`[data-answer="${i}"]`).first().click({force:true});
    if(['remove','sum','tetris'].includes(answer.type))await page.locator('#brain-confirm').click();
    await page.clock.fastForward(61000);
    if(stage<4)await page.waitForFunction(stage=>document.querySelector('.brain-game .eyebrow')?.textContent.startsWith(`${stage+2} /`),stage);
    else await page.locator('.brain-estimate').waitFor();
  }
  assert.equal(state.brain.daily['2026-10-18'].tester.score,500);
  assert.equal(state.users.tester.points,0);
  await mkdir(new URL('../test-results/',import.meta.url),{recursive:true});
  const shot=name=>page.screenshot({path:fileURLToPath(new URL(`../test-results/${name}.png`,import.meta.url)),fullPage:true});
  await shot('mobile-result');
  await page.locator('#brain-result-close').click();await page.locator('[data-practice]:not(:disabled)').first().waitFor();
  await shot('mobile-dashboard');
  assert.equal(await page.locator('[data-practice]').count(),GAMES.length);
  // 연습 버튼을 누르면 설명서가 먼저 나오고, '다시 보지 않기'를 고르면 다음부터는 바로 시작한다.
  const practice=async id=>{await page.locator(`[data-practice="${id}"]:not(:disabled)`).click();const guide=page.locator('#brain-guide-start');if(await guide.isVisible())await guide.click();};
  await page.locator('[data-practice="mole"]').click();await page.locator('#brain-guide-start').waitFor();
  await shot('guide-mole');
  await page.locator('#brain-guide-hide').check();await page.locator('#brain-guide-start').click();await page.locator('#brain-back').waitFor();
  await page.locator('#brain-back').click();await page.locator('[data-practice="mole"]:not(:disabled)').waitFor();
  // 나가기 버튼과 브라우저 뒤로 가기는 연습을 닫고, 다른 게임을 누르면 예전 연습이 아니라 새 게임이 열린다.
  await page.locator('[data-practice="mole"]').click();await page.locator('#brain-back').waitFor();
  assert.equal(await page.locator('#brain-guide-start').count(),0);
  assert.equal(await page.locator('.brain-game h2').textContent(),'그림두더지');
  assert.equal(await page.locator('#brain-time').textContent(),'30');
  await page.locator('#brain-back').click();await page.locator('[data-practice="view"]:not(:disabled)').waitFor();
  await practice('view');await page.locator('#brain-back').waitFor();
  assert.equal(await page.locator('.brain-game h2').textContent(),'시점추측');
  await page.goBack();await page.locator('[data-practice="rail"]:not(:disabled)').waitFor();
  await practice('rail');await page.locator('#brain-back').waitFor();
  assert.equal(await page.locator('.brain-game h2').textContent(),'선로잇기');
  await page.locator('#brain-back').click();await page.locator('[data-practice]:not(:disabled)').first().waitFor();
  assert.equal(state.users.tester.points,0);
  for(const game of GAMES){
    await practice(game.id);await page.locator('#brain-time').waitFor();await page.clock.fastForward(10000);
    assert.ok(await page.locator('[data-answer]').count()>0);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,game.id+' overflows mobile');
    await shot(`game-${game.id}`);
    await page.clock.fastForward(61000);
    // 연습이 끝나면 결과 카드(점수·정답·오답·내 최고)가 나온다.
    await page.locator('.practice-result .result-stats').waitFor();
    if(game.id==='mole')await shot('practice-result');
    await page.locator('#brain-result-back').click();await page.locator('[data-practice]:not(:disabled)').first().waitFor();
  }
  assert.equal(state.users.tester.points,50);
  assert.deepEqual(errors,[]);console.log('PASS: five daily rounds, back button/browser back closes practice, new practice replaces old, all 15 practice games with guides, mobile layout, 50P daily cap, no browser errors.');
}finally{await browser.close();server.close();}
