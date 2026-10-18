import {initializeApp,deleteApp} from '../node_modules/firebase-admin/lib/app/index.js';
import {getDatabase} from '../node_modules/firebase-admin/lib/database/index.js';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {GAMES,dayKey,closesAt} from '../academy/functions/domain.mjs';
if(!process.env.FIREBASE_DATABASE_EMULATOR_HOST)throw Error('Emulator required');
const opts={projectId:'demo-morning-quest',databaseURL:'https://demo-morning-quest-default-rtdb.firebaseio.com'};
const admin=initializeApp(opts,'client-admin'),app=initializeApp({...opts,databaseAuthVariableOverride:{uid:'bob',token:{email:'b@test.test'}}},'client-student');
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
  assert.equal((await db.ref('users/bob/points').get()).val(),70);
  await assert.rejects(db.ref('msRecords/2026-10/beginner/bob').set({name:'tester',timeMs:10000}));
  await assert.rejects(db.ref('gameDaily/bob').set({day:1,points:5}));
  const yesterday=end-86400000;
  await root.ref(`academy/sessions/bob/${yesterday}`).set({...res.data.session,mode:'daily',endAt:yesterday,stage:5,done:true});
  await client.settle();await client.settle();
  assert.equal((await db.ref('users/bob/points').get()).val(),120);
  // Old shop and teacher awards use the same balance; replay must not overwrite them.
  await root.ref('users/bob/points').transaction(p=>p-30);
  await client.settle();
  assert.equal((await db.ref('users/bob/points').get()).val(),90);
  await root.ref('users/bob/points').transaction(p=>p+25);
  await client.settle();
  assert.equal((await db.ref('users/bob/points').get()).val(),115);
  assert.equal((await db.ref('leaderboardUsers/bob/points').get()).val(),115);
  assert.equal((await root.ref('wallets').get()).exists(),false);
  console.log('PASS: 13 games, original balance preserved, shared shop/teacher balance, 50P practice cap, duplicate settlement blocked, original leaderboard synchronized.');
}finally{client.stop();await Promise.all([admin,app].map(deleteApp));}
