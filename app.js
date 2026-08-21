(function(){
  "use strict";
  const STORAGE_KEY = "rnready_progress_v2";
  const main = document.getElementById("main");
  const navBtns = document.querySelectorAll(".navbtn");

  function loadProgress(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if(raw) return JSON.parse(raw);
    }catch(e){}
    try{
      const old = localStorage.getItem("rnready_progress_v1");
      if(old){
        const parsed = JSON.parse(old);
        parsed.customSubjects = parsed.customSubjects || {};
        parsed.customQuestions = parsed.customQuestions || {};
        parsed.notes = parsed.notes || {};
        return parsed;
      }
    }catch(e){}
    return { items:{}, streak:0, lastStudyDate:null, totalAnswered:0, totalCorrect:0, customSubjects:{}, customQuestions:{}, notes:{} };
  }
  function saveProgress(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

  let state = loadProgress();
  state.customSubjects = state.customSubjects || {};
  state.customQuestions = state.customQuestions || {};
  state.notes = state.notes || {};
  let currentQuiz = null;

  function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }

  function todayStr(){ return new Date().toISOString().slice(0,10); }
  function touchStreak(){
    const today = todayStr();
    if(state.lastStudyDate === today) return;
    const yest = new Date(Date.now() - 86400000).toISOString().slice(0,10);
    state.streak = (state.lastStudyDate === yest) ? (state.streak||0) + 1 : 1;
    state.lastStudyDate = today;
    saveProgress();
  }

  function initItem(qid){
    if(!state.items[qid]) state.items[qid] = { box:1, correctCount:0, wrongCount:0, seen:0, lastResult:null };
    return state.items[qid];
  }
  function recordAnswer(qid, wasCorrect){
    const item = initItem(qid);
    item.seen++; item.lastResult = wasCorrect;
    if(wasCorrect){ item.correctCount++; item.box = Math.min(5, item.box+1); }
    else { item.wrongCount++; item.box = 1; }
    state.totalAnswered = (state.totalAnswered||0)+1;
    if(wasCorrect) state.totalCorrect = (state.totalCorrect||0)+1;
    touchStreak();
    saveProgress();
  }

  function allQuestionsForCat(catKey){
    const builtIn = QUESTIONS.filter(q => catKey==="all" ? true : q.cat===catKey);
    const custom = Object.values(state.customQuestions).filter(q => catKey==="all" ? true : q.subjectId===catKey)
      .map(q => ({ id:"c_"+q.id, cat:q.subjectId, q:q.q, options:q.options, correct:q.correct, rationale:q.rationale, type:q.type||"mc", expectedAnswer:q.expectedAnswer||null, sourceHeading:q.sourceHeading||null, sourceSnippet:q.sourceSnippet||null }));
    return builtIn.concat(custom);
  }
  function findQuestion(qid){
    if(String(qid).startsWith("c_")){
      const realId = String(qid).slice(2);
      const cq = state.customQuestions[realId];
      if(!cq) return null;
      return { id:"c_"+cq.id, cat:cq.subjectId, q:cq.q, options:cq.options, correct:cq.correct, rationale:cq.rationale, type:cq.type||"mc", expectedAnswer:cq.expectedAnswer||null, sourceHeading:cq.sourceHeading||null, sourceSnippet:cq.sourceSnippet||null };
    }
    const built = QUESTIONS.find(x=>x.id===qid);
    if(built) return { ...built, type:"mc" };
    return null;
  }
  function allCategoryKeys(){
    return Object.keys(CATEGORIES).concat(Object.keys(state.customSubjects));
  }
  function catMeta(key){
    if(CATEGORIES[key]) return CATEGORIES[key];
    if(state.customSubjects[key]) return { name: state.customSubjects[key].name, color: state.customSubjects[key].color, custom:true };
    return { name:"Unknown", color:"#999" };
  }
  function buildQueue(catKey){
    let pool = allQuestionsForCat(catKey);
    let weighted = [];
    pool.forEach(q=>{
      const item = state.items[q.id];
      const box = item ? item.box : 1;
      let weight = box===1?5:box===2?3:box===3?2:1;
      for(let i=0;i<weight;i++) weighted.push(q.id);
    });
    for(let i=weighted.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [weighted[i],weighted[j]]=[weighted[j],weighted[i]]; }
    const seenInQueue=new Set(); const queue=[];
    for(const id of weighted){
      if(queue.length>=20) break;
      if(seenInQueue.has(id) && queue.length<pool.length) continue;
      queue.push(id); seenInQueue.add(id);
    }
    return queue.length?queue:pool.map(q=>q.id);
  }
  function missedQueue(){
    const missed = Object.entries(state.items).filter(([id,it]) => it.lastResult===false).map(([id])=>id);
    for(let i=missed.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [missed[i],missed[j]]=[missed[j],missed[i]]; }
    return missed.slice(0,20);
  }

  function setActiveNav(view){ navBtns.forEach(b=>b.classList.toggle("active", b.dataset.view===view)); }
  function renderVitals(){
    document.getElementById("v-streak").textContent = state.streak||0;
    document.getElementById("v-done").textContent = state.totalAnswered||0;
    const acc = state.totalAnswered ? Math.round((state.totalCorrect/state.totalAnswered)*100) : 0;
    document.getElementById("v-acc").textContent = acc+"%";
  }

  function catStats(catKey){
    const qs = allQuestionsForCat(catKey);
    let correct=0,total=0,seen=0;
    qs.forEach(q=>{ const it=state.items[q.id]; if(it){ seen++; correct+=it.correctCount; total+=it.correctCount+it.wrongCount; } });
    const acc = total ? Math.round((correct/total)*100) : null;
    return { count: qs.length, seen, acc };
  }

  function escapeHtml(s){ const d=document.createElement("div"); d.textContent=s||""; return d.innerHTML; }

  function viewHome(){
    setActiveNav("home");
    renderVitals();
    const recentNotes = Object.values(state.notes).sort((a,b)=>b.updatedAt-a.updatedAt).slice(0,3);
    const missedCount = missedQueue().length;

    let subjHtml = "";
    const keys = allCategoryKeys();
    if(keys.length===0){
      subjHtml = `<div class="empty-mini">No subjects yet.</div>`;
    } else {
      keys.slice(0,4).forEach(key=>{
        const c = catMeta(key); const st = catStats(key);
        subjHtml += `<div class="mini-item"><span class="t">${escapeHtml(c.name)}</span><span class="d">${st.acc===null?"—":st.acc+"%"}</span></div>`;
      });
    }
    let notesHtml = "";
    if(recentNotes.length===0){
      notesHtml = `<div class="empty-mini">No notes yet.</div>`;
    } else {
      recentNotes.forEach(n=>{
        notesHtml += `<div class="mini-item"><span class="t">${escapeHtml(n.title||"Untitled")}</span><span class="d">${new Date(n.updatedAt).toLocaleDateString()}</span></div>`;
      });
    }

    main.innerHTML = `
      <div class="quick-row">
        <button class="btn-primary" id="qAddSubject">+ Subject</button>
        <button class="btn-ghost" id="qAddNote">+ Note</button>
      </div>
      ${missedCount>0?`<div class="home-card" style="border-color:var(--coral);"><h3>Missed questions</h3><p style="font-size:13px; color:var(--ink-soft); margin:0 0 12px;">${missedCount} question${missedCount===1?"":"s"} you got wrong before. Quick review?</p><button class="btn-primary" id="reviewMissed" style="width:100%;">Review missed</button></div>`:""}
      <div class="home-card">
        <h3>Your subjects</h3>
        ${subjHtml}
      </div>
      <div class="home-card">
        <h3>Recent notes</h3>
        ${notesHtml}
      </div>
    `;
    document.getElementById("qAddSubject").addEventListener("click", openAddSubjectModal);
    document.getElementById("qAddNote").addEventListener("click", ()=>openNoteEditor(null));
    const rm = document.getElementById("reviewMissed");
    if(rm) rm.addEventListener("click", ()=>{ currentQuiz = {cat:"missed", queue: missedQueue(), idx:0, answered:false}; renderQuestion(); });
  }

  function viewStudy(){
    setActiveNav("study");
    renderVitals();
    let html = `<div class="section-label">Built-in categories</div>`;
    Object.keys(CATEGORIES).forEach(key=>{
      const c = CATEGORIES[key]; const st = catStats(key);
      const accText = st.acc===null?"—":st.acc+"%";
      html += `<button class="cat-card" data-cat="${key}">
        <div class="swatch" style="background:${c.color}"></div>
        <div class="body"><div class="name">${c.name}</div><div class="meta">${st.count} questions · ${st.seen} studied</div></div>
        <div class="accuracy" style="color:${c.color}">${accText}</div>
      </button>`;
    });

    const customKeys = Object.keys(state.customSubjects);
    html += `<div class="section-label">Your subjects</div>`;
    if(customKeys.length===0){
      html += `<div class="empty-mini">None yet — create one below.</div>`;
    } else {
      customKeys.forEach(key=>{
        const c = state.customSubjects[key]; const st = catStats(key);
        const accText = st.acc===null?"—":st.acc+"%";
        html += `<div class="cat-card" data-cat="${key}" style="cursor:pointer; position:relative; padding-right:44px;">
          <div class="swatch" style="background:${c.color}"></div>
          <div class="body"><div class="name">${escapeHtml(c.name)}</div><div class="meta">${st.count} questions · ${st.seen} studied</div></div>
          <div class="accuracy" style="color:${c.color}">${accText}</div>
          <button class="subj-menu-btn" data-menukey="${key}" style="position:absolute; right:8px; top:50%; transform:translateY(-50%); background:none; color:var(--ink-soft); font-size:20px; padding:6px 8px;">⋮</button>
        </div>`;
      });
    }

    html += `<div class="cta-row">
      <button class="btn-primary" id="mixedBtn">Mixed Review</button>
      <button class="btn-ghost" id="newSubjectBtn">+ New Subject</button>
    </div>
    <div class="cta-row">
      <button class="btn-ghost" id="genBtnEntry">✦ Generate from topic</button>
      <button class="btn-ghost" id="anaBtnEntry">📄 Analyze a file</button>
    </div>`;
    main.innerHTML = html;
    main.querySelectorAll(".cat-card").forEach(btn=> btn.addEventListener("click", (e)=>{
      if(e.target.classList.contains("subj-menu-btn")) return;
      startQuiz(btn.dataset.cat);
    }));
    main.querySelectorAll(".subj-menu-btn").forEach(btn=>{
      btn.addEventListener("click", (e)=>{ e.stopPropagation(); openSubjectMenu(btn.dataset.menukey); });
    });
    document.getElementById("mixedBtn").addEventListener("click", ()=> startQuiz("all"));
    document.getElementById("newSubjectBtn").addEventListener("click", openAddSubjectModal);
    document.getElementById("genBtnEntry").addEventListener("click", openGenerateModal);
    document.getElementById("anaBtnEntry").addEventListener("click", openAnalyzeModal);
  }

  function openSubjectMenu(subjectId){
    const subj = state.customSubjects[subjectId];
    if(!subj) return;
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal-sheet">
        <div class="modal-head"><h3>${escapeHtml(subj.name)}</h3><button class="modal-close" id="closeModal">&times;</button></div>
        <button class="btn-ghost" id="renameBtn" style="width:100%; margin-bottom:10px;">Rename subject</button>
        <button class="btn-ghost" id="deleteSubjBtn" style="width:100%; border-color:var(--bad); color:var(--bad);">Delete subject</button>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener("click", e=>{ if(e.target===overlay) overlay.remove(); });
    document.getElementById("closeModal").addEventListener("click", ()=>overlay.remove());
    document.getElementById("renameBtn").addEventListener("click", ()=>{
      overlay.remove();
      openRenameSubjectModal(subjectId);
    });
    document.getElementById("deleteSubjBtn").addEventListener("click", ()=>{
      overlay.remove();
      const qCount = Object.values(state.customQuestions).filter(q=>q.subjectId===subjectId).length;
      const msg = `Delete "${subj.name}"? This removes ${qCount} question(s) and their progress. Notes tagged to this subject will keep their content but lose the tag.`;
      if(confirm(msg)){
        Object.keys(state.customQuestions).forEach(qid=>{
          if(state.customQuestions[qid].subjectId === subjectId){
            delete state.items["c_"+qid];
            delete state.customQuestions[qid];
          }
        });
        Object.values(state.notes).forEach(n=>{ if(n.subjectId===subjectId) n.subjectId=null; });
        delete state.customSubjects[subjectId];
        saveProgress();
        viewStudy();
      }
    });
  }

  function openRenameSubjectModal(subjectId){
    const subj = state.customSubjects[subjectId];
    if(!subj) return;
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal-sheet">
        <div class="modal-head"><h3>Rename Subject</h3><button class="modal-close" id="closeModal">&times;</button></div>
        <div class="field"><label>Subject name</label><input type="text" id="renameInput" value="${escapeHtml(subj.name)}"></div>
        <button class="btn-primary" id="saveRenameBtn" style="width:100%;">Save</button>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener("click", e=>{ if(e.target===overlay) overlay.remove(); });
    document.getElementById("closeModal").addEventListener("click", ()=>overlay.remove());
    document.getElementById("saveRenameBtn").addEventListener("click", ()=>{
      const newName = document.getElementById("renameInput").value.trim();
      if(!newName){ alert("Please enter a name."); return; }
      state.customSubjects[subjectId].name = newName;
      saveProgress();
      overlay.remove();
      viewStudy();
    });
  }

  function startQuiz(catKey){
    currentQuiz = { cat: catKey, queue: buildQueue(catKey), idx: 0, answered:false };
    if(currentQuiz.queue.length===0){
      main.innerHTML = `<div class="empty-state"><div class="big">No questions yet</div><p>Add some questions to this subject first.</p><div class="cta-row" style="margin-top:20px;"><button class="btn-primary" id="backStudyBtn">Back to Study</button></div></div>`;
      document.getElementById("backStudyBtn").addEventListener("click", viewStudy);
      return;
    }
    renderQuestion();
  }

  function renderQuestion(){
    const qid = currentQuiz.queue[currentQuiz.idx];
    const q = findQuestion(qid);
    if(!q){ nextQuestion(); return; }
    const cat = catMeta(q.cat);
    currentQuiz.answered = false;

    if(q.type === "short"){
      main.innerHTML = `
        <div class="quiz-head">
          <button class="back-btn" id="backBtn">← Back</button>
          <span class="progress-pill">${currentQuiz.idx+1} / ${currentQuiz.queue.length}</span>
        </div>
        <div class="q-card">
          <div class="q-cat" style="color:${cat.color}">${escapeHtml(cat.name)} · Short answer</div>
          <div class="q-text">${escapeHtml(q.q)}</div>
        </div>
        <div class="field"><textarea id="shortAnswerInput" placeholder="Type your answer..." style="min-height:80px;"></textarea></div>
        <button class="btn-primary" id="submitShortBtn" style="width:100%;">Submit answer</button>
        <div class="rationale" id="rationale"><div class="r-label" id="verdictLabel">Result</div><div id="rationaleText"></div>${q.sourceHeading?`<div class="source-tag"><span class="s-label">Source</span><br>${escapeHtml(q.sourceHeading)} — "${escapeHtml(q.sourceSnippet||"")}"</div>`:""}</div>
        <button class="btn-primary next-btn" id="nextBtn">Next question</button>
      `;
      document.getElementById("backBtn").addEventListener("click", viewStudy);
      document.getElementById("nextBtn").addEventListener("click", nextQuestion);
      document.getElementById("submitShortBtn").addEventListener("click", ()=> submitShortAnswer(q));
      return;
    }

    const letters=["A","B","C","D"];
    let optsHtml="";
    q.options.forEach((opt,i)=>{ optsHtml += `<button class="option" data-idx="${i}"><span class="letter">${letters[i]}</span><span class="opt-text">${escapeHtml(opt)}</span></button>`; });

    main.innerHTML = `
      <div class="quiz-head">
        <button class="back-btn" id="backBtn">← Back</button>
        <span class="progress-pill">${currentQuiz.idx+1} / ${currentQuiz.queue.length}</span>
      </div>
      <div class="q-card">
        <div class="q-cat" style="color:${cat.color}">${escapeHtml(cat.name)}</div>
        <div class="q-text">${escapeHtml(q.q)}</div>
      </div>
      <div class="options">${optsHtml}</div>
      <div class="rationale" id="rationale"><div class="r-label">Rationale</div><div id="rationaleText"></div>${q.sourceHeading?`<div class="source-tag"><span class="s-label">Source</span><br>${escapeHtml(q.sourceHeading)} — "${escapeHtml(q.sourceSnippet||"")}"</div>`:""}</div>
      <button class="btn-primary next-btn" id="nextBtn">Next question</button>
    `;
    document.getElementById("backBtn").addEventListener("click", viewStudy);
    document.getElementById("nextBtn").addEventListener("click", nextQuestion);
    main.querySelectorAll(".option").forEach(btn=> btn.addEventListener("click", ()=> selectAnswer(parseInt(btn.dataset.idx,10), q)));
  }

  async function submitShortAnswer(q){
    if(currentQuiz.answered) return;
    const input = document.getElementById("shortAnswerInput");
    const userAnswer = input.value.trim();
    if(!userAnswer){ alert("Please type an answer first."); return; }
    currentQuiz.answered = true;
    const submitBtn = document.getElementById("submitShortBtn");
    submitBtn.setAttribute("disabled","true");
    submitBtn.textContent = "Checking with AI...";
    input.setAttribute("disabled","true");

    try{
      const res = await fetch(WORKER_URL, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ mode:"grade", question:q.q, expectedAnswer:q.expectedAnswer, userAnswer })
      });
      const data = await res.json();
      if(!res.ok) throw new Error(data.message || "grading failed");
      const verdictMatch = (data.reply||"").match(/Verdict:\s*(Correct|Partially Correct|Incorrect)/i);
      const feedbackMatch = (data.reply||"").match(/Feedback:\s*([\s\S]+)/i);
      const verdict = verdictMatch ? verdictMatch[1] : "Unable to grade";
      const feedback = feedbackMatch ? feedbackMatch[1].trim() : (data.reply||"No feedback available.");
      showShortAnswerResult(q, verdict, feedback);
    }catch(err){
      showSelfGradeFallback(q);
    }
  }

  function showShortAnswerResult(q, verdict, feedback){
    const isCorrect = /^correct$/i.test(verdict);
    document.getElementById("verdictLabel").textContent = verdict;
    document.getElementById("verdictLabel").style.color = isCorrect ? "var(--good)" : (/partially/i.test(verdict) ? "var(--gold)" : "var(--bad)");
    document.getElementById("rationaleText").textContent = feedback;
    document.getElementById("rationale").classList.add("show");
    document.getElementById("nextBtn").classList.add("show");
    recordAnswer(q.id, isCorrect);
    renderVitals();
  }

  function showSelfGradeFallback(q){
    document.getElementById("verdictLabel").textContent = "AI unavailable — self-check";
    document.getElementById("rationaleText").innerHTML = `Expected answer: <strong>${escapeHtml(q.expectedAnswer||"(not provided)")}</strong><br><br>Compare with what you wrote, then mark yourself below.`;
    document.getElementById("rationale").classList.add("show");
    const rationale = document.getElementById("rationale");
    const selfBtns = document.createElement("div");
    selfBtns.className = "cta-row";
    selfBtns.style.marginTop = "12px";
    selfBtns.innerHTML = `<button class="btn-primary" id="selfCorrect" style="background:var(--good);">I got it right</button><button class="btn-ghost" id="selfWrong" style="border-color:var(--bad); color:var(--bad);">I got it wrong</button>`;
    rationale.appendChild(selfBtns);
    document.getElementById("selfCorrect").addEventListener("click", ()=>{ recordAnswer(q.id, true); renderVitals(); selfBtns.remove(); document.getElementById("nextBtn").classList.add("show"); });
    document.getElementById("selfWrong").addEventListener("click", ()=>{ recordAnswer(q.id, false); renderVitals(); selfBtns.remove(); document.getElementById("nextBtn").classList.add("show"); });
  }

  function selectAnswer(idx,q){
    if(currentQuiz.answered) return;
    currentQuiz.answered = true;
    const opts = main.querySelectorAll(".option");
    opts.forEach((btn,i)=>{
      btn.setAttribute("disabled","true");
      if(i===q.correct) btn.classList.add("correct");
      else if(i===idx) btn.classList.add("wrong");
    });
    document.getElementById("rationaleText").textContent = q.rationale || "";
    document.getElementById("rationale").classList.add("show");
    document.getElementById("nextBtn").classList.add("show");
    recordAnswer(q.id, idx===q.correct);
    renderVitals();
  }

  function nextQuestion(){
    if(currentQuiz.idx < currentQuiz.queue.length-1){ currentQuiz.idx++; renderQuestion(); }
    else {
      main.innerHTML = `<div class="empty-state"><div class="big">Session complete</div><p>Nice work. Progress is saved automatically.</p><div class="cta-row" style="margin-top:20px;"><button class="btn-primary" id="doneHome">Back to Study</button></div></div>`;
      document.getElementById("doneHome").addEventListener("click", viewStudy);
    }
  }

  function openAddSubjectModal(){
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal-sheet">
        <div class="modal-head"><h3>New Subject</h3><button class="modal-close" id="closeModal">&times;</button></div>
        <div class="field"><label>Subject name</label><input type="text" id="subjName" placeholder="e.g., Cardiac Meds"></div>
        <button class="btn-primary" id="createSubjectBtn" style="width:100%;">Create subject</button>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener("click", e=>{ if(e.target===overlay) overlay.remove(); });
    document.getElementById("closeModal").addEventListener("click", ()=>overlay.remove());
    document.getElementById("createSubjectBtn").addEventListener("click", ()=>{
      const name = document.getElementById("subjName").value.trim();
      if(!name){ alert("Please enter a subject name."); return; }
      const colors = ["#C1584B","#0F3D3E","#C99A3D","#3F7A5C","#6B5B95","#4C6B8A","#B4453B","#8A6D3B"];
      const id = uid();
      state.customSubjects[id] = { id, name, color: colors[Object.keys(state.customSubjects).length % colors.length], createdAt: Date.now() };
      saveProgress();
      overlay.remove();
      openAddQuestionModal(id);
    });
  }

  function openAddQuestionModal(subjectId){
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal-sheet">
        <div class="modal-head"><h3>Add Questions</h3><button class="modal-close" id="closeModal">&times;</button></div>
        <div class="radio-toggle">
          <button class="active" data-mode="form">Form</button>
          <button data-mode="paste">Paste text</button>
        </div>
        <div id="modeArea"></div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener("click", e=>{ if(e.target===overlay) overlay.remove(); });
    document.getElementById("closeModal").addEventListener("click", ()=>{ overlay.remove(); viewStudy(); });

    function renderFormMode(){
      document.getElementById("modeArea").innerHTML = `
        <div class="field"><label>Question</label><textarea id="qText" placeholder="Enter the question"></textarea></div>
        <div class="field"><label>Options (select the correct one)</label>
          <div class="opt-row"><input type="radio" name="correctOpt" class="correct-radio" value="0" checked><input type="text" id="opt0" placeholder="Option A"></div>
          <div class="opt-row"><input type="radio" name="correctOpt" class="correct-radio" value="1"><input type="text" id="opt1" placeholder="Option B"></div>
          <div class="opt-row"><input type="radio" name="correctOpt" class="correct-radio" value="2"><input type="text" id="opt2" placeholder="Option C"></div>
          <div class="opt-row"><input type="radio" name="correctOpt" class="correct-radio" value="3"><input type="text" id="opt3" placeholder="Option D"></div>
        </div>
        <div class="field"><label>Rationale (optional)</label><textarea id="qRationale" placeholder="Why is this the correct answer?"></textarea></div>
        <button class="btn-primary" id="saveQBtn" style="width:100%;">Save question</button>
        <p style="font-size:12px; color:var(--ink-soft); text-align:center; margin-top:10px;">You can add more after saving.</p>
      `;
      document.getElementById("saveQBtn").addEventListener("click", ()=>{
        const qText = document.getElementById("qText").value.trim();
        const opts = [0,1,2,3].map(i=>document.getElementById("opt"+i).value.trim());
        const correct = parseInt(document.querySelector('input[name="correctOpt"]:checked').value,10);
        const rationale = document.getElementById("qRationale").value.trim();
        if(!qText || opts.some(o=>!o)){ alert("Please fill in the question and all 4 options."); return; }
        const qid = uid();
        state.customQuestions[qid] = { id: qid, subjectId, q: qText, options: opts, correct, rationale: rationale || "No rationale provided." };
        saveProgress();
        renderFormMode();
      });
    }
    function renderPasteMode(){
      document.getElementById("modeArea").innerHTML = `
        <div class="field">
          <label>Paste your text</label>
          <textarea id="pasteText" style="min-height:160px;" placeholder="Paste Q&A text. Example per question:&#10;Q: What is...?&#10;A) option 1&#10;B) option 2&#10;C) option 3&#10;D) option 4&#10;Correct: B&#10;Rationale: because..."></textarea>
        </div>
        <button class="btn-primary" id="parseBtn" style="width:100%;">Parse into questions</button>
        <p style="font-size:12px; color:var(--ink-soft); margin-top:10px; line-height:1.5;">Format each question as: a line starting with "Q:", four lines starting "A)" "B)" "C)" "D)", a line "Correct: B" and optionally "Rationale: ...". Separate questions with a blank line.</p>
      `;
      document.getElementById("parseBtn").addEventListener("click", ()=>{
        const text = document.getElementById("pasteText").value;
        const blocks = text.split(/\n\s*\n/).map(b=>b.trim()).filter(Boolean);
        let added = 0;
        blocks.forEach(block=>{
          const lines = block.split("\n").map(l=>l.trim()).filter(Boolean);
          let qText="", opts=["","","",""], correct=0, rationale="";
          lines.forEach(line=>{
            const mQ = line.match(/^Q:\s*(.+)/i);
            const mA = line.match(/^A\)\s*(.+)/i);
            const mB = line.match(/^B\)\s*(.+)/i);
            const mC = line.match(/^C\)\s*(.+)/i);
            const mD = line.match(/^D\)\s*(.+)/i);
            const mCorrect = line.match(/^Correct:\s*([ABCD])/i);
            const mRat = line.match(/^Rationale:\s*(.+)/i);
            if(mQ) qText = mQ[1];
            else if(mA) opts[0] = mA[1];
            else if(mB) opts[1] = mB[1];
            else if(mC) opts[2] = mC[1];
            else if(mD) opts[3] = mD[1];
            else if(mCorrect) correct = {A:0,B:1,C:2,D:3}[mCorrect[1].toUpperCase()];
            else if(mRat) rationale = mRat[1];
          });
          if(qText && opts.every(o=>o)){
            const qid = uid();
            state.customQuestions[qid] = { id: qid, subjectId, q: qText, options: opts, correct, rationale: rationale || "No rationale provided." };
            added++;
          }
        });
        saveProgress();
        if(added>0){ alert(added + " question(s) added."); overlay.remove(); viewStudy(); }
        else alert("Couldn't parse any questions. Please check the format and try again.");
      });
    }
    overlay.querySelectorAll(".radio-toggle button").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        overlay.querySelectorAll(".radio-toggle button").forEach(b=>b.classList.remove("active"));
        btn.classList.add("active");
        if(btn.dataset.mode==="form") renderFormMode(); else renderPasteMode();
      });
    });
    renderFormMode();
  }

  function viewNotes(){
    setActiveNav("notes");
    renderVitals();
    const notes = Object.values(state.notes).sort((a,b)=>b.updatedAt-a.updatedAt);
    let html = `<div class="section-label">Your notes</div>`;
    if(notes.length===0) html += `<div class="empty-state"><div class="big">No notes yet</div><p>Tap + for a note, or the pencil for a sketch.</p></div>`;
    else notes.forEach(n=>{
      const subj = n.subjectId ? catMeta(n.subjectId) : null;
      if(n.type==="sketch"){
        html += `<div class="note-card" data-id="${n.id}">
          ${subj?`<span class="n-tag">${escapeHtml(subj.name)}</span>`:""}
          <div class="n-title">${escapeHtml(n.title||"Untitled sketch")}</div>
          <img class="sketch-thumb" src="${n.dataUrl}" alt="sketch">
        </div>`;
      } else {
        html += `<div class="note-card" data-id="${n.id}">
          ${subj?`<span class="n-tag">${escapeHtml(subj.name)}</span>`:""}
          <div class="n-title">${escapeHtml(n.title||"Untitled")}</div>
          <div class="n-preview">${escapeHtml(n.body||"")}</div>
        </div>`;
      }
    });
    main.innerHTML = html;
    main.querySelectorAll(".note-card").forEach(card=>{
      card.addEventListener("click", ()=>{
        const n = state.notes[card.dataset.id];
        if(n && n.type==="sketch") openSketchEditor(card.dataset.id);
        else openNoteEditor(card.dataset.id);
      });
    });
    removeFab();
    const fab = document.createElement("button");
    fab.className="fab"; fab.textContent="+";
    fab.addEventListener("click", ()=>openNoteEditor(null));
    document.getElementById("app").appendChild(fab);
    const fab2 = document.createElement("button");
    fab2.className="fab fab-secondary"; fab2.textContent="✎";
    fab2.title = "New sketch";
    fab2.addEventListener("click", ()=>openSketchEditor(null));
    document.getElementById("app").appendChild(fab2);
  }

  function openNoteEditor(noteId){
    const existing = noteId ? state.notes[noteId] : null;
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    const subjOptions = allCategoryKeys().map(k=>`<option value="${k}" ${existing&&existing.subjectId===k?"selected":""}>${escapeHtml(catMeta(k).name)}</option>`).join("");
    overlay.innerHTML = `
      <div class="modal-sheet">
        <div class="modal-head"><h3>${existing?"Edit Note":"New Note"}</h3><button class="modal-close" id="closeModal">&times;</button></div>
        <div class="field"><label>Title</label><input type="text" id="noteTitle" value="${existing?escapeHtml(existing.title):""}" placeholder="Note title"></div>
        <div class="field"><label>Subject (optional)</label>
          <select id="noteSubject"><option value="">No subject</option>${subjOptions}</select>
        </div>
        <div class="field"><label>Content</label><textarea id="noteBody" style="min-height:160px;" placeholder="Write your note...">${existing?escapeHtml(existing.body):""}</textarea></div>
        <div class="cta-row">
          <button class="btn-primary" id="saveNoteBtn">Save</button>
          ${existing?`<button class="btn-ghost" id="deleteNoteBtn" style="border-color:var(--bad); color:var(--bad);">Delete</button>`:""}
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener("click", e=>{ if(e.target===overlay) overlay.remove(); });
    document.getElementById("closeModal").addEventListener("click", ()=>overlay.remove());
    document.getElementById("saveNoteBtn").addEventListener("click", ()=>{
      const title = document.getElementById("noteTitle").value.trim();
      const body = document.getElementById("noteBody").value.trim();
      const subjectId = document.getElementById("noteSubject").value || null;
      if(!title && !body){ alert("Please add a title or some content."); return; }
      const id = existing ? existing.id : uid();
      state.notes[id] = { id, title, body, subjectId, updatedAt: Date.now() };
      saveProgress();
      overlay.remove();
      viewNotes();
    });
    const delBtn = document.getElementById("deleteNoteBtn");
    if(delBtn) delBtn.addEventListener("click", ()=>{
      if(confirm("Delete this note?")){ delete state.notes[existing.id]; saveProgress(); overlay.remove(); viewNotes(); }
    });
  }

  // ---- Sketch canvas editor ----
  function openSketchEditor(noteId){
    const existing = noteId ? state.notes[noteId] : null;
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay sketch-modal";
    const subjOptions = allCategoryKeys().map(k=>`<option value="${k}" ${existing&&existing.subjectId===k?"selected":""}>${escapeHtml(catMeta(k).name)}</option>`).join("");
    const colors = ["#3B2430","#B5486E","#5FA88A","#3B6EA5","#E8A23B"];
    overlay.innerHTML = `
      <div class="modal-sheet">
        <div class="modal-head"><h3>${existing?"Edit Sketch":"New Sketch"}</h3><button class="modal-close" id="closeModal">&times;</button></div>
        <div class="field"><input type="text" id="sketchTitle" value="${existing?escapeHtml(existing.title):""}" placeholder="Sketch title"></div>
        <div class="sketch-toolbar">
          <div class="sketch-colors" id="sketchColors">
            ${colors.map((c,i)=>`<div class="sketch-color ${i===0?'active':''}" data-color="${c}" style="background:${c}"></div>`).join("")}
          </div>
          <div class="sketch-size" id="sketchSizes">
            <button data-size="2">S</button><button data-size="5" class="active">M</button><button data-size="10">L</button>
          </div>
          <button class="sketch-tool-btn" id="eraserBtn">Eraser</button>
          <button class="sketch-tool-btn" id="clearBtn">Clear</button>
        </div>
        <div class="sketch-canvas-wrap"><canvas id="sketchCanvas" height="360"></canvas></div>
        <div class="field" style="margin-top:14px;"><label>Subject (optional)</label>
          <select id="sketchSubject"><option value="">No subject</option>${subjOptions}</select>
        </div>
        <div class="cta-row">
          <button class="btn-primary" id="saveSketchBtn">Save</button>
          ${existing?`<button class="btn-ghost" id="deleteSketchBtn" style="border-color:var(--bad); color:var(--bad);">Delete</button>`:""}
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener("click", e=>{ if(e.target===overlay) overlay.remove(); });
    document.getElementById("closeModal").addEventListener("click", ()=>overlay.remove());

    const canvas = document.getElementById("sketchCanvas");
    const wrap = canvas.parentElement;
    const ctx = canvas.getContext("2d");
    let drawColor = colors[0];
    let drawSize = 5;
    let erasing = false;
    let drawing = false;
    let lastX=0, lastY=0;

    function setupCanvasSize(){
      const rect = wrap.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const prevImg = canvas.width>0 ? canvas.toDataURL() : null;
      canvas.width = rect.width * dpr;
      canvas.height = 360 * dpr;
      canvas.style.height = "360px";
      ctx.scale(dpr, dpr);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0,0,rect.width,360);
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      if(prevImg){
        const img = new Image();
        img.onload = ()=> ctx.drawImage(img,0,0,rect.width,360);
        img.src = prevImg;
      } else if(existing && existing.dataUrl){
        const img = new Image();
        img.onload = ()=> ctx.drawImage(img,0,0,rect.width,360);
        img.src = existing.dataUrl;
      }
    }
    setupCanvasSize();
    window.addEventListener("resize", setupCanvasSize);

    function getPos(e){
      const rect = canvas.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      return { x: clientX-rect.left, y: clientY-rect.top };
    }
    function startDraw(e){
      e.preventDefault();
      drawing = true;
      const p = getPos(e); lastX=p.x; lastY=p.y;
      ctx.beginPath(); ctx.moveTo(p.x,p.y);
    }
    function moveDraw(e){
      if(!drawing) return;
      e.preventDefault();
      const p = getPos(e);
      ctx.lineWidth = erasing ? drawSize*3 : drawSize;
      ctx.strokeStyle = erasing ? "#ffffff" : drawColor;
      ctx.lineTo(p.x,p.y); ctx.stroke();
      lastX=p.x; lastY=p.y;
    }
    function endDraw(e){ drawing=false; }

    canvas.addEventListener("pointerdown", startDraw);
    canvas.addEventListener("pointermove", moveDraw);
    window.addEventListener("pointerup", endDraw);
    canvas.addEventListener("touchstart", startDraw, {passive:false});
    canvas.addEventListener("touchmove", moveDraw, {passive:false});
    canvas.addEventListener("touchend", endDraw);

    overlay.querySelectorAll(".sketch-color").forEach(el=>{
      el.addEventListener("click", ()=>{
        overlay.querySelectorAll(".sketch-color").forEach(c=>c.classList.remove("active"));
        el.classList.add("active");
        drawColor = el.dataset.color;
        erasing = false;
        document.getElementById("eraserBtn").classList.remove("active");
      });
    });
    overlay.querySelectorAll("#sketchSizes button").forEach(el=>{
      el.addEventListener("click", ()=>{
        overlay.querySelectorAll("#sketchSizes button").forEach(b=>b.classList.remove("active"));
        el.classList.add("active");
        drawSize = parseInt(el.dataset.size,10);
      });
    });
    document.getElementById("eraserBtn").addEventListener("click", (e)=>{
      erasing = !erasing;
      e.target.classList.toggle("active", erasing);
    });
    document.getElementById("clearBtn").addEventListener("click", ()=>{
      if(confirm("Clear the whole sketch?")){
        const rect = wrap.getBoundingClientRect();
        ctx.fillStyle="#ffffff"; ctx.fillRect(0,0,rect.width,360);
      }
    });
    document.getElementById("saveSketchBtn").addEventListener("click", ()=>{
      const title = document.getElementById("sketchTitle").value.trim();
      const subjectId = document.getElementById("sketchSubject").value || null;
      const dataUrl = canvas.toDataURL("image/png");
      const id = existing ? existing.id : uid();
      state.notes[id] = { id, type:"sketch", title: title||"Untitled sketch", dataUrl, subjectId, updatedAt: Date.now() };
      saveProgress();
      window.removeEventListener("resize", setupCanvasSize);
      overlay.remove();
      viewNotes();
    });
    const delBtn = document.getElementById("deleteSketchBtn");
    if(delBtn) delBtn.addEventListener("click", ()=>{
      if(confirm("Delete this sketch?")){
        delete state.notes[existing.id]; saveProgress();
        window.removeEventListener("resize", setupCanvasSize);
        overlay.remove(); viewNotes();
      }
    });
  }

  function viewSearch(){
    setActiveNav("search");
    renderVitals();
    main.innerHTML = `
      <div class="search-input-wrap"><span class="search-icon">⌕</span><input type="text" id="searchInput" placeholder="Search subjects, notes, questions..."></div>
      <div id="searchResults"></div>
    `;
    const input = document.getElementById("searchInput");
    input.addEventListener("input", ()=> runSearch(input.value.trim().toLowerCase()));
    input.focus();
  }
  function runSearch(term){
    const results = document.getElementById("searchResults");
    if(!term){ results.innerHTML = ""; return; }
    let html = "";
    const subjMatches = allCategoryKeys().filter(k => catMeta(k).name.toLowerCase().includes(term));
    if(subjMatches.length){
      html += `<div class="result-group-label">Subjects</div>`;
      subjMatches.forEach(k=> html += `<div class="result-item" data-nav="study" data-cat="${k}"><div class="r-title">${escapeHtml(catMeta(k).name)}</div></div>`);
    }
    const noteMatches = Object.values(state.notes).filter(n => (n.title||"").toLowerCase().includes(term) || (n.body||"").toLowerCase().includes(term));
    if(noteMatches.length){
      html += `<div class="result-group-label">Notes</div>`;
      noteMatches.forEach(n=> html += `<div class="result-item" data-note="${n.id}"><div class="r-title">${escapeHtml(n.title||"Untitled")}</div><div class="r-sub">${escapeHtml((n.body||"").slice(0,60))}</div></div>`);
    }
    const qMatches = allQuestionsForCat("all").filter(q => q.q.toLowerCase().includes(term)).slice(0,15);
    if(qMatches.length){
      html += `<div class="result-group-label">Questions</div>`;
      qMatches.forEach(q=> html += `<div class="result-item"><div class="r-title">${escapeHtml(q.q.slice(0,80))}</div><div class="r-sub">${escapeHtml(catMeta(q.cat).name)}</div></div>`);
    }
    if(!html) html = `<div class="empty-mini">No results for "${escapeHtml(term)}"</div>`;
    results.innerHTML = html;
    results.querySelectorAll(".result-item[data-nav='study']").forEach(el=>{
      el.addEventListener("click", ()=> startQuiz(el.dataset.cat));
    });
    results.querySelectorAll(".result-item[data-note]").forEach(el=>{
      el.addEventListener("click", ()=>{
        const n = state.notes[el.dataset.note];
        if(n && n.type==="sketch") openSketchEditor(el.dataset.note);
        else openNoteEditor(el.dataset.note);
      });
    });
  }

  function viewSettings(){
    setActiveNav("settings");
    renderVitals();
    main.innerHTML = `
      <div class="section-label">Backup your progress</div>
      <p style="font-size:13.5px; color:var(--ink-soft); line-height:1.5;">Your data is saved on this device only. Export a backup before switching phones or clearing browser data.</p>
      <div class="io-row"><button class="btn-primary" id="exportBtn">Export backup</button><button class="btn-ghost" id="importBtn">Import backup</button></div>
      <input type="file" id="importFile" accept="application/json" style="display:none;">
      <div class="section-label" style="margin-top:30px;">Reset</div>
      <button class="btn-ghost" id="resetBtn" style="width:100%; border-color:var(--bad); color:var(--bad);">Reset all data</button>
      <div class="section-label" style="margin-top:30px;">About</div>
      <p style="font-size:12.5px; color:var(--ink-soft); line-height:1.6;">RN Ready — offline nursing study companion. No account, no ads, no cost. AI study assistant coming in a future update.</p>
    `;
    document.getElementById("exportBtn").addEventListener("click", exportData);
    document.getElementById("importBtn").addEventListener("click", ()=>document.getElementById("importFile").click());
    document.getElementById("importFile").addEventListener("change", importData);
    document.getElementById("resetBtn").addEventListener("click", ()=>{
      if(confirm("This will erase all saved data on this device, including notes and custom subjects. Continue?")){
        state = { items:{}, streak:0, lastStudyDate:null, totalAnswered:0, totalCorrect:0, customSubjects:{}, customQuestions:{}, notes:{} };
        saveProgress();
        viewSettings();
      }
    });
  }
  function exportData(){
    const blob = new Blob([JSON.stringify(state,null,2)], {type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href=url; a.download="rnready-backup-"+todayStr()+".json";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
  function importData(e){
    const file = e.target.files[0]; if(!file) return;
    const reader = new FileReader();
    reader.onload = function(evt){
      try{
        const data = JSON.parse(evt.target.result);
        if(data && typeof data==="object" && data.items){
          data.customSubjects = data.customSubjects || {};
          data.customQuestions = data.customQuestions || {};
          data.notes = data.notes || {};
          state = data; saveProgress(); alert("Backup restored."); viewSettings();
        } else alert("This file doesn't look like a valid backup.");
      }catch(err){ alert("Couldn't read that file."); }
    };
    reader.readAsText(file);
  }

  // ================= AI CHAT =================
  const WORKER_URL = "https://rnready-ai-proxy.billonesbenson.workers.dev/";
  state.chatHistory = state.chatHistory || []; // [{role:'user'|'model', text}]
  let chatBusy = false;

  // ---- Shared: parse AI-generated Q&A text (with optional Source: line) into question objects ----
  function parseAIQuestions(text, subjectId){
    const blocks = text.split(/\n\s*\n/).map(b=>b.trim()).filter(Boolean);
    let added = 0;
    blocks.forEach(block=>{
      const lines = block.split("\n").map(l=>l.trim()).filter(Boolean);
      const isShort = lines.some(l=>/^SA:/i.test(l));

      if(isShort){
        let qText="", expectedAnswer="", sourceHeading="", sourceSnippet="";
        lines.forEach(line=>{
          const mSA = line.match(/^SA:\s*(.+)/i);
          const mAns = line.match(/^Answer:\s*(.+)/i);
          const mSrc = line.match(/^Source:\s*(.+?)\s*—\s*"(.+)"/i) || line.match(/^Source:\s*(.+?)\s*-\s*"(.+)"/i);
          if(mSA) qText = mSA[1];
          else if(mAns) expectedAnswer = mAns[1];
          else if(mSrc){ sourceHeading = mSrc[1]; sourceSnippet = mSrc[2]; }
        });
        if(qText && expectedAnswer){
          const qid = uid();
          state.customQuestions[qid] = { id: qid, subjectId, type:"short", q: qText, expectedAnswer, sourceHeading: sourceHeading||null, sourceSnippet: sourceSnippet||null };
          added++;
        }
        return;
      }

      let qText="", opts=["","","",""], correct=0, rationale="", sourceHeading="", sourceSnippet="";
      lines.forEach(line=>{
        const mQ = line.match(/^Q:\s*(.+)/i);
        const mA = line.match(/^A\)\s*(.+)/i);
        const mB = line.match(/^B\)\s*(.+)/i);
        const mC = line.match(/^C\)\s*(.+)/i);
        const mD = line.match(/^D\)\s*(.+)/i);
        const mCorrect = line.match(/^Correct:\s*([ABCD])/i);
        const mRat = line.match(/^Rationale:\s*(.+)/i);
        const mSrc = line.match(/^Source:\s*(.+?)\s*—\s*"(.+)"/i) || line.match(/^Source:\s*(.+?)\s*-\s*"(.+)"/i);
        if(mQ) qText = mQ[1];
        else if(mA) opts[0] = mA[1];
        else if(mB) opts[1] = mB[1];
        else if(mC) opts[2] = mC[1];
        else if(mD) opts[3] = mD[1];
        else if(mCorrect) correct = {A:0,B:1,C:2,D:3}[mCorrect[1].toUpperCase()];
        else if(mRat) rationale = mRat[1];
        else if(mSrc){ sourceHeading = mSrc[1]; sourceSnippet = mSrc[2]; }
      });
      if(qText && opts.every(o=>o)){
        const qid = uid();
        state.customQuestions[qid] = { id: qid, subjectId, type:"mc", q: qText, options: opts, correct, rationale: rationale || "No rationale provided.", sourceHeading: sourceHeading||null, sourceSnippet: sourceSnippet||null };
        added++;
      }
    });
    return added;
  }

  // ---- Generate study material (no file, topic-based) ----
  function openGenerateModal(){
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    const subjOptions = allCategoryKeys().map(k=>`<option value="${k}">${escapeHtml(catMeta(k).name)}</option>`).join("");
    overlay.innerHTML = `
      <div class="modal-sheet">
        <div class="modal-head"><h3>Generate Study Material</h3><button class="modal-close" id="closeModal">&times;</button></div>
        <div class="field"><label>Topic</label><input type="text" id="genTopic" placeholder="e.g., Insulin types and onset times"></div>
        <div class="field"><label>Save into subject</label>
          <select id="genSubject"><option value="__new__">Create new subject from topic</option>${subjOptions}</select>
        </div>
        <div class="field"><label>How many questions (1-20)</label><input type="text" id="genCount" value="10"></div>
        <div class="field" style="display:flex; align-items:center; gap:8px;">
          <input type="checkbox" id="genShortAnswer" style="width:18px; height:18px;">
          <label style="margin:0; text-transform:none; font-weight:600; font-size:13px; letter-spacing:0;">Include some short-answer questions (AI-graded)</label>
        </div>
        <button class="btn-primary" id="genBtn" style="width:100%;">Generate</button>
        <div class="file-cap-note">Uses your daily AI chat allowance.</div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener("click", e=>{ if(e.target===overlay) overlay.remove(); });
    document.getElementById("closeModal").addEventListener("click", ()=>overlay.remove());
    document.getElementById("genBtn").addEventListener("click", async ()=>{
      const topic = document.getElementById("genTopic").value.trim();
      const count = parseInt(document.getElementById("genCount").value,10) || 10;
      const includeShortAnswer = document.getElementById("genShortAnswer").checked;
      let subjectId = document.getElementById("genSubject").value;
      if(!topic){ alert("Please enter a topic."); return; }
      if(subjectId === "__new__"){
        const colors = ["#C1584B","#0F3D3E","#C99A3D","#3F7A5C","#6B5B95","#4C6B8A","#B4453B","#8A6D3B"];
        const id = uid();
        state.customSubjects[id] = { id, name: topic.slice(0,40), color: colors[Object.keys(state.customSubjects).length % colors.length], createdAt: Date.now() };
        subjectId = id;
        saveProgress();
      }
      const sheet = overlay.querySelector(".modal-sheet");
      sheet.innerHTML = `<div class="analyze-progress"><div class="spinner"></div><div class="stage">Generating questions...</div></div>`;
      try{
        const res = await fetch(WORKER_URL, {
          method:"POST", headers:{"Content-Type":"application/json"},
          body: JSON.stringify({ mode:"generate", topic, count, subjectId, includeShortAnswer })
        });
        const data = await res.json();
        if(!res.ok){ let m=data.message||"Something went wrong."; if(data.detail) m+="\n\n[Debug: "+data.detail+"]"; alert(m); overlay.remove(); return; }
        const added = parseAIQuestions(data.reply, subjectId);
        saveProgress();
        overlay.remove();
        if(added>0){
          const note = added < count ? ` (you asked for ${count} — the AI produced ${added}; you can generate again to add more)` : "";
          alert(added + " question(s) generated and saved." + note);
          viewStudy();
        }
        else alert("Couldn't parse the generated questions.\n\n[Raw AI reply:]\n" + (data.reply||"(empty)").slice(0,800));
      }catch(err){
        alert("Couldn't reach the study assistant. Check your connection.");
        overlay.remove();
      }
    });
  }

  // ---- PDF text extraction with lightweight heading detection ----
  async function extractPdfSections(file){
    const arrayBuf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuf }).promise;
    const maxPages = Math.min(pdf.numPages, 60);
    let allItems = [];
    for(let p=1; p<=maxPages; p++){
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      content.items.forEach(item=>{
        const fontSize = Math.abs(item.transform[0]) || 10;
        allItems.push({ text: item.str, fontSize, page: p });
      });
    }
    if(allItems.length===0) return [];
    const sizes = allItems.map(i=>i.fontSize).filter(s=>s>0);
    sizes.sort((a,b)=>a-b);
    const median = sizes[Math.floor(sizes.length/2)] || 10;
    const headingThreshold = median * 1.25;

    const sections = [];
    let current = { heading: "Introduction", text: "" };
    allItems.forEach(item=>{
      const t = item.text.trim();
      if(!t) return;
      const isHeading = item.fontSize >= headingThreshold && t.length < 80 && t.length > 2;
      if(isHeading){
        if(current.text.trim().length > 30) sections.push(current);
        current = { heading: t, text: "" };
      } else {
        current.text += t + " ";
      }
    });
    if(current.text.trim().length > 30) sections.push(current);
    return sections;
  }

  function openAnalyzeModal(){
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    const subjOptions = allCategoryKeys().map(k=>`<option value="${k}">${escapeHtml(catMeta(k).name)}</option>`).join("");
    overlay.innerHTML = `
      <div class="modal-sheet">
        <div class="modal-head"><h3>Analyze a File</h3><button class="modal-close" id="closeModal">&times;</button></div>
        <div class="analyze-drop" id="dropZone">Tap to choose a PDF (typed text, not scanned — up to ~50 pages)</div>
        <input type="file" id="pdfInput" accept="application/pdf" style="display:none;">
        <div class="field"><label>Save into subject</label>
          <select id="anaSubject"><option value="__new__">Create new subject from file name</option>${subjOptions}</select>
        </div>
        <div class="field"><label>How many questions (1-15)</label><input type="text" id="anaCount" value="12"></div>
        <div class="field" style="display:flex; align-items:center; gap:8px;">
          <input type="checkbox" id="anaShortAnswer" style="width:18px; height:18px;">
          <label style="margin:0; text-transform:none; font-weight:600; font-size:13px; letter-spacing:0;">Include some short-answer questions (AI-graded)</label>
        </div>
        <button class="btn-primary" id="anaBtn" style="width:100%;" disabled>Choose a file first</button>
        <div class="file-cap-note">Limited file analysis sessions per day — one chapter/lecture at a time works best.</div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener("click", e=>{ if(e.target===overlay) overlay.remove(); });
    document.getElementById("closeModal").addEventListener("click", ()=>overlay.remove());

    let selectedFile = null;
    const dropZone = document.getElementById("dropZone");
    const pdfInput = document.getElementById("pdfInput");
    const anaBtn = document.getElementById("anaBtn");
    dropZone.addEventListener("click", ()=> pdfInput.click());
    pdfInput.addEventListener("change", ()=>{
      const file = pdfInput.files[0];
      if(!file) return;
      if(file.size > 20*1024*1024){ alert("File is quite large — try a smaller chapter/section for best results."); }
      selectedFile = file;
      dropZone.textContent = "Selected: " + file.name;
      dropZone.classList.add("has-file");
      anaBtn.disabled = false;
      anaBtn.textContent = "Analyze & generate flashcards";
    });

    anaBtn.addEventListener("click", async ()=>{
      if(!selectedFile) return;
      const count = parseInt(document.getElementById("anaCount").value,10) || 12;
      const includeShortAnswer = document.getElementById("anaShortAnswer").checked;
      let subjectId = document.getElementById("anaSubject").value;
      const sheet = overlay.querySelector(".modal-sheet");
      sheet.innerHTML = `<div class="analyze-progress"><div class="spinner"></div><div class="stage" id="stageText">Reading PDF...</div></div>`;
      try{
        const sections = await extractPdfSections(selectedFile);
        if(sections.length===0){ alert("Couldn't read text from this PDF. It may be scanned/image-based, which isn't supported yet."); overlay.remove(); return; }
        if(subjectId === "__new__"){
          const colors = ["#C1584B","#0F3D3E","#C99A3D","#3F7A5C","#6B5B95","#4C6B8A","#B4453B","#8A6D3B"];
          const id = uid();
          state.customSubjects[id] = { id, name: selectedFile.name.replace(/\.pdf$/i,"").slice(0,40), color: colors[Object.keys(state.customSubjects).length % colors.length], createdAt: Date.now() };
          subjectId = id;
          saveProgress();
        }
        const stageEl = document.getElementById("stageText");
        if(stageEl) stageEl.textContent = "Generating flashcards from content...";
        const res = await fetch(WORKER_URL, {
          method:"POST", headers:{"Content-Type":"application/json"},
          body: JSON.stringify({ mode:"analyze", sections, count, subjectId, includeShortAnswer })
        });
        const data = await res.json();
        if(!res.ok){ let m=data.message||"Something went wrong."; if(data.detail) m+="\n\n[Debug: "+data.detail+"]"; alert(m); overlay.remove(); return; }
        const added = parseAIQuestions(data.reply, subjectId);
        saveProgress();
        overlay.remove();
        if(added>0){
          const note = added < count ? ` (asked for ${count}, generated ${added} — try analyzing again to add more from the same file)` : "";
          alert(added + " question(s) added, with source references." + note);
          viewStudy();
        }
        else alert("Couldn't parse the generated questions.\n\n[Raw AI reply:]\n" + (data.reply||"(empty)").slice(0,800));
      }catch(err){
        alert("Something went wrong reading or analyzing this file.\n\n[Debug: " + (err && err.message ? err.message : String(err)) + "]");
        overlay.remove();
      }
    });
  }

  function viewChat(){
    setActiveNav("chat");
    renderVitals();
    main.innerHTML = `
      <div class="chat-wrap">
        <div class="chat-log" id="chatLog"></div>
        <div>
          <div class="chat-input-row">
            <textarea id="chatInput" rows="1" placeholder="Ask about a topic, or say 'quiz me on...'"></textarea>
            <button class="chat-send" id="chatSend">↑</button>
          </div>
          <div class="chat-limit">Study assistant · limited free messages per day</div>
        </div>
      </div>
    `;
    renderChatLog();
    const input = document.getElementById("chatInput");
    document.getElementById("chatSend").addEventListener("click", sendChatMessage);
    input.addEventListener("keydown", e=>{
      if(e.key==="Enter" && !e.shiftKey){ e.preventDefault(); sendChatMessage(); }
    });
    input.addEventListener("input", ()=>{ input.style.height="auto"; input.style.height=Math.min(100,input.scrollHeight)+"px"; });
  }

  function renderChatLog(){
    const log = document.getElementById("chatLog");
    if(!log) return;
    if(state.chatHistory.length===0){
      log.innerHTML = `<div class="msg system">Hi! I'm your study assistant. Ask me to explain a topic, quiz you, or help summarize something you're studying.</div>`;
    } else {
      log.innerHTML = state.chatHistory.map(m=>
        `<div class="msg ${m.role==='user'?'user':'ai'}">${escapeHtml(m.text)}</div>`
      ).join("");
    }
    log.scrollTop = log.scrollHeight;
  }

  function addTypingIndicator(){
    const log = document.getElementById("chatLog");
    if(!log) return;
    const el = document.createElement("div");
    el.className = "msg ai"; el.id = "typingIndicator";
    el.innerHTML = `<span class="typing-dots"><span></span><span></span><span></span></span>`;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
  }
  function removeTypingIndicator(){
    const el = document.getElementById("typingIndicator");
    if(el) el.remove();
  }

  async function sendChatMessage(){
    if(chatBusy) return;
    const input = document.getElementById("chatInput");
    const text = input.value.trim();
    if(!text) return;
    input.value = ""; input.style.height="auto";
    chatBusy = true;
    document.getElementById("chatSend").setAttribute("disabled","true");

    state.chatHistory.push({role:"user", text});
    saveProgress();
    renderChatLog();
    addTypingIndicator();

    try{
      const res = await fetch(WORKER_URL, {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          mode: "chat",
          message: text,
          history: state.chatHistory.slice(-11,-1)
        })
      });
      const data = await res.json();
      removeTypingIndicator();
      if(!res.ok){
        let msg = data.message || "Something went wrong. Please try again.";
        if(data.detail){ msg += "\n\n[Debug detail: " + data.detail + "]"; }
        state.chatHistory.push({role:"model", text: msg});
      } else {
        state.chatHistory.push({role:"model", text: data.reply});
      }
      saveProgress();
      renderChatLog();
    }catch(err){
      removeTypingIndicator();
      state.chatHistory.push({role:"model", text:"Couldn't reach the study assistant. Check your internet connection and try again."});
      saveProgress();
      renderChatLog();
    }finally{
      chatBusy = false;
      const sendBtn = document.getElementById("chatSend");
      if(sendBtn) sendBtn.removeAttribute("disabled");
    }
  }

  function removeFab(){ document.querySelectorAll(".fab").forEach(f=>f.remove()); }
  navBtns.forEach(btn=>{
    btn.addEventListener("click", ()=>{
      removeFab();
      const v = btn.dataset.view;
      if(v==="home") viewHome();
      else if(v==="study") viewStudy();
      else if(v==="chat") viewChat();
      else if(v==="notes") viewNotes();
      else if(v==="search") viewSearch();
      else if(v==="settings") viewSettings();
    });
  });

  if("serviceWorker" in navigator){
    window.addEventListener("load", ()=>{ navigator.serviceWorker.register("sw.js").catch(()=>{}); });
  }

  viewHome();
})();
