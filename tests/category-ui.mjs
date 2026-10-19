import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const mock=`
const end=Date.parse('2026-10-18T21:00:00Z');
const state={users:{tester:{name:'학생',email:'test@example.test',authEmail:'test@example.test',role:'student',points:200}},academy:{sessions:{tester:{[end]:{done:true}}},daily:{[end]:{tester:{name:'학생',score:100}}}}};
const val=p=>p.split('/').reduce((o,k)=>o?.[k],state)??null;
const snap=v=>({val:()=>v,exists:()=>v!==null,forEach:fn=>Object.entries(v||{}).forEach(([key,value])=>fn({...snap(value),key}))});
const put=(p,v)=>{const a=p.split('/'),k=a.pop();let o=state;for(const x of a)o=o[x]??={};o[k]=v;};
export const initializeApp=()=>({}),initializeAuth=()=>({}),getDatabase=()=>({}),getAuth=()=>({});
export const indexedDBLocalPersistence={},browserLocalPersistence={},browserSessionPersistence={};
export const onAuthStateChanged=(_,fn)=>{queueMicrotask(()=>fn({uid:'tester',email:'test@example.test'}));return()=>{};};
export const setPersistence=async()=>{},sendPasswordResetEmail=async()=>{},signInWithEmailAndPassword=async()=>{},signOut=async()=>{},createUserWithEmailAndPassword=async()=>{},updateProfile=async()=>{};
export const ref=(_,p)=>p,query=(p)=>p,orderByChild=()=>null,limitToFirst=()=>null,limitToLast=()=>null;
export const get=async p=>snap(val(p));
export const onValue=(p,fn)=>{queueMicrotask(()=>fn(snap(p==='.info/serverTimeOffset'?0:val(p))));return()=>{};};
export const set=async(p,v)=>put(p,v),remove=async p=>put(p,null),update=async()=>{},push=p=>p+'/test',serverTimestamp=()=>Date.now();
export const runTransaction=async(p,fn)=>{const v=fn(val(p));if(v!==undefined)put(p,v);return {committed:v!==undefined,snapshot:snap(val(p))};};
`;
const server=createServer(async(req,res)=>{
  try{const path=new URL(req.url,'http://localhost').pathname;const file=path.endsWith('/')?path+'index.html':path;
    res.setHeader('Content-Type',file.endsWith('.js')||file.endsWith('.mjs')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'image/webp');
    res.end(await readFile(new URL('..'+file,import.meta.url)));
  }catch{res.statusCode=404;res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{channel:'chrome',headless:true});
try{
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://www.gstatic.com/firebasejs/**',r=>r.fulfill({contentType:'text/javascript',body:mock}));
  await page.clock.install({time:new Date('2026-10-18T12:00:00Z')});
  const base='http://127.0.0.1:'+server.address().port;
  await page.goto(base+'/');await page.locator('#app-shell:not([hidden])').waitFor();
  assert.equal(await page.locator('#header-points-value').textContent(),'200');
  assert.equal(await page.locator('#mines-page,[data-target-page="mines"],[data-rank-tab="beginner"]').count(),0);
  // 홈에 두뇌 무게 오각형, 순위는 포인트만, 주말(일요일 21시 KST)에는 자동 출석하지 않음
  assert.equal(await page.locator('#brain-summary .radar').count(),1);
  assert.equal(await page.locator('#brain-summary .criteria').count(),1);
  assert.equal(await page.locator('[data-rank-tab]').count(),0);
  assert.match(await page.locator('#attendance-title').textContent(),/주말/);
  // 두뇌교실은 같은 화면 안에서 열리고, 색깔 판단·빠른 계산도 일반 연습 게임으로 들어 있다(옛 3게임 화면은 없음)
  await page.locator('.big-cta').click();
  await page.locator('#games-page.active-page [data-practice="stroop"]:not(:disabled)').waitFor();
  assert.equal(await page.locator('[data-practice="calc"]').count(),1);
  assert.equal(await page.locator('[data-practice]').count(),15);
  assert.equal(await page.locator('[data-classic],#calc-page,#stroop-page,#memory-page').count(),0);
  assert.equal(page.url().includes('academy/'),false);
  // 빠른 계산: 설명서 → 숫자판·키보드 입력
  await page.locator('[data-practice="calc"]').click();
  await page.locator('#brain-guide-start').click();
  await page.locator('.calc-q').waitFor();
  const prompt=await page.locator('.calc-q b').textContent();
  const m=prompt.match(/(\d+)\s*\+\s*(\d+)/);assert.ok(m,prompt);
  await page.clock.runFor(1000);
  await page.keyboard.type(String(Number(m[1])+Number(m[2])));
  await page.clock.runFor(500);
  await page.waitForFunction(()=>Number(document.querySelector('#brain-score').textContent)>=100);
  // 브라우저 뒤로 가기는 게임을 닫고 두뇌교실 목록으로
  await page.goBack();
  await page.locator('#games-page.active-page [data-practice="stroop"]').waitFor();
  assert.equal(await page.locator('.brain-game').count(),0);
  assert.deepEqual(errors,[]);
  console.log('PASS: home radar, points-only ranking, weekend attendance, in-app academy with stroop/calc as regular games, calc keyboard input, browser back, no browser errors.');
}finally{await browser.close();server.close();}
