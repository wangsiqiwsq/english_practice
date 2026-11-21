/* =========================================================
   单词测试
   ========================================================= */
const VSTORE = 'vocab.state';
const VLS = {
  get(k, d){ try{ const v = localStorage.getItem('en.'+k); return v ? JSON.parse(v) : d; }catch(e){ return d; } },
  set(k, v){ try{ localStorage.setItem('en.'+k, JSON.stringify(v)); }catch(e){} }
};
let vState = VLS.get(VSTORE, {});   // word -> { lv: 0未学/1模糊/2掌握, right, wrong, last }

function vMeta(w){
  if(!vState[w]) vState[w] = {lv:0, right:0, wrong:0, last:0};
  return vState[w];
}
function vSave(){ VLS.set(VSTORE, vState); renderVStats(); }
function vShuffle(a){
  const x = a.slice();
  for(let i=x.length-1;i>0;i--){ const j = Math.floor(Math.random()*(i+1)); [x[i],x[j]]=[x[j],x[i]]; }
  return x;
}
function renderVStats(){
  const total = VOCAB.length;
  let known=0, fuzzy=0, un=0, r=0, w=0;
  VOCAB.forEach(v => {
    const st = vState[v[0]];
    if(!st){ un++; return; }
    if(st.lv === 2) known++;
    else if(st.lv === 1) fuzzy++;
    else un++;
    r += st.right || 0;
    w += st.wrong || 0;
  });
  const set = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = val; };
  set('vTotal', total);
  set('vKnown', known);
  set('vFuzzy', fuzzy);
  set('vNew', un);
  set('vAcc', (r + w) ? Math.round(r / (r + w) * 100) + '%' : '—');
  const prog = document.getElementById('vProg');
  if(prog) prog.style.width = Math.round((total - un) / total * 100) + '%';
  const progTxt = document.getElementById('vProgTxt');
  if(progTxt) progTxt.textContent = (total - un) + ' / ' + total;
}

let vMode = 'en2zh', vScope = 'mix';
function setSeg(segId, attr, val){
  document.querySelectorAll('#' + segId + ' button').forEach(b => b.classList.toggle('on', b.dataset[attr] === val));
}
document.addEventListener('click', e => {
  const b = e.target.closest('#modeSeg button, #scopeSeg button');
  if(!b) return;
  if(b.dataset.mode){ vMode = b.dataset.mode; setSeg('modeSeg','mode',vMode); }
  if(b.dataset.scope){ vScope = b.dataset.scope; setSeg('scopeSeg','scope',vScope); }
});

function pickWords(n){
  const pool = [];
  VOCAB.forEach(w => {
    const st = vState[w[0]] || {lv:0, wrong:0};
    if(vScope === 'new' && st.lv >= 1) return;
    if(vScope === 'wrong' && !(st.wrong > 0 && st.lv < 2)) return;
    pool.push(w);
  });
  if(pool.length < n){
    // 不够就放宽：先补模糊词，再补未学词
    VOCAB.forEach(w => {
      if(pool.some(p => p[0] === w[0])) return;
      const st = vState[w[0]] || {lv:0, wrong:0};
      if(st.lv === 1 || st.wrong > 0) pool.push(w);
    });
    VOCAB.forEach(w => {
      if(pool.length >= n * 3) return;
      if(pool.some(p => p[0] === w[0])) return;
      if((vState[w[0]] || {}).lv === 2) return;
      pool.push(w);
    });
  }
  // 优先没掌握的
  const rank = w => {
    const st = vState[w[0]] || {lv:0, wrong:0};
    return (st.lv === 2 ? 2 : st.lv === 1 ? 0 : 1) + (st.wrong > 0 ? 0 : 0.5) + Math.random();
  };
  pool.sort((a,b) => rank(a) - rank(b));
  return pool.slice(0, n);
}

let quiz = null;   // {list, i, right, wrong[], mode}

function startQuiz(n){
  n = n || 20;
  const list = pickWords(n);
  if(!list.length){
    document.getElementById('vocabStage').innerHTML =
      '<div class="card"><p style="margin:0">这个范围里没有可考的单词了。换成「智能混合」试试。</p></div>';
    return;
  }
  quiz = {list, i:0, right:0, wrong:[], mode:vMode, answered:false};
  vRenderQ();
}

function vSpeak(word, rate){
  if(!('speechSynthesis' in window)) return;
  try{ speechSynthesis.cancel(); }catch(e){}
  const u = new SpeechSynthesisUtterance(word);
  u.lang = 'en-US';
  u.rate = rate || 0.85;
  const vs = speechSynthesis.getVoices();
  const en = vs.find(v => /en-US/i.test(v.lang) && /zira|aria|jenny|guy/i.test(v.name))
          || vs.find(v => /en-US/i.test(v.lang)) || vs.find(v => /^en/i.test(v.lang));
  if(en) u.voice = en;
  speechSynthesis.speak(u);
}

function vRenderQ(){
  const stage = document.getElementById('vocabStage');
  if(!stage || !quiz) return;
  if(quiz.i >= quiz.list.length){ vRenderResult(); return; }

  const item = quiz.list[quiz.i];
  const [word, pos, zh, hint] = item;
  quiz.answered = false;

  // 干扰项：排除"中文释义与本词相同/相近"的词，避免出现两个正确答案
  const core = s => String(s).split(/[；;、，,\/]/)[0].trim();
  const same = v => core(v[2]) === core(zh);
  const others = VOCAB.filter(v => v[0] !== word && !same(v));
  const options = vShuffle(others).slice(0, 3);

  let body = '';
  if(quiz.mode === 'en2zh'){
    body = `<div class="q-word">${word}</div>
            <div class="q-hint">${pos} <span style="opacity:.6">· 选它的中文意思</span>
              <button class="btn small ghost" style="margin-left:8px;min-height:0;padding:3px 9px" onclick="vSpeak('${word}')">🔊 读</button>
            </div>
            <div class="opts">
              ${vShuffle([{a:zh, ok:true}, ...options.map(o => ({a:o[2], ok:false}))])
                .map((o,k) => `<button class="opt" data-ok="${o.ok}" onclick="vAnswer(this, ${o.ok})">${o.a}</button>`).join('')}
            </div>`;
  } else if(quiz.mode === 'zh2en'){
    body = `<div class="q-word" style="font-size:26px">${zh}</div>
            <div class="q-hint">选对应的英文单词</div>
            <div class="opts">
              ${vShuffle([{a:word, ok:true}, ...options.map(o => ({a:o[0], ok:false}))])
                .map(o => `<button class="opt" data-ok="${o.ok}" onclick="vAnswer(this, ${o.ok})">${o.a}</button>`).join('')}
            </div>`;
  } else {
    // 听音辨词：只给声音和中文，让耳朵认
    body = `<div class="q-word" style="font-size:22px;color:var(--ink-3)">🔊 听发音</div>
            <div class="q-hint">
              <button class="btn small" style="min-height:0;padding:8px 16px" onclick="vSpeak('${word}')">再读一遍</button>
              <button class="btn small ghost" style="min-height:0;padding:8px 14px" onclick="vSpeak('${word}',0.6)">慢速</button>
            </div>
            <div class="q-hint" style="margin-top:12px">${zh} · ${pos} —— 听出是哪个词了吗？</div>
            <div class="opts">
              ${vShuffle([{a:word, ok:true}, ...options.map(o => ({a:o[0], ok:false}))])
                .map(o => `<button class="opt" data-ok="${o.ok}" onclick="vAnswer(this, ${o.ok})" style="text-align:center;font-size:17px;letter-spacing:.3px">${o.a}</button>`).join('')}
            </div>`;
    setTimeout(() => vSpeak(word), 250);
  }

  const pct = Math.round(quiz.i / quiz.list.length * 100);
  stage.innerHTML = `
    <div class="card" style="padding:20px">
      <div class="q-meta">
        <span>第 ${quiz.i+1} / ${quiz.list.length} 题</span>
        <span>✓ ${quiz.right} ｜ ✗ ${quiz.wrong.length}</span>
      </div>
      <div class="q-bar"><i style="width:${pct}%"></i></div>
      <div class="q-card">${body}</div>
    </div>`;
}

function vAnswer(btn, ok){
  if(!quiz || quiz.answered) return;
  quiz.answered = true;
  const item = quiz.list[quiz.i];
  const word = item[0];
  const st = vMeta(word);

  document.querySelectorAll('#vocabStage .opt').forEach(b => {
    b.disabled = true;
    if(b.dataset.ok === 'true') b.classList.add('right');
  });
  if(!ok) btn.classList.add('wrong');

  if(ok){
    quiz.right++;
    st.right = (st.right || 0) + 1;
    st.lv = Math.min(2, (st.lv || 0) + 1);
    if(st.lv >= 2) st.wrong = 0;
  } else {
    quiz.wrong.push(item);
    st.wrong = (st.wrong || 0) + 1;
    st.lv = 0;
  }
  st.last = Date.now();
  vSave();

  const fb = document.createElement('div');
  fb.className = 'q-feedback ' + (ok ? 'ok' : 'no');
  fb.innerHTML = ok
    ? `<b>对</b>　${word} ${item[1]} ${item[2]}<br><span style="opacity:.75">${item[3]}</span>`
    : `<b>错</b>　正确答案：${word} ${item[1]} ${item[2]}<br><span style="opacity:.75">${item[3]}</span>`;
  document.querySelector('#vocabStage .q-card').appendChild(fb);

  const row = document.createElement('div');
  row.className = 'btn-row';
  row.style.cssText = 'margin-top:14px;justify-content:flex-end';
  row.innerHTML = `<button class="btn" onclick="vNext()">${quiz.i+1 >= quiz.list.length ? '看结果' : '下一题'}</button>`;
  document.querySelector('#vocabStage .card').appendChild(row);
}

function vNext(){
  if(!quiz) return;
  quiz.i++;
  vRenderQ();
}

function vRenderResult(){
  const total = quiz.list.length;
  const acc = Math.round(quiz.right / total * 100);
  const stage = document.getElementById('vocabStage');
  let html = `<div class="card">
    <h3 style="margin-top:0">这一轮：${quiz.right} / ${total}（${acc}%）</h3>
    <p class="small muted" style="margin-top:0">
      ${acc >= 90 ? '很稳。这一轮可以过，明天继续新的。' :
        acc >= 70 ? '正常水平。错题已经进错题本，明天「智能混合」会优先抽到它们。' :
        '这一轮偏难。建议明天先用「只考错题」把这批过一遍，再往下走。'}
    </p>`;
  if(quiz.wrong.length){
    html += `<h3>这轮错的 ${quiz.wrong.length} 个</h3>`;
    html += quiz.wrong.map(v => `
      <div class="result-line">
        <span class="w">${v[0]}</span>
        <span class="m">${v[1]} ${v[2]}　<span style="opacity:.7">${v[3]}</span></span>
      </div>`).join('');
    html += `<div class="btn-row" style="margin-top:14px">
      <button class="btn ghost" onclick="startQuiz(${quiz.wrong.length})">再考这批错词</button>
      <button class="btn" onclick="startQuiz()">再来 20 词</button>
    </div>`;
  } else {
    html += `<div class="btn-row" style="margin-top:14px">
      <button class="btn" onclick="startQuiz()">再来 20 词</button>
      <button class="btn ghost" onclick="browseMode()">看词表</button>
    </div>`;
  }
  html += `</div>`;
  stage.innerHTML = html;
  renderVStats();
}

/* ---------- 词表浏览 ---------- */
function browseMode(){
  const stage = document.getElementById('vocabStage');
  if(!stage) return;
  const groups = {};
  VOCAB.forEach(v => {
    const k = v[0][0].toUpperCase();
    (groups[k] = groups[k] || []).push(v);
  });
  let html = `<div class="card">
    <div class="btn-row" style="margin-bottom:12px">
      <button class="btn small" onclick="startQuiz()">开始测试</button>
      <span class="muted small" style="align-self:center">点单词旁的 🔈 可以听发音</span>
    </div>`;
  Object.keys(groups).sort().forEach(k => {
    html += `<h3 style="margin-top:16px">${k}</h3>`;
    groups[k].forEach(v => {
      const st = vState[v[0]] || {lv:0};
      const dot = st.lv === 2 ? '#2f6f4f' : st.lv === 1 ? '#b8762a' : '#dcd6c8';
      html += `<div class="result-line">
        <span class="w" style="min-width:110px">
          <i style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${dot};margin-right:7px;vertical-align:middle"></i>${v[0]}
        </span>
        <span style="flex:1;color:var(--ink-2)">${v[1]} ${v[2]}</span>
        <button class="btn small ghost" style="min-height:0;padding:2px 8px" onclick="vSpeak('${v[0]}')">🔈</button>
      </div>`;
    });
  });
  html += `</div>`;
  stage.innerHTML = html;
}

/* 初始化：等 DOM 就绪，避免和主脚本的执行顺序打架 */
// 挂到主脚本的 go() 上：每次进入单词页都刷新数据
window.renderVStats = renderVStats;
