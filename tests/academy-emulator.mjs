import {initializeApp,deleteApp} from '../node_modules/firebase-admin/lib/app/index.js';
import {getDatabase} from '../node_modules/firebase-admin/lib/database/index.js';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {GAMES,dayKey,closesAt} from '../academy/functions/domain.mjs';
if(!process.env.FIREBASE_DATABASE_EMULATOR_HOST)throw Error('Emulator required');
const opts={projectId:'demo-morning-quest',databaseURL:'https://demo-morning-quest-default-rtdb.firebaseio.com'};
const admin=initializeApp(opts,'client-admin'),app=initializeApp({...opts,databaseAuthVariableOverride:{uid:'bob',token:{email:'b@test.test'}}},'client-student');
const teacherApp=initializeApp({...opts,databaseAuthVariableOverride:{uid:'teach',token:{email:'admin@admin.com'}}},'client-teacher');
const root=getDatabase(admin),db=getDatabase(app);
let source=await readFile(new URL('../academy/free-client.js',import.meta.url),'utf8');
source=source.replace('https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js',new URL('./admin-db-adapter.mjs',import.meta.url).href).replace('./brain-score.js',new URL('../academy/brain-score.js',import.meta.url).href).replace('./functions/domain.mjs',new URL('../academy/functions/domain.mjs',import.meta.url).href);
const {freeClient}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const client=freeClient(db,{uid:'bob'});
try{
  await root.ref('users/bob').set({name:'테스트 학생',role:'student',points:20,email:'b@test.test',authEmail:'b@test.test'});
  const day=dayKey(),end=closesAt(day);
  await assert.rejects(client.completeLegacy('calc',80));
  let res=await client.action({action:'start',mode:'daily'});assert.equal(res.data.session.stage,0);
  for(let stage=0;stage<5;stage++){
    await root.ref(`academy/sessions/bob/${end}/startedAt`).set(Date.now()-65000);
    res=await client.action({action:'finish',mode:'daily',day,sessionId:res.data.session.id,stage,events:[]});
  }
  assert.ok((await db.ref(`academy/daily/${end}/bob`).get()).exists());
  assert.equal(await client.completeLegacy('calc',80),10);
  assert.equal(await client.completeLegacy('calc',80),0);
  assert.equal(await client.completeLegacy('stroop',70),10);
  assert.equal(await client.completeLegacy('memory',60,false),0);
  for(const game of GAMES){
    res=await client.action({action:'start',mode:'practice',game:game.id});
    await root.ref('academy/sessions/bob/practice/startedAt').set(Date.now()-65000);
    await client.action({action:'finish',mode:'practice',sessionId:res.data.session.id,stage:0,events:[]});
  }
  assert.equal(await client.completeLegacy('memory',80),0);
  // 하다 만 연습은 다른 게임을 누르면 새 판으로 바뀐다(예전 연습이 다시 뜨지 않음).
  const first=(await client.action({action:'start',mode:'practice',game:'mole'})).data.session;
  const second=(await client.action({action:'start',mode:'practice',game:'view'})).data.session;
  assert.notEqual(first.id,second.id);assert.deepEqual(second.games,['view']);assert.equal(second.done,false);
  // 한 판 최소 시간(30초) 전에는 끝낼 수 없다.
  await assert.rejects(db.ref('academy/sessions/bob/practice').set({...second,stage:1,done:true,startedAt:Date.now()}));
  assert.equal((await db.ref('users/bob/points').get()).val(),70);
  await assert.rejects(db.ref('msRecords/2026-10/beginner/bob').set({name:'tester',timeMs:10000}));
  await assert.rejects(db.ref('gameDaily/bob').set({day:1,points:5}));
  const yesterday=end-86400000;
  await root.ref(`academy/sessions/bob/${yesterday}`).set({...res.data.session,mode:'daily',endAt:yesterday,stage:5,done:true});
  // 순위 보상: 2등이면 100-5 = 95P
  await root.ref(`academy/daily/${yesterday}`).set({amy:{name:'에이미',score:900},bob:{name:'테스트 학생',score:500},cat:{name:'캣',score:100}});
  await client.settle();await client.settle();
  assert.equal((await db.ref('users/bob/points').get()).val(),165);
  assert.equal((await db.ref('users/bob/claim/amount').get()).val(),95);
  // Old shop and teacher awards use the same balance; replay must not overwrite them.
  await root.ref('users/bob/points').transaction(p=>p-30);
  await client.settle();
  assert.equal((await db.ref('users/bob/points').get()).val(),135);
  await root.ref('users/bob/points').transaction(p=>p+25);
  await client.settle();
  assert.equal((await db.ref('users/bob/points').get()).val(),160);
  assert.equal((await db.ref('leaderboardUsers/bob/points').get()).val(),160);
  // 출석은 월~금만, 금요일 다음 월요일도 연속으로 이어진다.
  const today=Math.floor((Date.now()+9*3600000)/86400000),weekday=(today+4)%7,schoolDay=weekday>=1&&weekday<=5;
  const lastSchoolDay=weekday===1?today-3:today-1;
  await root.ref('attendance/bob').set({day:lastSchoolDay,streak:4,total:9});
  const checkIn=db.ref('attendance/bob').set({day:today,streak:5,total:10});
  if(schoolDay)await checkIn;else await assert.rejects(checkIn);
  if(schoolDay){
    await root.ref('attendance/bob').set({day:lastSchoolDay-1,streak:4,total:9});
    await assert.rejects(db.ref('attendance/bob').set({day:today,streak:5,total:10}));
  }
  assert.equal((await root.ref('wallets').get()).exists(),false);
  // 관리자 계정(admin@admin.com)은 처음 로그인할 때 자기 선생님 프로필을 만들고 학생 목록을 읽을 수 있다.
  const teacherDb=getDatabase(teacherApp);
  await teacherDb.ref('users/teach').set({name:'선생님',email:'admin@admin',authEmail:'admin@admin.com',role:'teacher',points:0,todayResult:'-',createdAt:Date.now()});
  assert.ok((await teacherDb.ref('users').get()).child('bob').exists());
  await teacherDb.ref('leaderboardUsers/teach').remove();
  console.log(`PASS: admin profile bootstrap, 13 games, practice replacement + 30s minimum, rank reward 95P for 2nd, original balance preserved, shared shop/teacher balance, 50P practice cap, duplicate settlement blocked, leaderboard synced, weekday attendance (today is ${schoolDay?'a school day':'a weekend'}).`);
}finally{client.stop();await Promise.all([admin,app,teacherApp].map(deleteApp));}
