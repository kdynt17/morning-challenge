import {ref,get,set,runTransaction,onValue} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js';
import {dayKey,closesAt,lineup,GAMES,roundMs,areaPoints,scoreRound,rankings,dailyReward} from './functions/domain.mjs';

// Spark classroom edition. Awards and retry markers share the original student balance transaction.
// Like the original app, this trusts approved students; it is not server-side anti-cheat.
export function freeClient(db,user){
  let offset=0;
  const stop=onValue(ref(db,'.info/serverTimeOffset'),s=>{offset=s.val()||0;});
  const now=()=>Date.now()+offset;
  async function publishPoints(){
    const p=(await get(ref(db,`users/${user.uid}`))).val();
    if(p?.role==='student')await set(ref(db,`leaderboardUsers/${user.uid}`),{name:p.name,points:p.points,todayResult:p.todayResult||'-'});
  }
  async function award(claim){
    let reason='';
    const baseline=(await get(ref(db,`users/${user.uid}`))).val();
    const tx=await runTransaction(ref(db,`users/${user.uid}`),p=>{
      p ||= baseline;
      if(p)p={dailyThrough:0,practiceEnd:0,practiceMask:0,...p};
      if(!p)return;
      if(claim.kind==='daily'&&p.dailyThrough>=claim.dayEnd)return;
      if(claim.kind==='practice'&&(p.practiceEnd>claim.dayEnd||(p.practiceEnd===claim.dayEnd&&(p.practiceMask&claim.bit))))return;
      if(p.points+claim.amount<0){reason='포인트가 부족합니다.';return;}
      const next={...p,points:p.points+claim.amount,claim};
      if(claim.kind==='daily')next.dailyThrough=claim.dayEnd;
      if(claim.kind==='practice'){next.practiceMask=(p.practiceEnd===claim.dayEnd?p.practiceMask:0)+claim.bit;next.practiceEnd=claim.dayEnd;}
      return next;
    },{applyLocally:false});
    if(reason)throw Error(reason);
    await publishPoints();
    return tx.committed ? claim.amount : 0;
  }
  async function settle(){
    const sessions=(await get(ref(db,`academy/sessions/${user.uid}`))).val()||{};
    const paid=Number((await get(ref(db,`users/${user.uid}/dailyThrough`))).val()||0);
    for(const s of Object.values(sessions).sort((a,b)=>a.endAt-b.endAt)){
      if(s.mode!=='daily'||!s.done||s.endAt>now()||s.endAt<=paid)continue;
      // 마감된 날의 반 전체 기록으로 순위를 매긴다: 1등 100P, 한 등수마다 -5P, 최소 20P.
      const rank=rankings((await get(ref(db,`academy/daily/${s.endAt}`))).val()||{}).find(r=>r.uid===user.uid)?.rank;
      await award({key:`daily_${s.endAt}`,kind:'daily',dayEnd:s.endAt,amount:dailyReward(rank),rank:rank??0,day:s.day});
    }
    // Retry a practice award after a lost connection, including a rollover.
    const p=sessions.practice;
    if(p?.done)await award({key:`practice_${p.endAt}_${p.category}`,kind:'practice',dayEnd:p.endAt,category:p.category,bit:2**p.category,amount:10,day:p.day});
    await publishPoints();
  }
  async function action(input){
    const time=now(),day=dayKey(time),endAt=closesAt(day),dailyKey=String(endAt);
    const profile=(await get(ref(db,`users/${user.uid}`))).val();
    if(profile.role==='teacher')throw Error('학생 계정으로 게임에 참여해주세요.');
    const key=input.mode==='daily'?String(closesAt(input.day||day)):'practice';
    const path=ref(db,`academy/sessions/${user.uid}/${key}`);
    let s=(await get(path)).val();
    if(input.action==='start'){
      await settle();
      if(input.mode==='practice'&&!(await get(ref(db,`academy/sessions/${user.uid}/${dailyKey}/done`))).val())throw Error('오늘 챌린지를 먼저 완료해주세요.');
      // 연습은 누를 때마다 새 판이다. 하다 만 연습은 버리고, 보상은 영역별 하루 한 번(practiceMask)만 준다.
      if(!s||input.mode==='practice'){
        if(input.mode==='daily'&&endAt-time<325000)throw Error('오전 6시 갱신 후 도전해주세요.');
        const game=GAMES.find(g=>g.id===input.game);
        if(input.mode==='practice'&&!game)throw Error('게임을 선택해주세요.');
        const id=input.mode==='daily'?day:crypto.randomUUID();
        const candidate={id,mode:input.mode,day,endAt,games:input.mode==='daily'?lineup(day):[game.id],seed:input.mode==='daily'?day:id,category:game?.category??0,stage:0,startedAt:time,total:0,done:false};
        await runTransaction(path,current=>!current||input.mode==='practice'?candidate:undefined,{applyLocally:false});
        s=(await get(path)).val();
      }
    }else if(input.action==='finish'){
      if(!s||s.id!==input.sessionId)throw Error('진행 중인 게임이 없습니다.');
      if(s.stage===input.stage&&!s.done){
        if(s.endAt<=time)throw Error('오전 6시에 마감되었습니다. 오늘 도전을 시작해주세요.');
        if(time-s.startedAt<roundMs(s.games[s.stage]))throw Error('아직 게임이 끝나지 않았습니다.');
        const game=s.games[s.stage], result={...scoreRound(game,`${s.seed}:${s.stage}`,input.events),game};
        const next={...s,stage:s.stage+1,results:[...(s.results||[]),result],total:s.total+result.score,startedAt:time+5000,done:s.stage+1===s.games.length};
        await runTransaction(path,current=>!current||(current.id===s.id&&current.stage===input.stage)?next:undefined,{applyLocally:false});
        s=(await get(path)).val();
        const category=GAMES.find(g=>g.id===game).category;
        await runTransaction(ref(db,`academy/history/${user.uid}/${category}`),h=>[...(h||[]),areaPoints(game,result.score)].slice(-7));
        await runTransaction(ref(db,`academy/best/${game}/${user.uid}`),best=>!best||best.score<result.score?{name:profile.name,score:result.score}:undefined);
      }
    }
    if(s?.done){
      if(s.mode==='daily')await runTransaction(ref(db,`academy/daily/${s.endAt}/${user.uid}`),record=>record?undefined:{name:profile.name,score:s.total});
      else await award({key:`practice_${s.endAt}_${s.category}`,kind:'practice',dayEnd:s.endAt,category:s.category,bit:2**s.category,amount:10,day:s.day});
    }
    return {data:{session:s,serverNow:now()}};
  }
  return {action,settle,stop};
}
