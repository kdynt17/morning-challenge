// 게임마다 한 판 시간이 다르다. 빨리 고르는 직감은 짧게, 기억·관찰이 필요한 게임은 조금 길게.
export const ROUND_MS = 45000; // 가장 긴 한 판(기록 검사 상한)
export const MIN_ROUND_MS = 20000; // 가장 짧은 한 판(DB 규칙의 최소 진행 시간)
const ROUND_TIME = { mole: 30000, focus: 20000, largest: 30000, stroop: 30000, memory: 45000, sequence: 45000, blocks: 40000, balance: 35000, ladder: 30000, hammer: 40000, balloons: 35000, calc: 40000, pieces: 40000, rail: 40000, view: 40000 };
export function roundMs(game) { return ROUND_TIME[game] ?? ROUND_MS; }
// 한 판 시간이 달라도 말랑그램은 공평하게: 점수를 40초 한 판 기준으로 바꿔 영역 기록에 넣는다.
export const SCORE_BASE_MS = 40000;
export function areaPoints(game, score) { return Math.round(Number(score || 0) * SCORE_BASE_MS / roundMs(game)); }
export const CATEGORIES = ['직감', '기억', '분석', '계산', '지각'];
export const GAMES = [
  { id: 'mole', name: '그림두더지', category: 0, help: '목표 그림과 같은 그림을 고르세요. 그림이 3개에서 12개까지 늘어나요.' },
  { id: 'focus', name: '가운데만 봐', category: 0, help: '주변 화살표를 무시하고 가운데 화살표 방향을 고르세요.' },
  { id: 'largest', name: '최고 숫자', category: 0, help: '글자 크기가 아니라 숫자 값이 가장 큰 것을 고르세요.' },
  { id: 'stroop', name: '색깔 판단', category: 0, help: '글자 뜻에 속지 말고, 글자가 칠해진 색깔을 고르세요.' },
  { id: 'memory', name: '순간기억', category: 1, help: '숫자 위치를 기억했다가 작은 수부터 누르세요. 판이 커지고 숫자도 띄엄띄엄 나와요.' },
  { id: 'sequence', name: '순서기억', category: 1, help: '차례로 켜지는 칸을 같은 순서로 누르세요. 갈수록 빨라져요.' },
  { id: 'blocks', name: '블록매치', category: 2, help: '블록 조각을 눌러 통째로 없애세요. 위 블록이 떨어져서 목표 모양이 되면 완성!' },
  { id: 'balance', name: '저울비교', category: 2, help: '시소에서 내려간 쪽이 더 무거워요. 가장 무거운(또는 가벼운) 도형을 고르세요.' },
  { id: 'ladder', name: '사다리 연결', category: 2, help: '선을 하나 추가해 출발점에서 목표 도착점으로 연결하세요.' },
  { id: 'hammer', name: '더쎈 망치', category: 3, help: '숫자 블록 탑에서 필요 없는 블록을 깡! 부숴 남은 합을 목표에 맞추세요.' },
  { id: 'balloons', name: '숫자풍선', category: 3, help: '떠다니는 풍선을 작은 수부터 터뜨리세요. 두 자리 수·음수·소수도 나와요.' },
  { id: 'calc', name: '계산 20', category: 3, help: '계산 답을 숫자판으로 입력하세요. 자리 수를 다 채우면 바로 채점해요.' },
  { id: 'pieces', name: '조각퍼즐', category: 4, help: '주어진 조각과 겹치지 않고 합쳐 목표를 채울 조각을 고르세요.' },
  { id: 'rail', name: '선로잇기', category: 4, help: '출발점에서 도착점까지 이어지도록 빈칸의 선로를 고르세요.' },
  { id: 'view', name: '시점추측', category: 4, help: '블록 탑을 화살표(눈) 쪽에서 본 모습을 고르세요.' },
];
export const STROOP_COLORS = [['빨강', '#e8403f'], ['파랑', '#2f6fe8'], ['노랑', '#f2b51c'], ['초록', '#2fa84f'], ['보라', '#8b5cf6'], ['검정', '#3b2f25']];
export function dayKey(now = Date.now()) { return new Date(now + 3 * 3600000).toISOString().slice(0, 10); }
export function closesAt(day) { return Date.parse(day + 'T21:00:00Z'); }
// 하루 도전 순위 보상: 1등 100P부터 한 등수마다 5P씩 줄고, 17등부터는 기본 20P.
export function dailyReward(rank) { return Number.isInteger(rank) && rank > 0 ? Math.max(20, 100 - 5 * (rank - 1)) : 20; }
export function rng(seed) {
  let n = 2166136261;
  for (const c of String(seed)) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  return () => { n += 0x6D2B79F5; let t = Math.imul(n ^ n >>> 15, 1 | n); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function lineup(day) { const r = rng(day); return CATEGORIES.map((_, i) => { const games = GAMES.filter(g => g.category === i); return games[Math.floor(r() * games.length)].id; }); }
// 테스트용 계정은 순위·보상·학생 목록에서 뺀다. (test1@test.com)
export const HIDDEN_UIDS = new Set(['7RyjceEPTygQef2iDZPYcKPxRwv1']);
export const isHiddenUid = (uid) => HIDDEN_UIDS.has(uid);
export function rankings(records = {}) {
  const rows = Object.entries(records).filter(([uid]) => !isHiddenUid(uid)).map(([uid, r]) => ({ ...r, uid })).sort((a, b) => b.score - a.score || a.uid.localeCompare(b.uid));
  return rows.map((r, i) => ({ ...r, rank: rows.findIndex(x => x.score === r.score) + 1 }));
}
export function settle(state, now) {
  for (const [day, records] of Object.entries(state.brain?.daily || {})) {
    if (closesAt(day) > now) continue;
    for (const row of rankings(records)) {
      const user = state.users?.[row.uid];
      if (!user) continue;
      user.brainRewards ||= {};
      if (user.brainRewards[day]) continue;
      const points = dailyReward(row.rank);
      user.points = Number(user.points || 0) + points;
      user.brainRewards[day] = { points, rank: row.rank, score: row.score, paidAt: now };
    }
  }
  state.pointLeaderboard=Object.fromEntries(Object.entries(state.users||{}).filter(([,u])=>u.role!=='teacher').map(([uid,u])=>[uid,{name:u.name||'학생',points:Number(u.points||0)}]));
  return state;
}
export function traceLadder(start, lines) { return lines.reduce((p, x) => p === x ? p + 1 : p === x + 1 ? p - 1 : p, start); }
// 블록매치: 각 열에서 남은 칸 수(위 블록은 아래로 떨어진다)
export function blockHeights(q, removed = []) {
  return Array.from({ length: q.width }, (_, c) => Array.from({ length: q.height }, (_, row) => q.owner[row * q.width + c]).filter((o) => o >= 0 && !removed.includes(o)).length);
}
// step = 지금까지 맞힌 개수. 난이도는 맞혀야만 올라가고, 틀리면 같은 단계의 새 문제가 나온다.
// 계산 20은 틀리면 같은 문제를 다시 풀어야 한다(그래야 '다음 문제' 미리보기도 정확하다).
export function question(game, seed, index, step = index) {
  const r = rng(`${seed}:${game}:${game === 'calc' ? `s${step}` : index}`), int = n => Math.floor(r() * n);
  const shuffle = a => a.map(x => [r(), x]).sort((a,b) => a[0]-b[0]).map(x=>x[1]);
  const range = (n, from = 0) => Array.from({ length: n }, (_, i) => i + from);
  const level = Math.min(5, Math.floor(step / 3));
  const q = { type: 'choice', prompt: '', choices: [], answer: [], preview: 0 };
  if (game === 'mole') {
    const icons = shuffle(['🐱','🐶','🐼','🐸','🐷','🐥','🐰','🐵','🐨','🐧','🐭','🐻']);
    q.choices = icons.slice(0, Math.min(12, 3 + Math.floor(step / 2))); q.answer = [int(q.choices.length)]; q.prompt = `이 그림을 찾아요: ${q.choices[q.answer[0]]}`;
  } else if (game === 'focus') {
    const arrows = level < 1 ? ['←','→'] : ['←','→','↑','↓'];
    q.choices = arrows; q.answer = [int(arrows.length)]; q.prompt = Array.from({length:5}, (_,i)=>arrows[i===2?q.answer[0]:int(arrows.length)]).join('  ');
  } else if (game === 'largest') {
    const nums = shuffle(Array.from({length:80}, (_,i)=>(i-30)/(level>0?10:1))).slice(0, 4+Math.min(level,2));
    q.choices = nums.map(String); q.prompt = '값이 가장 큰 숫자는?';
    q.answer = [nums.indexOf(Math.max(...nums))]; q.sizes = nums.map(()=>20+int(30));
  } else if (game === 'stroop') {
    // 쉬울 때는 4색, 갈수록 5·6색. 3단계부터는 보기 글자 색도 헷갈리게 칠한다.
    const pool = STROOP_COLORS.slice(0, level < 2 ? 4 : level < 4 ? 5 : 6);
    const order = shuffle(range(pool.length));
    q.choices = order.map((i) => pool[i][0]); q.colors = order.map((i) => pool[i][1]);
    const ink = int(pool.length), same = level === 0 && r() < 0.3;
    const word = same ? ink : (ink + 1 + int(pool.length - 1)) % pool.length;
    q.word = q.choices[word]; q.ink = q.colors[ink]; q.answer = [ink]; q.prompt = '글자의 색깔은?';
    if (level >= 3) q.labelColors = q.choices.map(() => q.colors[int(q.colors.length)]);
  } else if (game === 'balloons') {
    // 한 자리 → 두 자리 → 음수 → 소수 → 모두 섞기
    const count = [4, 5, 6, 6, 7, 8][level], values = new Set();
    while (values.size < count) {
      const kind = level >= 4 ? int(3) : level === 3 ? 2 : level === 2 ? 1 : 0;
      const v = level === 0 ? 1 + int(9) : kind === 0 ? 1 + int(99) : kind === 1 ? int(120) - 40 : Math.round((int(200) - 99) / 10 * 10) / 10;
      values.add(v);
    }
    const nums = shuffle([...values]);
    q.choices = nums.map(String); q.prompt = '작은 수부터 차례대로'; q.type = 'sequence';
    q.answer = nums.map((_,i)=>i).sort((a,b)=>nums[a]-nums[b]);
  } else if (game === 'memory') {
    // 3×3 → 4×4 → 5×5. 9문제째부터는 1,3,5,7,10처럼 띄엄띄엄한 수가 나온다.
    const size = level < 2 ? 3 : level < 4 ? 4 : 5, count = Math.min(10, 3 + Math.floor(step / 2));
    const cells = shuffle(range(size * size)).slice(0, count);
    const numbers = level < 3 ? range(count, 1) : shuffle(range(20, 1)).slice(0, count).sort((a, b) => a - b);
    q.type = 'memory'; q.size = size; q.choices = Array(size * size).fill(''); q.answer = cells;
    cells.forEach((pos, i) => { q.choices[pos] = String(numbers[i]); });
    q.preview = 900 + count * 250; q.prompt = '작은 숫자가 있던 칸부터 누르세요';
  } else if (game === 'sequence') {
    // 4칸부터 시작해 길어지고, 불이 켜지는 속도도 점점 빨라진다.
    const size = level < 3 ? 3 : 4, count = Math.min(9, 4 + Math.floor(step / 3));
    q.type = 'memory'; q.size = size; q.choices = Array(size * size).fill(''); q.answer = shuffle(range(size * size)).slice(0, count);
    q.flash = Math.max(280, 620 - step * 22); q.preview = count * q.flash + 300; q.prompt = '반짝인 순서대로 누르세요';
  } else if (game === 'blocks') {
    // 테트리스처럼: 조각을 누르면 조각 전체가 사라지고, 위에 있던 블록이 떨어진다.
    const W = 4, H = level < 2 ? 4 : 5, heights = Array.from({ length: W }, () => 2 + int(H - 1));
    const owner = Array(W * H).fill(-1), filled = (c, row) => row < heights[c];
    let pieces = 0;
    for (const start of shuffle(range(W * H))) {
      const c = start % W, row = Math.floor(start / W);
      if (!filled(c, row) || owner[start] >= 0) continue;
      const want = 1 + int(level < 2 ? 3 : 4), cells = [start]; owner[start] = pieces;
      while (cells.length < want) {
        const next = shuffle(cells.flatMap((p) => [p - W, p + W, p % W ? p - 1 : -1, p % W < W - 1 ? p + 1 : -1]))
          .find((p) => p >= 0 && p < W * H && owner[p] < 0 && filled(p % W, Math.floor(p / W)));
        if (next === undefined) break;
        owner[next] = pieces; cells.push(next);
      }
      pieces++;
    }
    q.type = 'tetris'; q.width = W; q.height = H; q.owner = owner;
    q.choices = range(pieces).map((i) => `조각 ${i + 1}`);
    q.answer = shuffle(range(pieces)).slice(0, Math.max(1, Math.min(pieces - 1, 1 + Math.floor(level / 2))));
    q.target = blockHeights(q, q.answer); q.prompt = '조각을 없애 목표 모양을 만드세요';
  } else if (game === 'balance') {
    // 처음엔 두 개만 비교. 갈수록 도형이 늘고, 시소 방향이 섞이고, 가장 가벼운 것을 묻기도 한다.
    const n = level === 0 ? 2 : level === 1 ? 3 : 4, shapes = shuffle(['●','▲','■','◆']).slice(0, n);
    const relations = range(n - 1).map((i) => [shapes[i], shapes[i + 1]]);
    if (level >= 3) relations.push([shapes[0], shapes[n - 1]]);
    q.relations = shuffle(relations).map(([light, heavy]) => ({ light, heavy, flip: level >= 2 && r() < 0.5 }));
    q.ask = level >= 4 && r() < 0.5 ? 'light' : 'heavy';
    q.choices = shuffle(shapes); q.answer = [q.choices.indexOf(q.ask === 'light' ? shapes[0] : shapes[n - 1])];
    q.prompt = q.relations.map((x) => `${x.light} < ${x.heavy}`).join('     ');
    q.caption = q.ask === 'light' ? '가장 가벼운 도형은?' : '가장 무거운 도형은?';
  } else if (game === 'ladder') {
    // 처음엔 가로줄 1개뿐이라 쉽다. 갈수록 가로줄이 늘어난다.
    q.lines=Array.from({length:Math.min(6, 1+level)},()=>int(3)); q.start=int(4); q.slot=int(q.lines.length+1);
    const candidate=int(3), full=[...q.lines];full.splice(q.slot,0,candidate);q.end=traceLadder(q.start,full);
    q.choices=['1–2 연결','2–3 연결','3–4 연결'];
    q.valid=q.choices.map((_,i)=>{const ls=[...q.lines];ls.splice(q.slot,0,i);return traceLadder(q.start,ls)===q.end;});
    q.answer=[candidate]; q.prompt=`${q.start+1}번 출발 → ${q.end+1}번 도착. ? 위치에 넣을 선은?`;
  } else if (game === 'hammer') {
    // 숫자 블록 탑. 블록이 4개에서 8개까지 늘고, 2단계부터 음수, 남겨야 할 블록도 2→4개로 늘어난다.
    q.type='sum'; q.numbers=Array.from({length:4+Math.min(level,4)},()=>level<2?1+int(9):int(20)-6);q.choices=q.numbers.map(String);
    const keep=shuffle(range(q.numbers.length)).slice(0,level<2?2:level<4?3:4);q.targetSum=keep.reduce((a,i)=>a+q.numbers[i],0);q.answer=range(q.numbers.length).filter(i=>!keep.includes(i));
    q.prompt=`목표 합 ${q.targetSum} · 필요 없는 블록을 부수세요`;
  } else if (game === 'calc') {
    // 한 자리 덧셈 → 뺄셈 → 곱셈 → 두 자리 덧·뺄셈 → 두 자리×한 자리 → 섞어 계산
    let text, value;
    const a = 1 + int(9), b = 1 + int(9);
    if (level === 0) { text = `${a} + ${b}`; value = a + b; }
    else if (level === 1) { const x = a + b; text = `${x} − ${b}`; value = a; }
    else if (level === 2) { const x = 2 + int(8), y = 2 + int(8); text = `${x} × ${y}`; value = x * y; }
    else if (level === 3) { const x = 10 + int(90), y = 10 + int(90); if (r() < 0.5) { text = `${x} + ${y}`; value = x + y; } else { text = `${Math.max(x, y)} − ${Math.min(x, y)}`; value = Math.abs(x - y); } }
    else if (level === 4) { const x = 11 + int(19), y = 2 + int(8); text = `${x} × ${y}`; value = x * y; }
    else { const x = 2 + int(8), y = 2 + int(8), z = 1 + int(20); text = `${x} × ${y} + ${z}`; value = x * y + z; }
    q.type = 'digits'; q.choices = ['1','2','3','4','5','6','7','8','9','0']; q.prompt = `${text} =`; q.value = value;
    q.answer = String(value).split('').map((d) => (d === '0' ? 9 : Number(d) - 1));
  } else if (game === 'pieces') {
    q.target=Array.from({length:9},()=>int(2));q.target[4]=1;
    q.given=q.target.map(v=>v&&int(2));if(q.given.every((v,i)=>v===q.target[i])) q.given[4]=0;
    const correct=q.target.map((v,i)=>v&&!q.given[i]?1:0);
    q.patterns=[correct,...[0,1,2].map(k=>correct.map((v,i)=>i===k?1-v:v))];q.patterns=shuffle(q.patterns);
    q.answer=[q.patterns.indexOf(correct)];q.choices=q.patterns.map((_,i)=>`조각 ${i+1}`);q.prompt='왼쪽 조각과 합쳐 목표 모양을 완성하세요';
  } else if (game === 'rail') {
    q.trackSize=4;
    let path=[];
    do {path=[int(16)];while(path.length<10){const p=path.at(-1),neighbors=[p%4>0?p-1:-1,p%4<3?p+1:-1,p>=4?p-4:-1,p<12?p+4:-1].filter(x=>x>=0&&!path.includes(x));if(!neighbors.length)break;path.push(neighbors[int(neighbors.length)]);}}while(path.length<5);
    q.track=Array(16).fill('·');q.track[path[0]]='🚂';q.track[path.at(-1)]='🏁';
    for(let i=1;i<path.length-1;i++){const p=path[i],dirs=[path[i-1]-p,path[i+1]-p].sort((a,b)=>a-b).join(',');q.track[p]={'-1,1':'━','-4,4':'┃','1,4':'┏','-1,4':'┓','-4,1':'┗','-4,-1':'┛'}[dirs];}
    const positions=path.slice(1,-1);
    const pos=positions[int(positions.length)], correct=q.track[pos];q.track[pos]='?';q.choices=shuffle(['━','┃','┏','┓','┗','┛']);q.answer=[q.choices.indexOf(correct)];q.prompt='빈칸에 들어갈 선로는?';
  } else if (game === 'view') {
    q.heights=Array.from({length:9},()=>int(4));q.direction=int(2);q.prompt=q.direction?'오른쪽에서 본 블록 높이는?':'앞에서 본 블록 높이는?';
    // 앞(왼쪽 아래)에서 보면 x가 왼→오른쪽, 오른쪽(오른쪽 아래)에서 보면 y가 큰 쪽이 왼쪽이다.
    const correct=Array.from({length:3},(_,i)=>Math.max(...[0,1,2].map(j=>q.heights[q.direction?(2-i)*3+j:j*3+i])));
    q.projections=[correct,...[0,1,2].map(k=>correct.map((v,i)=>i===k?(v+1)%4:v))];q.projections=shuffle(q.projections);q.answer=[q.projections.indexOf(correct)];q.choices=q.projections.map((_,i)=>`모습 ${i+1}`);
  } else throw new Error('알 수 없는 게임');
  return q;
}
export function isCorrect(q, selected) {
  if (!Array.isArray(selected) || selected.some(i=>!Number.isInteger(i)||i<0||i>=q.choices.length)) return false;
  // 계산은 같은 숫자를 여러 번 누를 수 있다(예: 11).
  if(q.type==='digits') return selected.length===q.answer.length && selected.every((v,i)=>v===q.answer[i]);
  if(new Set(selected).size!==selected.length) return false;
  if(q.type==='tetris') return blockHeights(q,selected).every((h,c)=>h===q.target[c]);
  if(q.type==='sum') return q.numbers.filter((_,i)=>!selected.includes(i)).reduce((a,b)=>a+b,0)===q.targetSum;
  if(q.valid) return selected.length===1 && q.valid[selected[0]];
  if(q.type==='remove') return selected.length===q.answer.length && selected.every(i=>q.answer.includes(i));
  return selected.length===q.answer.length && selected.every((v,i)=>v===q.answer[i]);
}
// 틀리면 80점 감점(0점 아래로는 안 내려감)과 0.7초 대기. 아무거나 막 눌러서 점수를 올릴 수 없게 한다.
export const WRONG_PENALTY = 80;
export const WRONG_COOLDOWN = 700;
export function scoreRound(game, seed, events) {
  if(!Array.isArray(events)||events.length>400) throw new Error('기록 형식 오류');
  let score=0, combo=0, last=0, correct=0, wrong=0, cooldown=0;
  events.forEach((e,i)=>{
    const q=question(game,seed,i,correct);
    if(!Number.isFinite(e.at)||e.at<last+Math.max(180,q.preview)+cooldown||e.at>roundMs(game)) throw new Error('기록 시간 오류');
    last=e.at; const ok=isCorrect(q,e.selected);cooldown=ok?0:WRONG_COOLDOWN;
    if(ok){correct++;combo++;score+=100+Math.min(combo-1,10)*5;}else{combo=0;wrong++;score=Math.max(0,score-WRONG_PENALTY);}
  });
  return {score,correct,wrong,attempts:events.length};
}
