(function(){
  "use strict";
  const STORAGE_KEY = "rnready_progress_v1";
  const main = document.getElementById("main");
  const navBtns = document.querySelectorAll(".navbtn");

  // ---- Progress data model ----
  // progress[qid] = { seen, correct, wrong, box (1-5 spaced rep level), lastSeen, dueAt }
  function loadProgress(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if(raw) return JSON.parse(raw);
    }catch(e){}
    return { items:{}, streak:0, lastStudyDate:null, totalAnswered:0, totalCorrect:0 };
  }
  function saveProgress(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

  let state = loadProgress();
  let currentQuiz = null; // {cat, queue:[qids], idx, answeredCurrent}

  // ---- Streak handling ----
  function todayStr(){ return new Date().toISOString().slice(0,10); }
  function touchStreak(){
    const today = todayStr();
    if(state.lastStudyDate === today) return;
    const yest = new Date(Date.now() - 86400000).toISOString().slice(0,10);
    if(state.lastStudyDate === yest){ state.streak = (state.streak||0) + 1; }
    else { state.streak = 1; }
    state.lastStudyDate = today;
    saveProgress();
  }

  // ---- Box intervals (in "answers seen" terms - simple leitner-ish) ----
  // box 1: review very soon (every session), box 5: rarely
  function initItem(qid){
    if(!state.items[qid]){
      state.items[qid] = { box:1, correctCount:0, wrongCount:0, seen:0, lastResult:null };
    }
    return state.items[qid];
  }

  function recordAnswer(qid, wasCorrect){
    const item = initItem(qid);
    item.seen++;
    item.lastResult = wasCorrect;
    if(wasCorrect){
      item.correctCount++;
      item.box = Math.min(5, item.box + 1);
    } else {
      item.wrongCount++;
      item.box = 1;
    }
    state.totalAnswered = (state.totalAnswered||0) + 1;
    if(wasCorrect) state.totalCorrect = (state.totalCorrect||0) + 1;
    touchStreak();
    saveProgress();
  }

  // weight: lower box = higher chance of being picked
  function buildQueue(catKey){
    let pool = QUESTIONS.filter(q => catKey === "all" ? true : q.cat === catKey);
    // weight by inverse box (box1 x5, box2 x3, box3 x2, box4 x1, box5 x1 but rare)
    let weighted = [];
    pool.forEach(q=>{
      const item = state.items[q.id];
      const box = item ? item.box : 1;
      let weight = box === 1 ? 5 : box === 2 ? 3 : box === 3 ? 2 : 1;
      for(let i=0;i<weight;i++) weighted.push(q.id);
    });
    // shuffle
    for(let i=weighted.length-1;i>0;i--){
      const j = Math.floor(Math.random()*(i+1));
      [weighted[i],weighted[j]] = [weighted[j],weighted[i]];
    }
    // dedupe consecutive-ish, cap at 20 per session
    const seenInQueue = new Set();
    const queue = [];
    for(const id of weighted){
      if(queue.length >= 20) break;
      if(seenInQueue.has(id) && queue.length < pool.length) continue;
      queue.push(id);
      seenInQueue.add(id);
    }
    return queue.length ? queue : pool.map(q=>q.id);
  }

  // ---- Views ----
  function setActiveNav(view){
    navBtns.forEach(b => b.classList.toggle("active", b.dataset.view === view));
  }

  function renderVitals(){
    document.getElementById("v-streak").textContent = state.streak || 0;
    document.getElementById("v-done").textContent = state.totalAnswered || 0;
    const acc = state.totalAnswered ? Math.round((state.totalCorrect/state.totalAnswered)*100) : 0;
    document.getElementById("v-acc").textContent = acc + "%";
  }

  function catStats(catKey){
    const qs = QUESTIONS.filter(q=>q.cat===catKey);
    let correct=0, total=0, seen=0;
    qs.forEach(q=>{
      const it = state.items[q.id];
      if(it){ seen++; correct += it.correctCount; total += it.correctCount + it.wrongCount; }
    });
    const acc = total ? Math.round((correct/total)*100) : null;
    return { count: qs.length, seen, acc };
  }

  function viewHome(){
    setActiveNav("home");
    renderVitals();
    let html = `<div class="section-label">Choose a category</div>`;
    Object.keys(CATEGORIES).forEach(key=>{
      const c = CATEGORIES[key];
      const st = catStats(key);
      const accText = st.acc === null ? "—" : st.acc + "%";
      html += `
        <button class="cat-card" data-cat="${key}">
          <div class="swatch" style="background:${c.color}"></div>
          <div class="body">
            <div class="name">${c.name}</div>
            <div class="meta">${st.count} questions · ${st.seen} studied</div>
          </div>
          <div class="accuracy" style="color:${c.color}">${accText}</div>
        </button>`;
    });
    html += `<div class="cta-row">
        <button class="btn-primary" id="mixedBtn">Mixed Review (all categories)</button>
      </div>`;
    main.innerHTML = html;
    main.querySelectorAll(".cat-card").forEach(btn=>{
      btn.addEventListener("click", ()=> startQuiz(btn.dataset.cat));
    });
    document.getElementById("mixedBtn").addEventListener("click", ()=> startQuiz("all"));
  }

  function startQuiz(catKey){
    currentQuiz = { cat: catKey, queue: buildQueue(catKey), idx: 0, answered:false };
    if(currentQuiz.queue.length === 0){
      main.innerHTML = `<div class="empty-state"><div class="big">No questions yet</div><p>This category has no questions available.</p></div>`;
      return;
    }
    renderQuestion();
  }

  function renderQuestion(){
    const qid = currentQuiz.queue[currentQuiz.idx];
    const q = QUESTIONS.find(x=>x.id===qid);
    const cat = CATEGORIES[q.cat];
    currentQuiz.answered = false;

    const letters = ["A","B","C","D"];
    let optsHtml = "";
    q.options.forEach((opt, i)=>{
      optsHtml += `<button class="option" data-idx="${i}">
        <span class="letter">${letters[i]}</span>
        <span class="opt-text">${opt}</span>
      </button>`;
    });

    main.innerHTML = `
      <div class="quiz-head">
        <button class="back-btn" id="backBtn">← Back to categories</button>
        <span class="progress-pill">${currentQuiz.idx+1} / ${currentQuiz.queue.length}</span>
      </div>
      <div class="q-card">
        <div class="q-cat" style="color:${cat.color}">${cat.name}</div>
        <div class="q-text">${q.q}</div>
      </div>
      <div class="options">${optsHtml}</div>
      <div class="rationale" id="rationale">
        <div class="r-label">Rationale</div>
        <div id="rationaleText"></div>
      </div>
      <button class="btn-primary next-btn" id="nextBtn">Next question</button>
    `;

    document.getElementById("backBtn").addEventListener("click", viewHome);
    document.getElementById("nextBtn").addEventListener("click", nextQuestion);
    main.querySelectorAll(".option").forEach(btn=>{
      btn.addEventListener("click", ()=> selectAnswer(parseInt(btn.dataset.idx,10), q));
    });
  }

  function selectAnswer(idx, q){
    if(currentQuiz.answered) return;
    currentQuiz.answered = true;
    const opts = main.querySelectorAll(".option");
    opts.forEach((btn,i)=>{
      btn.setAttribute("disabled","true");
      if(i === q.correct) btn.classList.add("correct");
      else if(i === idx) btn.classList.add("wrong");
    });
    const rat = document.getElementById("rationale");
    document.getElementById("rationaleText").textContent = q.rationale;
    rat.classList.add("show");
    document.getElementById("nextBtn").classList.add("show");
    recordAnswer(q.id, idx === q.correct);
    renderVitals();
  }

  function nextQuestion(){
    if(currentQuiz.idx < currentQuiz.queue.length - 1){
      currentQuiz.idx++;
      renderQuestion();
    } else {
      main.innerHTML = `
        <div class="empty-state">
          <div class="big">Session complete</div>
          <p>Nice work. Progress is saved automatically. Come back anytime to keep building your accuracy.</p>
          <div class="cta-row" style="margin-top:20px;">
            <button class="btn-primary" id="doneHome">Back to categories</button>
          </div>
        </div>`;
      document.getElementById("doneHome").addEventListener("click", viewHome);
    }
  }

  function viewStats(){
    setActiveNav("stats");
    renderVitals();
    let html = `<div class="section-label">Accuracy by category</div>`;
    Object.keys(CATEGORIES).forEach(key=>{
      const c = CATEGORIES[key];
      const st = catStats(key);
      const pct = st.acc === null ? 0 : st.acc;
      html += `
        <div class="stat-row" style="display:block;">
          <div style="display:flex; justify-content:space-between;">
            <span class="name">${c.name}</span>
            <span style="font-family:var(--mono); font-weight:700; color:${c.color};">${st.acc === null ? "—" : pct+"%"}</span>
          </div>
          <div class="bar-bg"><div class="bar-fill" style="width:${pct}%; background:${c.color};"></div></div>
          <div style="font-size:11px; color:var(--ink-soft); margin-top:4px;">${st.seen} of ${st.count} questions studied</div>
        </div>`;
    });
    main.innerHTML = html;
  }

  function viewSettings(){
    setActiveNav("settings");
    renderVitals();
    main.innerHTML = `
      <div class="section-label">Backup your progress</div>
      <p style="font-size:13.5px; color:var(--ink-soft); line-height:1.5;">
        Your progress is saved on this device only. If you switch phones or clear browser data,
        export a backup file first. You can import it later to restore everything.
      </p>
      <div class="io-row">
        <button class="btn-primary" id="exportBtn">Export backup</button>
        <button class="btn-ghost" id="importBtn">Import backup</button>
      </div>
      <input type="file" id="importFile" accept="application/json" style="display:none;">
      <div class="section-label" style="margin-top:30px;">Reset</div>
      <button class="btn-ghost" id="resetBtn" style="width:100%; border-color:var(--bad); color:var(--bad);">Reset all progress</button>
    `;
    document.getElementById("exportBtn").addEventListener("click", exportData);
    document.getElementById("importBtn").addEventListener("click", ()=> document.getElementById("importFile").click());
    document.getElementById("importFile").addEventListener("change", importData);
    document.getElementById("resetBtn").addEventListener("click", ()=>{
      if(confirm("This will erase all saved progress on this device. Continue?")){
        state = { items:{}, streak:0, lastStudyDate:null, totalAnswered:0, totalCorrect:0 };
        saveProgress();
        viewSettings();
      }
    });
  }

  function exportData(){
    const blob = new Blob([JSON.stringify(state, null, 2)], {type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "rnready-backup-" + todayStr() + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function importData(e){
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = function(evt){
      try{
        const data = JSON.parse(evt.target.result);
        if(data && typeof data === "object" && data.items){
          state = data;
          saveProgress();
          alert("Backup restored.");
          viewSettings();
        } else {
          alert("This file doesn't look like a valid backup.");
        }
      }catch(err){
        alert("Couldn't read that file.");
      }
    };
    reader.readAsText(file);
  }

  navBtns.forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const v = btn.dataset.view;
      if(v === "home") viewHome();
      else if(v === "stats") viewStats();
      else if(v === "settings") viewSettings();
    });
  });

  // Register service worker for offline support
  if("serviceWorker" in navigator){
    window.addEventListener("load", ()=>{
      navigator.serviceWorker.register("sw.js").catch(()=>{});
    });
  }

  viewHome();
})();
