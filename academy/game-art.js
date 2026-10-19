// 13개 게임의 문제 화면 그리기. 그림 파일은 그림두더지 동물만 쓰고, 나머지는 코드로 그린 SVG다.
// 모든 함수는 HTML 문자열을 돌려주며, 정답 버튼에는 data-answer 를 붙인다.

import { asset } from './brain-score.js';

const INK = '#3b2f25';
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// domain.mjs 의 그림두더지 이모지를 저장소 그림으로 바꿔 보여준다(문제 생성 규칙은 그대로).
const ANIMALS = { '🐱': 'cat', '🐶': 'dog', '🐼': 'panda', '🐸': 'frog', '🐷': 'pig', '🐥': 'chick', '🐰': 'rabbit', '🐵': 'monkey', '🐨': 'koala', '🐧': 'penguin', '🐭': 'mouse', '🐻': 'bear', '🐙': 'pig', '🦊': 'chick' };
const animal = (emoji, size = 72) => `<img class="animal" src="${asset(`animal-${ANIMALS[emoji] ?? 'bear'}.webp`)}" width="${size}" height="${size}" alt="${ANIMALS[emoji] ?? '동물'}" draggable="false" />`;

const ARROW_ANGLE = { '→': 0, '↓': 90, '←': 180, '↑': 270 };
const ARROW_NAME = { '→': '오른쪽', '↓': '아래', '←': '왼쪽', '↑': '위' };
const arrow = (ch, size = 46, fill = '#fff') => `<svg class="arrow" viewBox="0 0 48 48" width="${size}" height="${size}" aria-hidden="true"><g transform="rotate(${ARROW_ANGLE[ch] ?? 0} 24 24)"><path d="M6 19h20V9l17 15-17 15V29H6z" fill="${fill}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/></g></svg>`;

const SHAPES = {
  '●': (s) => `<circle cx="${s / 2}" cy="${s / 2}" r="${s * 0.36}" fill="#ff7a6b"/>`,
  '▲': (s) => `<path d="M${s / 2} ${s * 0.12} L${s * 0.9} ${s * 0.86} H${s * 0.1}Z" fill="#ffd23f"/>`,
  '■': (s) => `<rect x="${s * 0.16}" y="${s * 0.16}" width="${s * 0.68}" height="${s * 0.68}" rx="${s * 0.06}" fill="#5fb0ff"/>`,
  '◆': (s) => `<path d="M${s / 2} ${s * 0.08} L${s * 0.92} ${s / 2} L${s / 2} ${s * 0.92} L${s * 0.08} ${s / 2}Z" fill="#6fd08c"/>`,
};
const SHAPE_NAME = { '●': '동그라미', '▲': '세모', '■': '네모', '◆': '마름모' };
const shape = (ch, size = 44) => `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true"><g stroke="${INK}" stroke-width="3.5" stroke-linejoin="round">${SHAPES[ch]?.(size) ?? ''}</g></svg>`;

const PIECE_COLORS = ['#ff8a65', '#ffd23f', '#7cc4ff', '#8fe0a0', '#c7a3ff', '#ffb067', '#ff9ad5', '#9be7e4', '#f6a21b', '#b5d86b'];

// 열 높이로 목표 모양을 그린다(아래부터 채움).
function heightGrid(heights, rows) {
  const cells = [];
  for (let row = rows - 1; row >= 0; row--) heights.forEach((h) => cells.push(`<i class="${row < h ? 'on' : ''}"></i>`));
  return `<span class="mini-grid is-goal" style="grid-template-columns:repeat(${heights.length},16px)">${cells.join('')}</span>`;
}

export function miniGrid(values, cls = '') {
  return `<span class="mini-grid ${cls}">${values.map((v) => `<i class="${v ? 'on' : ''}"></i>`).join('')}</span>`;
}

// 저울: "A < B" 관계마다 오른쪽(무거운 쪽)이 내려간 시소를 그린다.
// 받침대는 위가 뾰족한 삼각형. flip이면 무거운 쪽이 왼쪽에 온다.
function seesaw({ light, heavy, flip = false }) {
  const [left, right] = flip ? [heavy, light] : [light, heavy];
  return `<svg class="seesaw" viewBox="0 0 150 92" aria-label="${SHAPE_NAME[light]}보다 ${SHAPE_NAME[heavy]}이(가) 무거움">
    <path d="M75 60 L60 88 H90Z" fill="#c9a36b" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>
    <g transform="rotate(${flip ? -12 : 12} 75 60)">
      <rect x="14" y="52" width="122" height="8" rx="4" fill="#e8c88f" stroke="${INK}" stroke-width="3.5"/>
      <g transform="translate(18 14)">${shape(left, 38)}</g>
      <g transform="translate(94 14)">${shape(right, 38)}</g>
    </g></svg>`;
}

// 사다리: 세로줄 4개, 가로줄 5칸(그중 하나가 ?), 위에 출발, 아래에 도착 표시.
function ladder(q) {
  const rows = [...q.lines];
  rows.splice(q.slot, 0, -1);
  const x = (col) => 30 + col * 60;
  const y = (row) => 54 + row * 34;
  const height = y(rows.length) + 6;
  const rungs = rows.map((col, row) => (col === -1
    ? `<rect x="${x(0) - 10}" y="${y(row) + 2}" width="${x(3) - x(0) + 20}" height="26" rx="8" fill="#fff3b0" stroke="#d99a00" stroke-width="3" stroke-dasharray="6 5"/><text x="${(x(0) + x(3)) / 2}" y="${y(row) + 21}" text-anchor="middle" class="svg-q">?</text>`
    : `<line x1="${x(col)}" y1="${y(row) + 15}" x2="${x(col + 1)}" y2="${y(row) + 15}" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>`)).join('');
  const posts = [0, 1, 2, 3].map((col) => `<line x1="${x(col)}" y1="40" x2="${x(col)}" y2="${height - 18}" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>
    <text x="${x(col)}" y="28" text-anchor="middle" class="svg-num ${col === q.start ? 'is-start' : ''}">${col + 1}</text>
    <text x="${x(col)}" y="${height + 6}" text-anchor="middle" class="svg-num ${col === q.end ? 'is-end' : ''}">${col + 1}</text>`).join('');
  return `<svg class="ladder" viewBox="0 0 240 ${height + 14}" role="img" aria-label="사다리 ${q.start + 1}번 출발, ${q.end + 1}번 도착">
    <circle cx="${x(q.start)}" cy="22" r="15" fill="#ffd23f" stroke="${INK}" stroke-width="3"/>
    <circle cx="${x(q.end)}" cy="${height}" r="15" fill="#7ed492" stroke="${INK}" stroke-width="3"/>
    ${posts}${rungs}</svg>`;
}

function ladderChoice(col) {
  const xs = [10, 30, 50, 70];
  return `<svg viewBox="0 0 80 44" width="80" height="44" aria-hidden="true">${xs.map((x) => `<line x1="${x}" y1="6" x2="${x}" y2="38" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>`).join('')}
    <line x1="${xs[col]}" y1="22" x2="${xs[col + 1]}" y2="22" stroke="#e8590c" stroke-width="6" stroke-linecap="round"/></svg>`;
}

// 선로 조각: 각 기호가 잇는 방향을 칸 중앙에서 뻗는 선으로 그린다.
const RAIL_DIRS = { '━': ['l', 'r'], '┃': ['u', 'd'], '┏': ['r', 'd'], '┓': ['l', 'd'], '┗': ['u', 'r'], '┛': ['u', 'l'] };
const RAIL_END = { l: [0, 25], r: [50, 25], u: [25, 0], d: [25, 50] };
function railTile(symbol, size = 50) {
  const dirs = RAIL_DIRS[symbol];
  if (!dirs) return '';
  const [a, b] = dirs.map((d) => RAIL_END[d]);
  const path = `M${a[0]} ${a[1]} Q25 25 ${b[0]} ${b[1]}`;
  return `<svg viewBox="0 0 50 50" width="${size}" height="${size}" aria-hidden="true">
    <path d="${path}" fill="none" stroke="${INK}" stroke-width="19"/>
    <path d="${path}" fill="none" stroke="#b07a4a" stroke-width="13"/>
    <path d="${path}" fill="none" stroke="#f3dcb8" stroke-width="3" stroke-dasharray="4 5"/></svg>`;
}
const RAIL_NAME = { '━': '가로 직선', '┃': '세로 직선', '┏': '오른쪽-아래 굽은 길', '┓': '왼쪽-아래 굽은 길', '┗': '위-오른쪽 굽은 길', '┛': '위-왼쪽 굽은 길' };

function railBoard(q) {
  return `<div class="rail-board" style="--n:${q.trackSize}">${q.track.map((cell) => {
    if (cell === '🚂') return '<span class="rail-cell is-start" aria-label="출발"><b>출발</b></span>';
    if (cell === '🏁') return '<span class="rail-cell is-goal" aria-label="도착"><b>도착</b></span>';
    if (cell === '?') return '<span class="rail-cell is-gap" aria-label="빈칸">?</span>';
    if (RAIL_DIRS[cell]) return `<span class="rail-cell">${railTile(cell, 48)}</span>`;
    return '<span class="rail-cell is-empty"></span>';
  }).join('')}</div>`;
}

// 시점추측: 3×3 바닥 위 블록 탑을 비스듬히 본 그림.
function towers(heights, direction) {
  const project = (x, y, z) => [130 + (x - y) * 24, 48 + (x + y) * 12 - z * 24].join(',');
  let cubes = '';
  for (let depth = 0; depth < 5; depth++) for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) if (x + y === depth) {
    for (let z = 0; z < heights[y * 3 + x]; z++) {
      cubes += `<polygon fill="#b48cf5" points="${project(x + 1, y, z)} ${project(x + 1, y + 1, z)} ${project(x + 1, y + 1, z + 1)} ${project(x + 1, y, z + 1)}"/>`
        + `<polygon fill="#8457d6" points="${project(x, y + 1, z)} ${project(x + 1, y + 1, z)} ${project(x + 1, y + 1, z + 1)} ${project(x, y + 1, z + 1)}"/>`
        + `<polygon fill="#e3d4ff" points="${project(x, y, z + 1)} ${project(x + 1, y, z + 1)} ${project(x + 1, y + 1, z + 1)} ${project(x, y + 1, z + 1)}"/>`;
    }
  }
  const floor = `<polygon points="${project(0, 0, 0)} ${project(3, 0, 0)} ${project(3, 3, 0)} ${project(0, 3, 0)}" fill="#efe3c4" stroke="${INK}" stroke-width="2"/>`;
  // 앞 = 왼쪽 아래 면, 오른쪽 = 오른쪽 아래 면. 눈에서 그 면을 향해 화살표를 그린다.
  const eyeAt = (x, y, dx, dy, labelX) => `<g class="eye-mark">
      <ellipse cx="${x}" cy="${y}" rx="13" ry="9" fill="#fff" stroke="${INK}" stroke-width="3"/><circle cx="${x + dx * 4}" cy="${y + dy * 4}" r="4.5" fill="${INK}"/>
      <path d="M${x + dx * 18} ${y + dy * 18} L${x + dx * 40} ${y + dy * 40}" stroke="#e8590c" stroke-width="5" stroke-linecap="round"/>
      <path d="M${x + dx * 40 - dx * 9 + dy * 8} ${y + dy * 40 - dy * 9 - dx * 8} L${x + dx * 40} ${y + dy * 40} L${x + dx * 40 - dx * 9 - dy * 8} ${y + dy * 40 - dy * 9 + dx * 8}" fill="none" stroke="#e8590c" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
      <text x="${labelX}" y="${y + 26}" class="svg-label">여기서 봐요</text></g>`;
  const eye = direction ? eyeAt(206, 128, -0.71, -0.71, 206) : eyeAt(54, 128, 0.71, -0.71, 54);
  return `<svg viewBox="20 -50 230 210" class="tower-art" role="img" aria-label="${direction ? '오른쪽' : '앞'}에서 볼 블록 탑">${floor}<g stroke="${INK}" stroke-width="1.6" stroke-linejoin="round">${cubes}</g>${eye}</svg>`;
}

const projection = (cols) => `<span class="projection">${cols.map((h) => `<i style="--h:${h}">${'<b></b>'.repeat(h)}</i>`).join('')}</span>`;

// 풍선: 숫자마다 색을 돌려가며 쓴다.
const BALLOON_COLORS = ['#ff8fa3', '#ffd23f', '#7cc4ff', '#8fe0a0', '#c7a3ff', '#ffb067', '#ff9ad5', '#9be7e4'];
const STROOP_INK = '#3b2f25';
// 다시 그려도 둥실거림이 끊기지 않게, 지금 시각에 맞춘 음수 지연을 준다.
const drift = (time, i, period) => `-${(((time || 0) / 1000) + i * 0.83) % period}s`;

/**
 * 문제 화면 HTML.
 * @param {string} game  게임 id
 * @param {object} q     domain.mjs question()
 * @param {{preview:boolean, lit:number, selected:number[]}} view
 */
export function renderQuestion(game, q, view) {
  const { preview, lit, selected, time = 0, next = '', fresh = true } = view;
  const picked = (i) => selected.includes(i);
  const disabled = (i) => (preview || picked(i) ? 'disabled' : '');
  let stage = '';
  let choices = '';
  let prompt = esc(q.prompt);
  let layout = 'grid-2';

  switch (game) {
    case 'mole': {
      prompt = '같은 그림을 찾아 톡!';
      stage = `<div class="target-card">${animal(q.choices[q.answer[0]], 84)}</div>`;
      layout = q.choices.length > 9 ? 'grid-4 mole-many' : 'grid-3';
      choices = q.choices.map((c, i) => `<button class="tile tile-pic" data-answer="${i}" aria-label="${ANIMALS[c] ?? '그림'}" ${disabled(i)}>${animal(c, 64)}</button>`).join('');
      break;
    }
    case 'focus': {
      prompt = '가운데 화살표는 어느 쪽?';
      const arrows = q.prompt.split(/\s+/).filter(Boolean);
      stage = `<div class="arrow-row">${arrows.map((a, i) => `<span class="${i === 2 ? 'is-center' : ''}">${arrow(a, 54)}</span>`).join('')}</div>`;
      layout = q.choices.length > 2 ? 'grid-4' : 'grid-2';
      choices = q.choices.map((c, i) => `<button class="tile tile-arrow" data-answer="${i}" aria-label="${ARROW_NAME[c]}" ${disabled(i)}>${arrow(c, 46, '#ffe08a')}</button>`).join('');
      break;
    }
    case 'stroop': {
      prompt = '글자의 <b>색깔</b>은?';
      stage = `<div class="stroop-word" style="color:${q.ink}">${esc(q.word)}</div>`;
      layout = q.choices.length > 4 ? 'grid-3' : 'grid-2';
      choices = q.choices.map((c, i) => `<button class="tile tile-color" data-answer="${i}" ${disabled(i)}><i class="swatch" style="--sw:${q.colors[i]}"></i><span style="color:${q.labelColors?.[i] ?? STROOP_INK}">${esc(c)}</span></button>`).join('');
      break;
    }
    case 'calc': {
      prompt = '답을 입력하세요';
      // 몇 자리인지 알려주지 않는다. 다음 문제는 아래에 흐리게 미리 보여준다.
      const typed = selected.map((i) => q.choices[i]).join('');
      stage = `<div class="calc-q"><div class="calc-line"><b>${esc(q.prompt)}</b><span class="calc-answer ${typed ? '' : 'is-empty'}">${esc(typed || '0')}</span></div>${next ? `<span class="calc-next">다음 · ${esc(next)}</span>` : ''}</div>`;
      layout = 'grid-3 numpad-grid';
      choices = q.choices.map((c, i) => `<button class="tile tile-num ${c === '0' ? 'is-zero' : ''}" data-answer="${i}" ${preview ? 'disabled' : ''}>${c}</button>`).join('')
        + '<button id="brain-backspace" class="tile tile-num is-back" type="button" aria-label="지우기">⌫</button>';
      break;
    }
    case 'largest': {
      prompt = '<b>값</b>이 가장 큰 숫자는?';
      layout = 'grid-2';
      choices = q.choices.map((c, i) => `<button class="tile tile-number" data-answer="${i}" style="--fs:${q.sizes[i]}px" ${disabled(i)}>${esc(c)}</button>`).join('');
      break;
    }
    case 'balloons': {
      prompt = '작은 수부터 차례로 펑!';
      layout = 'balloon-field';
      choices = q.choices.map((c, i) => {
        // 방금 누른 풍선만 펑 터지는 모션, 0.35초가 지나면 완전히 사라진다(fresh=false).
        const state = picked(i) ? (selected.at(-1) === i && fresh ? 'is-popping' : 'is-gone') : '';
        return `<button class="balloon ${state}" data-answer="${i}" style="--c:${BALLOON_COLORS[i % BALLOON_COLORS.length]};--d:${drift(time, i, 4.2)}" ${disabled(i)}><span>${esc(c)}</span></button>`;
      }).join('');
      break;
    }
    case 'memory':
    case 'sequence': {
      prompt = preview ? (game === 'memory' ? '숫자 위치를 기억하세요!' : '켜지는 순서를 기억하세요!') : (game === 'memory' ? '작은 숫자가 있던 칸부터 톡!' : '켜졌던 순서대로 톡!');
      layout = `memory-board size-${q.size ?? 3}`;
      choices = q.choices.map((c, i) => {
        const shown = preview && game === 'memory' && c;
        const isLit = preview && game === 'sequence' && q.answer[lit] === i;
        const order = selected.indexOf(i);
        return `<button class="tile tile-memory ${isLit ? 'is-lit' : ''} ${shown ? 'is-shown' : ''} ${order >= 0 ? 'is-done' : ''}" data-answer="${i}" aria-label="${i + 1}번 칸" ${disabled(i)}>${shown ? esc(c) : order >= 0 ? order + 1 : ''}</button>`;
      }).join('');
      break;
    }
    case 'blocks': {
      prompt = '조각을 눌러 없애고 목표 모양을 만드세요';
      stage = `<div class="goal-box"><span class="goal-label">목표</span>${heightGrid(q.target, q.height)}</div>`;
      layout = 'tetris-board';
      // 열마다 남은 칸을 아래로 모은다(위 블록이 떨어짐).
      const columns = Array.from({ length: q.width }, (_, c) => Array.from({ length: q.height }, (_, row) => q.owner[row * q.width + c]).filter((o) => o >= 0 && !picked(o)));
      const cells = [];
      for (let row = q.height - 1; row >= 0; row--) for (let c = 0; c < q.width; c++) {
        const o = columns[c][row];
        cells.push(o === undefined ? '<span class="tetris-cell is-empty"></span>' : `<button class="tetris-cell" data-answer="${o}" style="--c:${PIECE_COLORS[o % PIECE_COLORS.length]}" aria-label="조각 ${o + 1}" ${preview ? 'disabled' : ''}></button>`);
      }
      choices = cells.join('');
      layout += `" style="--w:${q.width}`;
      break;
    }
    case 'balance': {
      prompt = '가장 무거운 것은?';
      prompt = q.ask === 'light' ? '가장 <b>가벼운</b> 것은?' : '가장 <b>무거운</b> 것은?';
      const relations = q.relations ?? q.prompt.split(/\s{2,}/).filter(Boolean).map((x) => { const [light, heavy] = x.split('<').map((t) => t.trim()); return { light, heavy }; });
      stage = `<div class="seesaw-row">${relations.map(seesaw).join('')}</div><p class="stage-note">내려간 쪽이 더 무거워요</p>`;
      layout = q.choices.length < 4 ? `choices-${q.choices.length}` : 'grid-4';
      choices = q.choices.map((c, i) => `<button class="tile tile-shape" data-answer="${i}" aria-label="${SHAPE_NAME[c]}" ${disabled(i)}>${shape(c, 48)}</button>`).join('');
      break;
    }
    case 'ladder': {
      prompt = `<b>${q.start + 1}번</b>에서 출발해 <b>${q.end + 1}번</b>에 도착하려면 ? 칸에 어떤 선?`;
      stage = ladder(q);
      layout = 'grid-3';
      choices = q.choices.map((c, i) => `<button class="tile tile-ladder" data-answer="${i}" aria-label="${esc(c)}" ${disabled(i)}>${ladderChoice(i)}<small>${esc(c)}</small></button>`).join('');
      break;
    }
    case 'hammer': {
      const left = q.numbers.filter((_, i) => !picked(i)).reduce((a, b) => a + b, 0);
      prompt = `필요 없는 블록을 부숴 합을 <b>${q.targetSum}</b>(으)로!`;
      stage = `<div class="sum-meter"><span>남은 합</span><b class="${left === q.targetSum ? 'is-match' : ''}">${left}</b><span>목표 ${q.targetSum}</span></div>`;
      // 숫자 블록을 쌓은 탑. 부순 블록은 빠지고 위 블록이 내려앉는다.
      layout = 'hammer-tower';
      // 방금 부순 블록은 그 높이에서 망치가 '깡!' 내려치고 두 조각으로 쪼개지며 사라진다.
      choices = q.numbers.map((n, i) => {
        const c = PIECE_COLORS[i % PIECE_COLORS.length];
        if (picked(i)) return selected.at(-1) === i && fresh
          ? `<div class="tower-block is-breaking" style="--c:${c}" aria-hidden="true"><i class="shard l">${n}</i><i class="shard r"></i><span class="hammer-hit"><i>🔨</i><b>깡!</b></span></div>`
          : '';
        return `<button class="tower-block" data-answer="${i}" style="--c:${c}" aria-label="${n} 블록 부수기" ${disabled(i)}>${n}</button>`;
      }).join('');
      break;
    }
    case 'pieces': {
      prompt = '주어진 조각과 합쳐 목표를 완성할 조각은?';
      stage = `<div class="piece-row"><div class="goal-box"><span class="goal-label">목표</span>${miniGrid(q.target, 'is-goal')}</div><span class="plus">=</span><div class="goal-box"><span class="goal-label">가진 조각</span>${miniGrid(q.given, 'is-given')}</div><span class="plus">+</span><div class="goal-box is-ask"><span class="goal-label">?</span></div></div>`;
      layout = 'grid-4';
      choices = q.patterns.map((p, i) => `<button class="tile tile-piece" data-answer="${i}" aria-label="조각 ${i + 1}" ${disabled(i)}>${miniGrid(p)}</button>`).join('');
      break;
    }
    case 'rail': {
      prompt = '? 칸에 들어갈 선로는?';
      stage = railBoard(q);
      layout = 'grid-3';
      choices = q.choices.map((c, i) => `<button class="tile tile-rail" data-answer="${i}" aria-label="${RAIL_NAME[c]}" ${disabled(i)}>${railTile(c, 52)}</button>`).join('');
      break;
    }
    case 'view': {
      prompt = `<b>${q.direction ? '오른쪽' : '앞'}</b>에서 보면 어떤 모양?`;
      stage = towers(q.heights, q.direction);
      layout = 'grid-4';
      choices = q.projections.map((p, i) => `<button class="tile tile-view" data-answer="${i}" aria-label="모양 ${i + 1}" ${disabled(i)}>${projection(p)}</button>`).join('');
      break;
    }
    default:
      choices = q.choices.map((c, i) => `<button class="tile" data-answer="${i}" ${disabled(i)}>${esc(c)}</button>`).join('');
  }

  const confirm = ['sum', 'remove', 'tetris'].includes(q.type)
    ? `<div class="confirm-row"><button id="brain-reset" class="btn btn-ghost" type="button">되돌리기</button><button id="brain-confirm" class="btn btn-go" type="button">완성!</button></div>`
    : '';
  return `<p class="q-prompt">${prompt}</p>${stage ? `<div class="q-stage">${stage}</div>` : ''}${preview && q.type === 'memory' ? '<p class="remember-label">기억하세요…</p>' : ''}<div class="choices ${layout}">${choices}</div>${confirm}`;
}
