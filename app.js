// ===============================
// Program 7 / Google Sheet settings
// ===============================
const PROGRAM_INFO = { id: "program7", label: "Program 7" };
const GOOGLE_SHEET = {
  sheetId: "1ykUNCaW85aocpHL4MMW3GlEUIOJ_7OJwhedMMX0tzzM",
  sheetName: "Program7",
};

// ===============================
// Keys (Program別)
// ===============================
const PROGRESS_KEY = `ewp_progress_${PROGRAM_INFO.id}`;
const MASTER_STREAK = 3;
const QUIZ_COOLDOWN_MS = 60 * 1000; // 1分

// ===============================
// DOM
// ===============================
const programLabelEl = document.getElementById("programLabel");
const screenTitleEl = document.getElementById("screenTitle");
const programProgressEl = document.getElementById("programProgress");
const counterEl = document.getElementById("counter");

const homeView = document.getElementById("homeView");
const partCardsEl = document.getElementById("partCards");

// 先生用UI（残っていても常に隠す）
const importWrapEl = document.getElementById("importWrap");
const adminModalEl = document.getElementById("adminModal");

const studyView = document.getElementById("studyView");
const tabsEl = document.getElementById("tabs");
const panelsEl = document.getElementById("panels");
const bottomNavEl = document.getElementById("bottomNav");
const backHomeBtn = document.getElementById("backHomeBtn");

const textNavWrap = document.getElementById("textNavWrap");
const textParagraphEl = document.getElementById("textParagraph");

const sentenceEl = document.getElementById("sentence");
const translationEl = document.getElementById("translation");
const toggleTranslationBtn = document.getElementById("toggleTranslation");
const masteredBadgeEl = document.getElementById("masteredBadge");

const chunksEl = document.getElementById("chunks");
const chunkMeaningEl = document.getElementById("chunkMeaning");

// TTS controls now inside structure panel
const speedNormalBtn = document.getElementById("speedNormal");
const speedSlowBtn = document.getElementById("speedSlow");
const stopEnglishBtn = document.getElementById("stopEnglishBtn");
const ttsStatusEl = document.getElementById("ttsStatus");

const quizTranslationEl = document.getElementById("quizTranslation");
const pool = document.getElementById("pool");
const answer = document.getElementById("answer");
const feedback = document.getElementById("feedback");

const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const resetQuizBtn = document.getElementById("resetQuizBtn");
const checkBtn = document.getElementById("checkBtn");

// Summary
const summaryTitleEl = document.getElementById("summaryTitle");
const summaryStatsEl = document.getElementById("summaryStats");
const summaryListEl = document.getElementById("summaryList");
const filterAllBtn = document.getElementById("filterAllBtn");
const filterWrongBtn = document.getElementById("filterWrongBtn");
const filterNotMasteredBtn = document.getElementById("filterNotMasteredBtn");
const resetProgressBtn = document.getElementById("resetProgressBtn");

// quiz tab element
const quizTabBtn = document.querySelector('.tab[data-tab="quiz"]');

// ===============================
// State + Program
// ===============================
let PROGRAM = {
  programId: PROGRAM_INFO.id,
  programLabel: PROGRAM_INFO.label,
  parts: []
};

const state = {
  currentPartId: null,
  index: 0,

  streakById: {},
  masteredIds: new Set(),
  wrongCountById: {},

  summaryFilter: "all",
  ttsRate: 1.0,
  currentTab: "structure",

  quizAttemptLocked: false,
  quizCooldownById: {},

  quizCheckedForId: null
};

// ===============================
// Storage helpers
// ===============================
function safeParseJSON(str){ try { return JSON.parse(str); } catch { return null; } }

function loadProgress(){
  const raw = localStorage.getItem(PROGRESS_KEY);
  if(!raw) return;
  const d = safeParseJSON(raw);
  if(!d) return;

  state.currentPartId = (typeof d.currentPartId === "string") ? d.currentPartId : null;
  state.index = Number.isInteger(d.index) ? d.index : 0;

  state.streakById = (d.streakById && typeof d.streakById === "object") ? d.streakById : {};
  state.masteredIds = new Set(Array.isArray(d.masteredIds) ? d.masteredIds : []);
  state.wrongCountById = (d.wrongCountById && typeof d.wrongCountById === "object") ? d.wrongCountById : {};

  state.summaryFilter = (typeof d.summaryFilter === "string") ? d.summaryFilter : "all";
  state.ttsRate = (typeof d.ttsRate === "number") ? d.ttsRate : 1.0;
  state.currentTab = (typeof d.currentTab === "string") ? d.currentTab : "structure";

  state.quizAttemptLocked = !!d.quizAttemptLocked;
  state.quizCooldownById = (d.quizCooldownById && typeof d.quizCooldownById === "object") ? d.quizCooldownById : {};
  state.quizCheckedForId = (typeof d.quizCheckedForId === "string") ? d.quizCheckedForId : null;
}

function saveProgress(){
  localStorage.setItem(PROGRESS_KEY, JSON.stringify({
    currentPartId: state.currentPartId,
    index: state.index,
    streakById: state.streakById,
    masteredIds: [...state.masteredIds],
    wrongCountById: state.wrongCountById,
    summaryFilter: state.summaryFilter,
    ttsRate: state.ttsRate,
    currentTab: state.currentTab,

    quizAttemptLocked: state.quizAttemptLocked,
    quizCooldownById: state.quizCooldownById,
    quizCheckedForId: state.quizCheckedForId
  }));
}

// ===============================
// Google Sheet loading (CSV)
// ===============================
function sheetCsvUrl(){
  return `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET.sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(GOOGLE_SHEET.sheetName)}`;
}

function parseCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (c === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += c;
    }
  }
  result.push(current);
  return result.map(s => s.trim());
}

async function loadDatasetFromGoogleSheet(){
  const url = sheetCsvUrl() + `&v=${Date.now()}`;
  const res = await fetch(url, { cache: "no-store" });
  if(!res.ok) throw new Error("Failed to fetch sheet: " + res.status);

  const csvText = await res.text();
  const lines = csvText.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
  if(lines.length <= 1) return "";

  const dataLines = lines.slice(1);

  const tsv = dataLines.map(line=>{
    const cols = parseCSVLine(line);
    const part = (cols[0] || "").trim();
    const eng  = (cols[1] || "").trim();
    const jpn  = (cols[2] || "").trim();
    const ch   = (cols[3] || "").trim();
    if(!part || !eng || !jpn) return "";
    return `${part}\t${eng}\t${jpn}${ch ? `\t${ch}` : ""}`;
  }).filter(Boolean).join("\n");

  return tsv;
}

// ===============================
// Parsing dataset
// ===============================
function splitLine(line){
  if(line.includes("\t")) return line.split("\t");
  return line.split(",").map(s => s.trim());
}

function parseChunksCell(cell){
  const chunks = [];
  if(!cell) return chunks;
  const parts = cell.split("|").map(s => s.trim()).filter(Boolean);
  for(const p of parts){
    const [t, m] = p.split("::");
    const text = (t || "").trim();
    const meaning = (m || "").trim();
    if(text) chunks.push({ text, meaning });
  }
  return chunks;
}

function normalizeSentenceId(partNo, idx){
  return `p7-${partNo}-s${idx+1}`;
}

// ===============================
// Auto chunking (簡易)
// ===============================
const WH = new Set(["what","where","when","who","why","how"]);
const AUX = new Set(["do","does","did","can","could","will","would","shall","should","may","might","must","is","am","are","was","were","have","has","had"]);
const PREP = new Set(["to","in","on","at","from","with","for","after","before","during","over","under","into","onto","about","around","through","between","without","by","as"]);
const BE = new Set(["am","is","are","was","were"]);

function tokenize(text){
  return text
    .replace(/[“”"]/g,"")
    .replace(/([?.!,])/g," $1 ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}
function detokenize(tokens){
  return tokens.join(" ").replace(/\s+([?.!,])/g, "$1");
}
function isPunct(t){ return ["?","!","."].includes(t); }

function looksLikeVerb(w){
  const wl = (w||"").toLowerCase();
  if(!wl) return false;
  if(wl.endsWith("ed") || wl.endsWith("ing")) return true;
  if(AUX.has(wl)) return true;
  if(["go","goes","went","enjoy","enjoys","play","plays","study","studies","like","likes","want","wants","make","makes","take","takes","see","sees","have","has","had","get","gets","got","know","knows","knew","buy","buys","bought","use","uses","used"].includes(wl)) return true;
  return false;
}

function consumeHowTo(tokens){
  if(tokens.length >= 3 && tokens[0].toLowerCase()==="how" && tokens[1].toLowerCase()==="to" && looksLikeVerb(tokens[2])){
    return { text: detokenize(tokens.slice(0,3)), consumed: 3 };
  }
  return null;
}

function findVerbIndex(tokens){
  for(let i=0;i<tokens.length;i++){
    if(looksLikeVerb(tokens[i])) return i;
  }
  return Math.min(1, tokens.length);
}

function autoChunksFromEnglish(english){
  let tokens = tokenize(english);
  let endPunct = "";
  if(tokens.length && isPunct(tokens[tokens.length-1])){
    endPunct = tokens.pop();
  }

  const chunks = [];

  if(tokens.length && WH.has(tokens[0].toLowerCase())){
    const ht = consumeHowTo(tokens);
    if(ht){
      chunks.push({ text: ht.text, type:"m", meaning:"" });
      tokens = tokens.slice(ht.consumed);
    }else{
      chunks.push({ text: tokens[0], type:"m", meaning:"" });
      tokens = tokens.slice(1);
    }
  }

  if(tokens.length && AUX.has(tokens[0].toLowerCase())){
    chunks.push({ text: tokens[0], type:"m", meaning:"" });
    tokens = tokens.slice(1);
  }

  const vIdx = findVerbIndex(tokens);
  const subj = tokens.slice(0, Math.max(0, vIdx));
  tokens = tokens.slice(Math.max(0, vIdx));
  if(subj.length){
    chunks.push({ text: detokenize(subj), type:"s", meaning:"" });
  }

  if(tokens.length){
    let verbTokens = [];
    const first = tokens[0].toLowerCase();

    if(["don't","doesn't","didn't","cannot","can't","won't","wouldn't","shouldn't","isn't","aren't","wasn't","weren't","haven't","hasn't","hadn't"].includes(first)){
      verbTokens.push(tokens[0]);
      tokens = tokens.slice(1);
      if(tokens.length && looksLikeVerb(tokens[0])){
        verbTokens.push(tokens[0]);
        tokens = tokens.slice(1);
      }
    } else {
      verbTokens.push(tokens[0]);
      tokens = tokens.slice(1);

      if(tokens.length && tokens[0].toLowerCase()==="not"){
        verbTokens.push(tokens[0]);
        tokens = tokens.slice(1);
      }

      if(verbTokens.length && (AUX.has(verbTokens[0].toLowerCase()) || BE.has(verbTokens[0].toLowerCase()))){
        if(tokens.length && looksLikeVerb(tokens[0])){
          verbTokens.push(tokens[0]);
          tokens = tokens.slice(1);
        }
      }
    }

    chunks.push({ text: detokenize(verbTokens), type:"v", meaning:"" });
  }

  const out = [];
  let buf = [];
  const flushBuf = ()=>{ if(buf.length){ out.push(detokenize(buf)); buf=[]; } };

  for(let i=0;i<tokens.length;i++){
    const w = tokens[i];
    const wl = w.toLowerCase();

    if(wl === "the" && tokens[i+1] && tokens[i+1].toLowerCase() === "best"){
      flushBuf();
      out.push("the best");
      i += 1;
      continue;
    }

    if(wl === "than"){
      flushBuf();
      let j = i+1;
      for(; j<tokens.length; j++){
        const w2 = tokens[j].toLowerCase();
        if(PREP.has(w2)) break;
        if(w2 === "and" || w2 === "but") break;
      }
      out.push(detokenize(tokens.slice(i, j)));
      i = j-1;
      continue;
    }

    if(wl === "to" && tokens[i+1] && looksLikeVerb(tokens[i+1])){
      flushBuf();
      let j = i+2;
      for(; j<tokens.length; j++){
        const w2 = tokens[j].toLowerCase();
        if(PREP.has(w2)) break;
        if(w2 === "and" || w2 === "but") break;
      }
      out.push(detokenize(tokens.slice(i, j)));
      i = j-1;
      continue;
    }

    if(PREP.has(wl)){
      flushBuf();
      buf.push(w);
      continue;
    }

    buf.push(w);
  }
  flushBuf();

  out.forEach(t => chunks.push({ text:t, type:"m", meaning:"" }));

  if(endPunct && chunks.length){
    chunks[chunks.length-1].text = chunks[chunks.length-1].text + endPunct;
  }

  return chunks;
}

function tokensForQuiz(english){
  return tokenize(english).filter(t => !isPunct(t));
}

// ===============================
// Build PROGRAM from dataset text
// ===============================
function buildProgramFromText(text){
  const lines = text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  const byPart = new Map();

  for(const line of lines){
    const cols = splitLine(line);
    const partRaw = (cols[0] || "").trim();
    const eng = (cols[1] || "").trim();
    const jpn = (cols[2] || "").trim();
    const chunkCell = (cols[3] || "").trim();
    if(!partRaw || !eng || !jpn) continue;

    const partNo = String(partRaw).replace(/^Part\s*/i,"").trim();
    const key = `${PROGRAM_INFO.id}-part${partNo}`;

    if(!byPart.has(key)){
      byPart.set(key, {
        partId: key,
        partLabel: `Part ${partNo}`,
        paragraphBreaks: [0],
        items: []
      });
    }

    const manualChunks = parseChunksCell(chunkCell);
    const chunks = manualChunks.length
      ? manualChunks.map((c, idx)=>({
          text: c.text,
          type: idx===0 ? "s" : (idx===1 ? "v" : "m"),
          meaning: c.meaning || ""
        }))
      : autoChunksFromEnglish(eng);

    byPart.get(key).items.push({
      id: "",
      text: eng,
      translation: jpn,
      chunks,
      reorderTokens: tokensForQuiz(eng)
    });
  }

  const parts = [...byPart.values()].sort((a,b)=>{
    const na = parseInt(a.partLabel.replace("Part","").trim(),10);
    const nb = parseInt(b.partLabel.replace("Part","").trim(),10);
    return (na||0)-(nb||0);
  });

  parts.forEach(part=>{
    part.items.forEach((it, idx)=>{
      const no = part.partLabel.replace("Part","").trim();
      it.id = normalizeSentenceId(no, idx);
    });
  });

  return { programId: PROGRAM_INFO.id, programLabel: PROGRAM_INFO.label, parts };
}

// ===============================
// App helpers
// ===============================
function getPart(partId){ return PROGRAM.parts.find(p => p.partId === partId) || null; }
function getCurrentPart(){ return getPart(state.currentPartId); }
function getItems(){ return getCurrentPart()?.items || []; }
function getItem(){ return getItems()[state.index] || null; }
function clampIndex(){
  const items = getItems();
  if(items.length === 0){ state.index = 0; return; }
  state.index = Math.max(0, Math.min(items.length - 1, state.index));
}
function isMastered(id){ return state.masteredIds.has(id); }
function getStreak(id){ return Number.isInteger(state.streakById[id]) ? state.streakById[id] : 0; }
function getWrong(id){ return Number.isInteger(state.wrongCountById[id]) ? state.wrongCountById[id] : 0; }
function shuffle(arr){ return [...arr].sort(()=>Math.random()-0.5); }

// ===============================
// Cooldown helpers
// ===============================
function setCooldown(it){
  state.quizCooldownById[it.id] = Date.now() + QUIZ_COOLDOWN_MS;
  saveProgress();
}
function isOnCooldown(it){
  const until = state.quizCooldownById[it.id];
  return typeof until === "number" && Date.now() < until;
}
function cooldownRemainSec(it){
  const until = state.quizCooldownById[it.id];
  if(typeof until !== "number") return 0;
  return Math.max(0, Math.ceil((until - Date.now()) / 1000));
}

// ===============================
// Quiz tab availability (current sentence only)
// ===============================
function getQuizBlockReasonForCurrent(){
  const it = getItem();
  if(!it) return { blocked: true, message: "文がありません。" };

  if(isOnCooldown(it)){
    const sec = cooldownRemainSec(it);
    return { blocked: true, message: `この文はクールダウン中です。${sec}秒後にチェックできます。` };
  }
  return { blocked: false, message: "" };
}

function updateQuizTabAvailability(){
  if(!quizTabBtn) return;
  if(state.quizAttemptLocked) return; // ロック中は触らない
  const { blocked } = getQuizBlockReasonForCurrent();
  quizTabBtn.disabled = blocked;
  quizTabBtn.classList.toggle("disabled", blocked);
}

// ===============================
// Progress
// ===============================
function partMasteredCount(part){
  return part.items.reduce((acc, it) => acc + (state.masteredIds.has(it.id) ? 1 : 0), 0);
}
function updateHeaderProgressStudy(){
  const part = getCurrentPart();
  if(!part){ programProgressEl.textContent = "達成率：0%"; return; }

  const mastered = partMasteredCount(part);
  const total = part.items.length || 1;
  const pct = Math.round((mastered / total) * 100);

  programLabelEl.textContent = PROGRAM.programLabel;
  screenTitleEl.textContent = `${part.partLabel}`;
  programProgressEl.textContent = `達成率：${pct}%（Mastered ${mastered}/${part.items.length}）`;
}
function updateHeaderProgressHome(){
  const allItems = PROGRAM.parts.flatMap(p => p.items);
  const mastered = allItems.reduce((acc, it) => acc + (state.masteredIds.has(it.id) ? 1 : 0), 0);
  const total = allItems.length || 1;
  const pct = Math.round((mastered / total) * 100);
  programProgressEl.textContent = `達成率：${pct}%（Mastered ${mastered}/${allItems.length}）`;
}

// ===============================
// Home (Part cards)
// ===============================
function renderHome(){
  partCardsEl.innerHTML = "";

  PROGRAM.parts.forEach(part => {
    const mastered = partMasteredCount(part);
    const total = part.items.length || 1;
    const pct = Math.round((mastered / total) * 100);

    const card = document.createElement("div");
    card.className = "partCard";

    card.innerHTML = `
      <div class="partTop">
        <div class="partName">${part.partLabel}</div>
        <div class="partMeta">${mastered}/${part.items.length} Mastered</div>
      </div>
      <div class="partBar"><div style="width:${pct}%"></div></div>
      <div class="partActions">
        <button class="partResetBtn" type="button">このPartの進捗をリセット</button>
      </div>
    `;

    card.addEventListener("click", () => {
      state.index = 0;
      state.currentTab = "structure";
      showStudy(part.partId);
    });

    card.querySelector(".partResetBtn").addEventListener("click", (e)=>{
      e.stopPropagation();
      const ok = confirm(`${part.partLabel} の進捗をリセットしますか？`);
      if(!ok) return;

      part.items.forEach(it=>{
        delete state.streakById[it.id];
        delete state.wrongCountById[it.id];
        state.masteredIds.delete(it.id);
        delete state.quizCooldownById[it.id];
      });

      state.quizCheckedForId = null;
      saveProgress();

      updateHeaderProgressHome();
      renderHome();
    });

    partCardsEl.appendChild(card);
  });
}

// ===============================
// Paragraph (click to jump)
// ===============================
function renderTextParagraph(){
  const part = getCurrentPart();
  if(!part) return;

  textParagraphEl.innerHTML = "";
  const items = part.items;
  const breaks = Array.isArray(part.paragraphBreaks) && part.paragraphBreaks.length ? part.paragraphBreaks : [0];
  const indices = [...breaks].filter(n => Number.isInteger(n)).sort((a,b)=>a-b);

  for(let b=0;b<indices.length;b++){
    const start = indices[b];
    const end = (b+1<indices.length) ? indices[b+1] : items.length;

    const p = document.createElement("p");
    p.className = "paraLine";

    for(let i=start;i<end;i++){
      const it = items[i];
      const span = document.createElement("span");
      span.className = "sentLink";
      span.classList.toggle("active", i===state.index);
      span.textContent = it.text;

      span.addEventListener("click", ()=>{
        if(state.quizAttemptLocked){
          feedback.textContent = "答え合わせが終わるまで、他の操作はできません。";
          feedback.classList.add("show");
          return;
        }
        state.index = i;
        state.quizCheckedForId = null; // 文が変わったら採点済み解除
        state.currentTab = "structure";
        openTab("structure");
        renderTextParagraph();
        renderSentence();
      });

      p.appendChild(span);
      p.appendChild(document.createTextNode(" "));
    }
    textParagraphEl.appendChild(p);
  }
}

// ===============================
// Tabs
// ===============================
function applyQuizView(tabKey){
  const isQuiz = tabKey === "quiz";
  textNavWrap.classList.toggle("quiz-hide", isQuiz);
  sentenceEl.classList.toggle("quiz-hide", isQuiz);
  translationEl.classList.toggle("quiz-hide", isQuiz);
  toggleTranslationBtn.classList.toggle("quiz-hide", isQuiz);
  quizTranslationEl.classList.toggle("hidden", !isQuiz);
}

function setQuizAttemptLocked(locked){
  state.quizAttemptLocked = locked;

  document.querySelectorAll(".tab").forEach(btn=>{
    const isQuiz = btn.dataset.tab === "quiz";
    const disable = locked && !isQuiz;
    btn.disabled = disable;
    btn.classList.toggle("disabled", disable);
  });

  if(textParagraphEl) textParagraphEl.style.pointerEvents = locked ? "none" : "auto";
  if(backHomeBtn) backHomeBtn.disabled = locked;

  saveProgress();
}

function openTab(key){
  if(state.quizAttemptLocked && key !== "quiz"){
    feedback.textContent = "答え合わせが終わるまで、他のタブは使えません。";
    feedback.classList.add("show");
    return;
  }

  if(key === "quiz"){
    const { blocked, message } = getQuizBlockReasonForCurrent();
    if(blocked){
      feedback.textContent = message;
      feedback.classList.add("show");
      updateQuizTabAvailability();
      return;
    }
  }

  state.currentTab = key;

  document.querySelectorAll(".tab").forEach(t=>t.classList.remove("active"));
  document.querySelectorAll(".panel").forEach(p=>p.classList.remove("active"));
  document.querySelector(`.tab[data-tab="${key}"]`).classList.add("active");
  document.getElementById(key).classList.add("active");

  applyQuizView(key);

  if(key === "summary") renderSummary();

  if(key === "quiz"){
    setQuizAttemptLocked(true);
    state.quizCheckedForId = null; // 新しく挑戦
    renderSentence();
  }else{
    setQuizAttemptLocked(false);
  }

  updateQuizTabAvailability();
  saveProgress();
}

// ===============================
// TTS (chunk click)
// ===============================
function stopTTS(){
  if("speechSynthesis" in window) window.speechSynthesis.cancel();
  if(ttsStatusEl) ttsStatusEl.textContent = "音声：停止";
}

function speakEnglish(text){
  if(!("speechSynthesis" in window)){
    if(ttsStatusEl) ttsStatusEl.textContent = "このブラウザは音声に非対応です。";
    return;
  }
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  u.rate = state.ttsRate;
  u.onstart = ()=>{ if(ttsStatusEl) ttsStatusEl.textContent="音声：再生中"; };
  u.onend = ()=>{ if(ttsStatusEl) ttsStatusEl.textContent="音声：再生完了"; };
  u.onerror = ()=>{ if(ttsStatusEl) ttsStatusEl.textContent="音声：再生できませんでした"; };
  window.speechSynthesis.speak(u);
}

function setSpeed(rate){
  state.ttsRate = rate;
  saveProgress();
  speedNormalBtn.classList.toggle("active", rate === 1.0);
  speedSlowBtn.classList.toggle("active", rate !== 1.0);
}

// ===============================
// Render sentence
// ===============================
function renderSentence(){
  clampIndex();
  const it = getItem();
  const part = getCurrentPart();
  if(!it || !part) return;

  updateHeaderProgressStudy();
  counterEl.textContent = `${state.index+1} / ${part.items.length}`;

  sentenceEl.textContent = it.text;
  translationEl.textContent = it.translation;
  translationEl.classList.remove("show");
  toggleTranslationBtn.textContent = "自分で訳したら訳を確認";

  quizTranslationEl.textContent = `日本語訳：${it.translation}`;

  masteredBadgeEl.classList.toggle("show", isMastered(it.id));

  // chunks
  chunksEl.innerHTML = "";
  it.chunks.forEach((c)=>{
    const s = document.createElement("span");
    s.className = `chunk ${c.type || "m"}`;
    s.textContent = c.text;
    s.addEventListener("click", ()=>{
      // 意味表示
      const meaning = (c.meaning || "").trim() || "（未設定）";
      chunkMeaningEl.textContent = `意味：${meaning}`;

      // ✅ クリックしたまとまりの音声
      speakEnglish(c.text);
    });
    chunksEl.appendChild(s);
  });
  chunkMeaningEl.textContent = "まとまりをクリックすると意味（日本語）と音声が出ます";

  // quiz
  feedback.classList.remove("show");
  feedback.textContent = "";
  renderQuiz(it.reorderTokens);

  // 採点済みなら連打不可
  checkBtn.disabled = (state.quizCheckedForId === it.id);

  // nav
  prevBtn.disabled = state.quizAttemptLocked || state.index === 0;
  nextBtn.disabled = state.quizAttemptLocked || state.index === part.items.length - 1;

  if(ttsStatusEl) ttsStatusEl.textContent = "音声：待機中";

  renderTextParagraph();
  applyQuizView(state.currentTab);
  updateQuizTabAvailability();

  saveProgress();
}

function renderQuiz(tokens){
  pool.innerHTML = "";
  answer.innerHTML = "";
  shuffle(tokens).forEach(t=>{
    const c = document.createElement("span");
    c.className = "chip";
    c.textContent = t;
    c.addEventListener("click", ()=>answer.appendChild(c));
    pool.appendChild(c);
  });
  answer.onclick = (e)=>{ if(e.target.classList.contains("chip")) pool.appendChild(e.target); };
}

// ===============================
// Summary
// ===============================
function renderSummary(){
  const part = getCurrentPart();
  if(!part) return;

  summaryTitleEl.textContent = `${part.partLabel} まとめ`;

  const mastered = partMasteredCount(part);
  const wrongTotal = part.items.reduce((acc, it) => acc + getWrong(it.id), 0);
  summaryStatsEl.textContent = `Mastered ${mastered}/${part.items.length}｜まちがえ合計 ${wrongTotal}回`;

  let list = [...part.items];
  if(state.summaryFilter==="wrong") list = list.filter(it=>getWrong(it.id)>0);
  else if(state.summaryFilter==="notMastered") list = list.filter(it=>!isMastered(it.id));

  summaryListEl.innerHTML = "";
  if(list.length===0){
    const empty=document.createElement("div");
    empty.className="status";
    empty.textContent="表示する文がありません。";
    summaryListEl.appendChild(empty);
    return;
  }

  list.forEach(it=>{
    const d=document.createElement("div");
    d.className="sum-item";

    const left=document.createElement("div");
    left.className="sum-left";

    const text=document.createElement("div");
    text.className="sum-text";
    text.textContent=it.text;

    const badges=document.createElement("div");
    badges.className="sum-badges";

    if(isMastered(it.id)){
      const tag=document.createElement("span");
      tag.className="tag master";
      tag.textContent="Mastered";
      badges.appendChild(tag);
    }else{
      const tag=document.createElement("span");
      tag.className="tag";
      tag.textContent=`連続 ${getStreak(it.id)}/${MASTER_STREAK}`;
      badges.appendChild(tag);
    }

    const wc=getWrong(it.id);
    if(wc>0){
      const tag=document.createElement("span");
      tag.className="tag ng";
      tag.textContent=`まちがえ ${wc}回`;
      badges.appendChild(tag);
    }

    left.appendChild(text);
    left.appendChild(badges);

    const right=document.createElement("div");
    right.className="sum-right";

    const jump=document.createElement("button");
    jump.className="jump";
    jump.textContent="この文へ";
    jump.onclick=()=>{
      if(state.quizAttemptLocked){
        alert("答え合わせが終わるまで移動できません。");
        return;
      }
      const part = getCurrentPart();
      const idx = part.items.findIndex(x=>x.id===it.id);
      if(idx>=0){
        state.index=idx;
        state.quizCheckedForId = null;
        state.currentTab="structure";
        openTab("structure");
        renderSentence();
      }
    };
    right.appendChild(jump);

    d.appendChild(left);
    d.appendChild(right);
    summaryListEl.appendChild(d);
  });
}

// ===============================
// View switching
// ===============================
function showHome(){
  stopTTS();

  homeView.classList.remove("hidden");
  studyView.classList.add("hidden");
  tabsEl.classList.add("hidden");
  panelsEl.classList.add("hidden");
  bottomNavEl.classList.add("hidden");

  programLabelEl.textContent = PROGRAM.programLabel;
  screenTitleEl.textContent = "ホーム";
  counterEl.textContent = "-";

  setQuizAttemptLocked(false);

  updateHeaderProgressHome();
  renderHome();

  if(importWrapEl) importWrapEl.classList.add("hidden");
  if(adminModalEl) adminModalEl.classList.add("hidden");

  saveProgress();
}

function showStudy(partId){
  state.currentPartId = partId;
  clampIndex();

  homeView.classList.add("hidden");
  studyView.classList.remove("hidden");
  tabsEl.classList.remove("hidden");
  panelsEl.classList.remove("hidden");
  bottomNavEl.classList.remove("hidden");

  renderTextParagraph();
  openTab(state.currentTab || "structure");
  renderSentence();
  saveProgress();
}

// ===============================
// Events
// ===============================
toggleTranslationBtn.addEventListener("click", ()=>{
  if(state.quizAttemptLocked){
    feedback.textContent = "答え合わせが終わるまで、他の操作はできません。";
    feedback.classList.add("show");
    return;
  }
  translationEl.classList.toggle("show");
  toggleTranslationBtn.textContent =
    translationEl.classList.contains("show")
      ? "訳を隠す（もう一度自分で）"
      : "自分で訳したら訳を確認";
});

checkBtn.addEventListener("click", ()=>{
  const it = getItem();
  const part = getCurrentPart();
  if(!it || !part) return;

  if(state.quizCheckedForId === it.id) return;

  const user = [...answer.children].map(c=>c.textContent).join(" ");
  const correct = it.reorderTokens.join(" ");

  if(user===correct){
    state.streakById[it.id]=getStreak(it.id)+1;
    if(state.streakById[it.id]>=MASTER_STREAK) state.masteredIds.add(it.id);
    feedback.textContent = isMastered(it.id)
      ? `正解！ Mastered 🎉（${MASTER_STREAK}回連続）`
      : `正解！（連続 ${getStreak(it.id)}/${MASTER_STREAK}）`;
  }else{
    state.streakById[it.id]=0;
    state.wrongCountById[it.id]=getWrong(it.id)+1;
    feedback.textContent = `不正解。もう一度並べ替えましょう。`;
  }

  feedback.classList.add("show");
  masteredBadgeEl.classList.toggle("show", isMastered(it.id));
  updateHeaderProgressStudy();

  // ✅ 1分クールダウン
  setCooldown(it);

  // ✅ 連打防止
  state.quizCheckedForId = it.id;
  checkBtn.disabled = true;

  // ✅ 答え合わせしたらロック解除
  setQuizAttemptLocked(false);

  saveProgress();
  updateQuizTabAvailability();
});

resetQuizBtn.addEventListener("click", ()=>{
  const it=getItem(); if(!it) return;
  feedback.classList.remove("show");
  feedback.textContent="";
  renderQuiz(it.reorderTokens);
  checkBtn.disabled = (state.quizCheckedForId === it.id);
});

prevBtn.addEventListener("click", ()=>{
  if(state.quizAttemptLocked) return;
  const part=getCurrentPart(); if(!part) return;
  if(state.index>0){
    state.index--;
    stopTTS();
    state.quizCheckedForId = null;
    state.currentTab="structure";
    openTab("structure");
    renderSentence();
  }
});
nextBtn.addEventListener("click", ()=>{
  if(state.quizAttemptLocked) return;
  const part=getCurrentPart(); if(!part) return;
  if(state.index<part.items.length-1){
    state.index++;
    stopTTS();
    state.quizCheckedForId = null;
    state.currentTab="structure";
    openTab("structure");
    renderSentence();
  }
});

filterAllBtn.addEventListener("click", ()=>{ state.summaryFilter="all"; saveProgress(); renderSummary(); });
filterWrongBtn.addEventListener("click", ()=>{ state.summaryFilter="wrong"; saveProgress(); renderSummary(); });
filterNotMasteredBtn.addEventListener("click", ()=>{ state.summaryFilter="notMastered"; saveProgress(); renderSummary(); });

resetProgressBtn.addEventListener("click", ()=>{
  const ok = confirm("本当に進捗をリセットしていいですか？\n（Mastered・まちがえ回数が消えます）");
  if(!ok) return;

  localStorage.removeItem(PROGRESS_KEY);

  state.currentPartId=null;
  state.index=0;
  state.streakById={};
  state.masteredIds=new Set();
  state.wrongCountById={};
  state.summaryFilter="all";
  state.ttsRate=1.0;
  state.currentTab="structure";
  state.quizAttemptLocked = false;
  state.quizCooldownById = {};
  state.quizCheckedForId = null;

  stopTTS();
  showHome();
});

document.querySelectorAll(".tab").forEach(tab=>{
  tab.addEventListener("click", ()=>{
    openTab(tab.dataset.tab);
  });
});

speedNormalBtn.addEventListener("click", ()=>setSpeed(1.0));
speedSlowBtn.addEventListener("click", ()=>setSpeed(0.8));
stopEnglishBtn.addEventListener("click", stopTTS);

backHomeBtn.addEventListener("click", ()=>{
  if(state.quizAttemptLocked){
    alert("答え合わせが終わるまで、ホームへ戻れません。");
    return;
  }
  showHome();
});

// ===============================
// Boot
// ===============================
async function boot(){
  programLabelEl.textContent = PROGRAM_INFO.label;

  if(importWrapEl) importWrapEl.classList.add("hidden");
  if(adminModalEl) adminModalEl.classList.add("hidden");

  loadProgress();
  setSpeed(state.ttsRate === 1.0 ? 1.0 : 0.8);

  try{
    const tsv = await loadDatasetFromGoogleSheet();
    PROGRAM = buildProgramFromText(tsv);

    if(PROGRAM.parts.length === 0){
      alert("シートから読み取れる行がありません。\n列：Part / English / Japanese / (Chunks) を確認してください。");
      PROGRAM = { programId: PROGRAM_INFO.id, programLabel: PROGRAM_INFO.label, parts: [] };
      showHome();
      return;
    }
  }catch(e){
    console.error(e);
    alert("教材データを読み込めませんでした。\n公開設定・シート名（Program7）・列を確認してください。");
    PROGRAM = { programId: PROGRAM_INFO.id, programLabel: PROGRAM_INFO.label, parts: [] };
    showHome();
    return;
  }

  if(state.currentPartId && getPart(state.currentPartId)){
    showStudy(state.currentPartId);
  } else {
    showHome();
  }
}

boot();
