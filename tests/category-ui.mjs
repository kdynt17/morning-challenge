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
  // 두뇌교실은 같은 화면 안에서 열리고, 원래 3게임도 일반 연습처럼 보인다
  await page.locator('.big-cta').click();
  await page.locator('#games-page.active-page [data-classic="calc"]:not(:disabled)').waitFor();
  assert.equal(await page.locator('[data-classic]').count(),3);
  assert.equal(await page.getByText('추가 연습').count(),0);
  assert.equal(page.url().includes('academy/'),false);
  await page.locator('[data-classic="calc"]').click();
  await page.locator('#calc-page.active-page').waitFor();
  // 브라우저 뒤로 가기로 두뇌교실에 돌아온다
  await page.locator('#tutorial-close').click();
  await page.goBack();
  await page.locator('#games-page.active-page').waitFor();
  await page.goForward();
  await page.locator('#calc-page.active-page').waitFor();
  await page.locator('#calc-start').click();
  await page.waitForFunction(()=>document.querySelector('.countdown-overlay')||document.querySelector('#calc-start').hidden);
  for(let i=0;i<5;i++)await page.clock.runFor(1000);
  for(let n=0;n<20;n++){
    const q=await page.locator('#calc-root [data-role="question"]').textContent();
    const m=q.match(/(\d+)\s*([+−×])\s*(\d+)/);assert.ok(m,q);
    const a=Number(m[1]),b=Number(m[3]),answer=m[2]==='+'?a+b:m[2]==='−'?a-b:a*b;
    await page.clock.runFor(1000);await page.keyboard.type(String(answer));
  }
  await page.locator('#result-dialog[open]').waitFor();
  await page.waitForFunction(()=>document.querySelector('#result-detail').textContent.includes('+10P'));
  await page.locator('#result-again').click();
  assert.equal(await page.locator('#result-dialog[open]').count(),0);
  for(const key of ['stroop','memory']){
    await page.goto(base+'/?game='+key);await page.locator('#tutorial-close').click();
    await page.locator('#'+key+'-start').click();for(let i=0;i<5;i++)await page.clock.runFor(1000);
    assert.equal(await page.locator('#'+key+'-page').evaluate(el=>el.classList.contains('active-page')),true);
  }
  assert.deepEqual(errors,[]);
  console.log('PASS: home radar, points-only ranking, weekend attendance, in-app academy with 3 classic games, browser back/forward, full calc20 completion +10P, no browser errors.');
}finally{await browser.close();server.close();}
