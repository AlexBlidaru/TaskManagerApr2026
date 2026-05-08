/* ═══════════════════════════════════════════════
   TASK MANAGER — script
═══════════════════════════════════════════════ */

/* ── STATUS ── */
const STATUS_LIST = [
  {value:'1-ME On Going',     label:'1 · ME: On Going',     cls:'s1'},
  {value:'2-Others On Going', label:'2 · Others: On Going', cls:'s2'},
  {value:'3-Not Started',     label:'3 · Not Started',      cls:'s3'},
  {value:'4-Follow Up',       label:'4 · Follow Up',        cls:'s4'},
  {value:'5-Delayed',         label:'5 · Delayed',          cls:'s5'},
  {value:'Done',              label:'✓  Done',               cls:'s6'},
];
function getStatusCls(v){const s=STATUS_LIST.find(s=>s.value===v);return s?s.cls:'s3';}

/* ── STATE ── */
let tasks=[], collapsedSet=new Set();
let currentFilter='todo';
let currentWorkspace='job';
let sortSettings={col:2,dir:1};   // default: Status asc
let activeTaskId=null;
let dragId=null;

const DAILY_MSG = "Cum merge treaba? 💪 Nu uita să marchezi task-urile finalizate și să verifici deadline-urile de azi!";

/* ══════════════════════════════════════════════
   BOOT
══════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded',()=>{
  initSortHeaders();
  initResizers();
  initSlicer();
  initWorkspaceSlicer();
  autoAdjustNameCol();
  document.getElementById('addTaskBtn').addEventListener('click', addTopTask);
  loadData().then(()=>{ renderTasks(); });
  initDailyToast();
});

/* ══════════════════════════════════════════════
   STORAGE — Cloudflare KV via Pages Functions
   API: GET/POST /api/tasks?workspace=job|personal
   Falls back to localStorage if API unavailable.
══════════════════════════════════════════════ */

let _saveTimer = null;   // debounce timer for cloud saves
let _syncing   = false;  // prevent concurrent saves

/* Show/hide a small sync badge in the header */
function setSyncStatus(state) {
  let badge = document.getElementById('sync-badge');
  if (!badge) {
    badge = document.createElement('span');
    badge.id = 'sync-badge';
    badge.style.cssText = 'font-size:11px;font-weight:600;padding:3px 9px;border-radius:20px;margin-left:6px;transition:all .3s;';
    const h1 = document.getElementById('workspaceTitle');
    if (h1) h1.after(badge);
  }
  const cfg = {
    saving: ['💾 Saving…', '#fef3c7','#92400e'],
    ok:     ['☁ Saved',   '#dcfce7','#166534'],
    err:    ['⚠ Offline — local only', '#fee2e2','#b91c1c'],
    load:   ['⏳ Loading…','#dbeafe','#1d4ed8'],
  };
  const [txt, bg, color] = cfg[state] || cfg.ok;
  badge.textContent = txt;
  badge.style.background = bg;
  badge.style.color = color;
  if (state === 'ok') setTimeout(() => { if(badge) badge.style.opacity='0'; }, 3000);
  else badge.style.opacity = '1';
}

/* Migrate / normalize a task object */
function migrateTask(t) {
  if (!t.status)          t.status = '3-Not Started';
  if (!t.commentHistory)  t.commentHistory = [];
  if (!t.photos)          t.photos = [];
  if (!t.notes)           t.notes = '';
  if (!t.hasOwnProperty('order')) t.order = t.id;
  if (!t.hasOwnProperty('focus')) t.focus = false;
  if (!t.hasOwnProperty('done'))  t.done  = t.status === 'Done';
  if (t.comment && t.comment.trim() && t.commentHistory.length === 0) {
    t.commentHistory.push({ text: t.comment, ts: t.id });
  }
  return t;
}

/* ── LOAD ── */
async function loadData() {
  setSyncStatus('load');
  try {
    if (currentWorkspace === 'focus') {
      const [j, p] = await Promise.all([
        fetchWorkspace('job'),
        fetchWorkspace('personal'),
      ]);
      tasks = [...j, ...p];
    } else {
      tasks = await fetchWorkspace(currentWorkspace);
    }
    tasks.forEach(migrateTask);
    tasks.filter(t => !t.parentId).forEach(t => collapsedSet.add(t.id));
    setSyncStatus('ok');
  } catch(e) {
    console.warn('Cloud load failed, falling back to localStorage:', e);
    loadFromLocal();
    setSyncStatus('err');
  }
}

async function fetchWorkspace(ws) {
  const res = await fetch(`/api/tasks?workspace=${ws}`);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

function loadFromLocal() {
  try {
    if (currentWorkspace === 'focus') {
      const j = JSON.parse(localStorage.getItem('taskManager_job')      || '[]');
      const p = JSON.parse(localStorage.getItem('taskManager_personal') || '[]');
      tasks = [...j, ...p];
    } else {
      const key = currentWorkspace === 'personal' ? 'taskManager_personal' : 'taskManager_job';
      tasks = JSON.parse(localStorage.getItem(key) || '[]');
    }
    tasks.forEach(migrateTask);
    tasks.filter(t => !t.parentId).forEach(t => collapsedSet.add(t.id));
  } catch(e) { tasks = []; }
}

/* ── SAVE ── (debounced 600ms) */
function saveData() {
  // Always mirror to localStorage as instant backup
  _saveToLocal();
  // Debounce cloud save
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(_saveToCloud, 600);
}

function _saveToLocal() {
  if (currentWorkspace === 'focus') {
    localStorage.setItem('taskManager_job',      JSON.stringify(tasks.filter(t => t.workspace === 'job' || !t.workspace)));
    localStorage.setItem('taskManager_personal', JSON.stringify(tasks.filter(t => t.workspace === 'personal')));
  } else {
    tasks.forEach(t => t.workspace = currentWorkspace);
    const key = currentWorkspace === 'personal' ? 'taskManager_personal' : 'taskManager_job';
    localStorage.setItem(key, JSON.stringify(tasks));
  }
}

async function _saveToCloud() {
  if (_syncing) { _saveTimer = setTimeout(_saveToCloud, 400); return; }
  _syncing = true;
  setSyncStatus('saving');
  try {
    if (currentWorkspace === 'focus') {
      const j = tasks.filter(t => t.workspace === 'job'      || !t.workspace);
      const p = tasks.filter(t => t.workspace === 'personal');
      await Promise.all([
        pushWorkspace('job',      j),
        pushWorkspace('personal', p),
      ]);
    } else {
      await pushWorkspace(currentWorkspace, tasks);
    }
    setSyncStatus('ok');
  } catch(e) {
    console.warn('Cloud save failed:', e);
    setSyncStatus('err');
  } finally {
    _syncing = false;
  }
}

async function pushWorkspace(ws, data) {
  const res = await fetch(`/api/tasks?workspace=${ws}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(data),
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
}

function saveAndRender() { saveData(); renderTasks(); }

/* ══════════════════════════════════════════════
   RENDER
══════════════════════════════════════════════ */
function renderTasks(){
  const tbody=document.getElementById('taskBody');
  tbody.innerHTML='';
  const rows=buildVisibleList();
  if(rows.length===0){
    const tr=document.createElement('tr');
    tr.innerHTML=`<td colspan="8" style="text-align:center;padding:48px;color:#94a3b8;font-size:13px">No tasks — click <strong>Add Task</strong> to start.</td>`;
    tbody.appendChild(tr);
  } else {
    rows.forEach(t=>buildRow(t,tbody));
  }
  // Sort arrows
  document.querySelectorAll('.sort-arrow').forEach(el=>{
    const c=parseInt(el.dataset.col);
    el.className='sort-arrow';
    if(sortSettings.col===c) el.classList.add(sortSettings.dir===1?'asc':'desc');
  });
  initDragDrop();
}

function buildVisibleList(){
  const colKeys=['name','comment','status','dueDate'];

  // For Focus: show focused TOP-LEVEL tasks + ALL their subtasks
  if(currentWorkspace==='focus'){
    const colKeys=['name','comment','status','dueDate'];
    // Only top-level tasks can be focused; show them + all children
    let tops=tasks.filter(t=>!t.parentId && t.focus).sort((a,b)=>a.order-b.order);
    if(sortSettings.col!==null){
      const key=colKeys[sortSettings.col];
      tops=tops.sort((a,b)=>(a[key]||'').toString().toLowerCase().localeCompare((b[key]||'').toString().toLowerCase())*sortSettings.dir);
    }
    const result=[];
    tops.forEach(task=>{
      if(currentFilter==='done'&&!task.done)return;
      if(currentFilter==='todo'&&task.done)return;
      result.push(task);
      if(collapsedSet.has(task.id))return;
      const subs1=tasks.filter(t=>t.parentId===task.id).sort((a,b)=>a.order-b.order);
      subs1.forEach(s1=>{
        if(currentFilter==='done'&&!s1.done)return;
        if(currentFilter==='todo'&&s1.done)return;
        result.push(s1);
        if(collapsedSet.has(s1.id))return;
        tasks.filter(t=>t.parentId===s1.id).sort((a,b)=>a.order-b.order).forEach(s2=>{
          if(currentFilter==='done'&&!s2.done)return;
          if(currentFilter==='todo'&&s2.done)return;
          result.push(s2);
        });
      });
    });
    return result;
  }

  let tops=tasks.filter(t=>!t.parentId).sort((a,b)=>a.order-b.order);
  if(sortSettings.col!==null){
    const key=colKeys[sortSettings.col];
    tops=tops.sort((a,b)=>(a[key]||'').toString().toLowerCase().localeCompare((b[key]||'').toString().toLowerCase())*sortSettings.dir);
  }
  const result=[];
  tops.forEach(task=>{
    if(!matchFilter(task))return;
    result.push(task);
    if(collapsedSet.has(task.id))return;
    const subs1=tasks.filter(t=>t.parentId===task.id).sort((a,b)=>a.order-b.order);
    subs1.forEach(s1=>{
      if(!matchFilter(s1))return;
      result.push(s1);
      if(collapsedSet.has(s1.id))return;
      tasks.filter(t=>t.parentId===s1.id).sort((a,b)=>a.order-b.order).forEach(s2=>{if(matchFilter(s2))result.push(s2);});
    });
  });
  return result;
}

function matchFilter(t){
  if(currentFilter==='done') return t.done;
  if(currentFilter==='todo') return !t.done;
  return true;
}

/* ══════════════════════════════════════════════
   BUILD ROW
══════════════════════════════════════════════ */
function buildRow(task,tbody){
  const tr=document.createElement('tr');
  tr.dataset.id=task.id;
  const lvlCls=['row-task','row-sub1','row-sub2'][task.level]||'row-sub2';
  tr.className=lvlCls;
  if(task.done) tr.classList.add('row-done');

  const indent=task.level*22;
  const hasChildren=tasks.some(t=>t.parentId===task.id);
  const collapsed=collapsedSet.has(task.id);
  const canParent=task.level<2;
  const hasDetails=(task.commentHistory?.length>0)||!!task.notes?.trim();

  let toggleHtml=canParent
    ?`<button class="toggle-btn${hasChildren?' has-children':''}" onclick="toggleCollapse(${task.id})" title="${collapsed?'Expand':'Collapse'}">${collapsed?'+':'−'}</button>`
    :`<div class="toggle-placeholder"></div>`;

  // NAME CELL
  const tdName=document.createElement('td');
  tdName.innerHTML=`
    <div class="cell-name">
      <div class="check-box ${task.done?'checked':''}" onclick="toggleDone(${task.id})" title="Mark done"></div>
      ${toggleHtml}
      <div class="name-wrap" style="padding-left:${indent}px">
        <textarea class="name-area" rows="1" placeholder="Task name…"
          onchange="updateField(${task.id},'name',this.value)"
          oninput="autoResize(this)">${esc(task.name)}</textarea>
      </div>
      ${canParent?`<button class="btn-add-child" onclick="addChild(${task.id},${task.level})" title="Add sub-task">+</button>`:''}
      ${task.level===0?`<button class="btn-focus ${task.focus?'focused':''}" onclick="toggleFocus(${task.id})" title="Mark as Focus">⭐</button>`:''}
    </div>`;

  // COMMENT CELL
  const latestCmt=task.commentHistory?.length?task.commentHistory[task.commentHistory.length-1].text:(task.comment||'');
  const tdComment=document.createElement('td');
  tdComment.innerHTML=`<textarea class="comment-area" rows="1"
    onchange="updateComment(${task.id},this.value)"
    oninput="autoResize(this)">${esc(latestCmt)}</textarea>`;

  // DETAILS
  const tdDetails=document.createElement('td');
  tdDetails.innerHTML=`<button class="btn-details ${hasDetails?'has-content':''}" onclick="openModal(${task.id})" title="Pics / Details">
    <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 3a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm1 7H7V7h2v4z"/></svg>
  </button>`;

  // STATUS
  const sCls=task.done?'s6':getStatusCls(task.status);
  const opts=STATUS_LIST.map(s=>`<option value="${s.value}" ${task.status===s.value?'selected':''}>${s.label}</option>`).join('');
  const tdStatus=document.createElement('td');
  tdStatus.innerHTML=`<select class="status-select ${sCls}" onchange="updateStatus(${task.id},this)">${opts}</select>`;

  // DATE
  const tdDate=document.createElement('td');
  tdDate.innerHTML=`<input type="date" class="date-input" value="${task.dueDate||''}" onchange="updateField(${task.id},'dueDate',this.value)">`;

  // TIME LEFT
  const tdTime=document.createElement('td');
  tdTime.innerHTML=`<div class="time-cell">${timeLeft(task.dueDate,task.done)}</div>`;

  // DRAG
  const tdDrag=document.createElement('td');
  tdDrag.innerHTML=`<div class="drag-handle" draggable="true" title="Drag to reorder">⠿</div>`;

  // DELETE
  const tdDel=document.createElement('td');
  tdDel.innerHTML=`<button class="btn-delete" onclick="deleteTask(${task.id})" title="Delete">
    <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
      <path d="M6 2a1 1 0 0 0-1 1v.5H2.5a.5.5 0 0 0 0 1h.5l.5 9A1.5 1.5 0 0 0 5 15h6a1.5 1.5 0 0 0 1.5-1.5l.5-9h.5a.5.5 0 0 0 0-1H11V3a1 1 0 0 0-1-1H6zm1 1h2v.5H7V3zM4.5 5h7l-.5 8.5a.5.5 0 0 1-.5.5H5.5a.5.5 0 0 1-.5-.5L4.5 5z"/>
    </svg>
  </button>`;

  [tdName,tdComment,tdDetails,tdStatus,tdDate,tdTime,tdDrag,tdDel].forEach(td=>tr.appendChild(td));
  tbody.appendChild(tr);
  tr.querySelectorAll('textarea').forEach(autoResize);
}

/* ══════════════════════════════════════════════
   TASK MUTATIONS
══════════════════════════════════════════════ */
function addTopTask(){
  const id=Date.now();
  tasks.push({id,parentId:null,level:0,name:'',comment:'',status:'3-Not Started',dueDate:'',done:false,commentHistory:[],photos:[],notes:'',order:id,focus:false,workspace:currentWorkspace});
  saveAndRender();
  setTimeout(()=>{
    const rows=document.querySelectorAll('#taskBody tr');
    if(rows.length){const ta=rows[rows.length-1].querySelector('textarea.name-area');if(ta)ta.focus();}
  },40);
}

function addChild(parentId,parentLevel){
  const id=Date.now();
  tasks.push({id,parentId,level:parentLevel+1,name:'',comment:'',status:'3-Not Started',dueDate:'',done:false,commentHistory:[],photos:[],notes:'',order:id,focus:false,workspace:currentWorkspace});
  collapsedSet.delete(parentId);
  saveAndRender();
}

function toggleDone(id){
  const t=tasks.find(t=>t.id===id);if(!t)return;
  t.done=!t.done;t.status=t.done?'Done':'3-Not Started';
  saveAndRender();
}

function updateField(id,field,value){
  const t=tasks.find(t=>t.id===id);if(!t)return;
  t[field]=value;saveData();
  if(field==='dueDate')renderTasks();
}

function updateComment(id,value){
  const t=tasks.find(t=>t.id===id);if(!t)return;
  t.comment=value;
  if(t.commentHistory&&t.commentHistory.length>0){
    t.commentHistory[t.commentHistory.length-1].text=value;
  } else {
    if(!t.commentHistory)t.commentHistory=[];
    if(value.trim())t.commentHistory.push({text:value,ts:Date.now()});
  }
  saveData();
}

function updateStatus(id,sel){
  const t=tasks.find(t=>t.id===id);if(!t)return;
  t.status=sel.value;t.done=(sel.value==='Done');
  sel.className='status-select '+(t.done?'s6':getStatusCls(t.status));
  const row=sel.closest('tr');
  if(row){row.classList.toggle('row-done',t.done);const cb=row.querySelector('.check-box');if(cb)cb.classList.toggle('checked',t.done);}
  saveData();
}

function toggleFocus(id){
  const t=tasks.find(t=>t.id===id);if(!t)return;
  // Focus is only meaningful on top-level tasks
  if(t.parentId!==null)return;
  t.focus=!t.focus;
  saveData();renderTasks();
}

function deleteTask(id){
  if(!confirm('Delete this task and all its sub-tasks?'))return;
  const del=new Set();
  const collect=tid=>{del.add(tid);tasks.filter(t=>t.parentId===tid).forEach(c=>collect(c.id));};
  collect(id);
  tasks=tasks.filter(t=>!del.has(t.id));
  collapsedSet.delete(id);
  if(activeTaskId&&del.has(activeTaskId))closeDetailsModal();
  saveAndRender();
}

/* ══════════════════════════════════════════════
   COLLAPSE / SORT / FILTER / RESIZE
══════════════════════════════════════════════ */
function toggleCollapse(id){collapsedSet.has(id)?collapsedSet.delete(id):collapsedSet.add(id);renderTasks();}

function initSortHeaders(){
  document.querySelectorAll('th[data-col]').forEach(th=>{
    th.addEventListener('click',e=>{
      if(e.target.classList.contains('resizer'))return;
      const col=parseInt(th.dataset.col);
      if(sortSettings.col===col)sortSettings.dir*=-1;
      else{sortSettings.col=col;sortSettings.dir=1;}
      renderTasks();
    });
  });
}

function initSlicer(){
  document.querySelectorAll('#statusSlicer .slicer-opt').forEach(btn=>{
    btn.addEventListener('click',()=>{
      document.querySelectorAll('#statusSlicer .slicer-opt').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter=btn.dataset.value;
      renderTasks();
    });
  });
}

function initWorkspaceSlicer(){
  document.querySelectorAll('#workspaceSlicer .slicer-opt').forEach(btn=>{
    btn.addEventListener('click',()=>{
      document.querySelectorAll('#workspaceSlicer .slicer-opt').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      currentWorkspace=btn.dataset.value;
      // reset to Active filter
      document.querySelectorAll('#statusSlicer .slicer-opt').forEach(b=>b.classList.remove('active'));
      document.querySelector('#statusSlicer .slicer-opt[data-value="todo"]').classList.add('active');
      currentFilter='todo';
      // update title
      const titles={job:'💼 Job Tasks',personal:'🏠 Personale',focus:'🎯 Focus'};
      document.getElementById('workspaceTitle').textContent=titles[currentWorkspace]||'Tasks';
      closeDetailsModal();
      collapsedSet.clear();
      sortSettings={col:2,dir:1};
      loadData().then(()=>renderTasks());
    });
  });
}

function initResizers(){
  document.querySelectorAll('th.resizable').forEach(th=>{
    const rz=th.querySelector('.resizer');if(!rz)return;
    let startX,startW;
    rz.addEventListener('mousedown',e=>{
      e.preventDefault();startX=e.pageX;startW=th.offsetWidth;rz.classList.add('active');
      const move=e=>{th.style.width=Math.max(80,startW+e.pageX-startX)+'px';};
      const up=()=>{rz.classList.remove('active');document.removeEventListener('mousemove',move);};
      document.addEventListener('mousemove',move);
      document.addEventListener('mouseup',up,{once:true});
    });
  });
}

function autoAdjustNameCol(){
  const th=document.querySelector('th.col-name');
  if(th)th.style.width=Math.max(200,Math.min(500,Math.round(window.innerWidth*.30)))+'px';
}

/* ══════════════════════════════════════════════
   DRAG & DROP
══════════════════════════════════════════════ */
function initDragDrop(){
  const tbody=document.getElementById('taskBody');
  tbody.querySelectorAll('.drag-handle').forEach(handle=>{
    const row=handle.closest('tr');
    const id=parseInt(row.dataset.id);
    handle.addEventListener('dragstart',e=>{dragId=id;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',String(id));setTimeout(()=>row.classList.add('dragging'),0);});
    handle.addEventListener('dragend',()=>{row.classList.remove('dragging');tbody.querySelectorAll('tr').forEach(r=>r.classList.remove('drag-over'));dragId=null;});
  });
  tbody.querySelectorAll('tr').forEach(row=>{
    row.addEventListener('dragover',e=>{e.preventDefault();e.dataTransfer.dropEffect='move';const tid=parseInt(row.dataset.id);if(tid===dragId)return;tbody.querySelectorAll('tr').forEach(r=>r.classList.remove('drag-over'));row.classList.add('drag-over');});
    row.addEventListener('dragleave',()=>row.classList.remove('drag-over'));
    row.addEventListener('drop',e=>{
      e.preventDefault();const targetId=parseInt(row.dataset.id);
      if(!dragId||dragId===targetId)return;
      const src=tasks.find(t=>t.id===dragId),tgt=tasks.find(t=>t.id===targetId);
      if(!src||!tgt||src.parentId!==tgt.parentId){row.classList.remove('drag-over');return;}
      const siblings=tasks.filter(t=>t.parentId===src.parentId).sort((a,b)=>a.order-b.order);
      const without=siblings.filter(t=>t.id!==dragId);
      let tgtIdx=without.findIndex(t=>t.id===targetId);
      const rect=row.getBoundingClientRect();
      if(e.clientY>rect.top+rect.height/2)tgtIdx++;
      without.splice(tgtIdx,0,src);
      without.forEach((t,i)=>t.order=i*10);
      row.classList.remove('drag-over');
      saveAndRender();
    });
  });
}

/* ══════════════════════════════════════════════
   TIME LEFT
══════════════════════════════════════════════ */
function timeLeft(dateStr,done){
  if(!dateStr)return'<span style="color:#cbd5e1">—</span>';
  if(done)return'<span style="color:#22c55e;font-weight:600">Done ✓</span>';
  const today=new Date();today.setHours(0,0,0,0);
  const due=new Date(dateStr);
  const diff=Math.ceil((due-today)/86400000);
  if(diff<0) return`<span class="time-late">−${Math.abs(diff)}d late</span>`;
  if(diff===0)return`<span class="time-today">Today!</span>`;
  if(diff<=3) return`<span class="time-warn">${diff}d left</span>`;
  return`<span class="time-ok">${diff}d left</span>`;
}

/* ══════════════════════════════════════════════
   DETAILS MODAL
══════════════════════════════════════════════ */
function openModal(id){
  activeTaskId=id;const t=tasks.find(t=>t.id===id);if(!t)return;
  document.getElementById('dmTitle').textContent=t.name||'Untitled Task';
  document.getElementById('newCommentInput').value='';
  document.getElementById('dmNotes').value=t.notes||'';
  renderCommentHistory(t);renderPhotosGrid(t);
  document.getElementById('detailsOverlay').classList.add('open');
  setTimeout(()=>document.getElementById('newCommentInput').focus(),180);
}

function closeDetailsModal(){
  document.getElementById('detailsOverlay').classList.remove('open');
  activeTaskId=null;renderTasks();
}
function overlayClick(e){if(e.target===document.getElementById('detailsOverlay'))closeDetailsModal();}
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeDetailsModal();});

function renderCommentHistory(t){
  const box=document.getElementById('commentHistory');
  if(!t.commentHistory?.length){box.innerHTML='<p class="no-history">No comments yet.</p>';return;}
  box.innerHTML=t.commentHistory.map(c=>`
    <div class="comment-entry">
      <div class="comment-entry-ts">${fmtTs(c.ts)}</div>
      <div class="comment-entry-text">${esc(c.text)}</div>
    </div>`).join('');
  box.scrollTop=box.scrollHeight;
}

function addComment(){
  const inp=document.getElementById('newCommentInput');const text=inp.value.trim();
  if(!text||activeTaskId==null)return;
  const t=tasks.find(t=>t.id===activeTaskId);if(!t)return;
  if(!t.commentHistory)t.commentHistory=[];
  t.commentHistory.push({text,ts:Date.now()});t.comment=text;
  inp.value='';autoResize(inp);saveData();renderCommentHistory(t);
  const row=document.querySelector(`tr[data-id="${activeTaskId}"]`);
  if(row){const ta=row.querySelector('.comment-area');if(ta){ta.value=text;autoResize(ta);}const btn=row.querySelector('.btn-details');if(btn)btn.classList.add('has-content');}
}
function commentKeydown(e){if(e.ctrlKey&&e.key==='Enter'){e.preventDefault();addComment();}}

function saveNotes(){
  if(activeTaskId==null)return;const t=tasks.find(t=>t.id===activeTaskId);if(!t)return;
  t.notes=document.getElementById('dmNotes').value;saveData();
  const btn=document.querySelector(`tr[data-id="${activeTaskId}"] .btn-details`);
  if(btn){const any=(t.commentHistory?.length>0)||!!t.notes?.trim();btn.classList.toggle('has-content',any);}
}

function renderPhotosGrid(t){
  const grid=document.getElementById('photosGrid');if(!t.photos?.length){grid.innerHTML='';return;}
  grid.innerHTML=t.photos.map((p,i)=>p.type==='image'
    ?`<img class="photo-thumb" src="${p.data}" alt="${esc(p.name)}" title="${esc(p.name)}" onclick="viewPhoto(${activeTaskId},${i})">`
    :`<div class="file-chip" onclick="downloadFile(${activeTaskId},${i})" title="${esc(p.name)}">📄 <span class="file-chip-name">${esc(p.name)}</span></div>`
  ).join('');
}

function handleFiles(e){
  if(activeTaskId==null)return;const t=tasks.find(t=>t.id===activeTaskId);if(!t)return;if(!t.photos)t.photos=[];
  const promises=Array.from(e.target.files).map(file=>new Promise(res=>{
    const reader=new FileReader();reader.onload=ev=>{t.photos.push({name:file.name,type:file.type.startsWith('image/')?'image':'file',data:ev.target.result,ts:Date.now()});res();};reader.readAsDataURL(file);
  }));
  Promise.all(promises).then(()=>{saveData();renderPhotosGrid(t);const btn=document.querySelector(`tr[data-id="${activeTaskId}"] .btn-details`);if(btn)btn.classList.add('has-content');e.target.value='';});
}

function viewPhoto(taskId,idx){
  const t=tasks.find(t=>t.id===taskId);if(!t?.photos?.[idx])return;const p=t.photos[idx];if(p.type!=='image')return;
  const w=window.open('','_blank');w.document.write(`<!doctype html><html><body style="margin:0;background:#000;display:flex;align-items:center;justify-content:center;min-height:100vh"><img src="${p.data}" style="max-width:100%;max-height:100vh;object-fit:contain"></body></html>`);
}
function downloadFile(taskId,idx){
  const t=tasks.find(t=>t.id===taskId);if(!t?.photos?.[idx])return;const p=t.photos[idx];
  Object.assign(document.createElement('a'),{href:p.data,download:p.name}).click();
}

/* ══════════════════════════════════════════════
   BACKUP
══════════════════════════════════════════════ */
function saveBackup(){
  const data={version:3,exportedAt:new Date().toISOString(),job:JSON.parse(localStorage.getItem('taskManager_job')||'[]'),personal:JSON.parse(localStorage.getItem('taskManager_personal')||'[]')};
  // localStorage always mirrors cloud, so this is always up-to-date
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const date=new Date().toISOString().slice(0,10);
  Object.assign(document.createElement('a'),{href:url,download:'taskmanager_backup_'+date+'.json'}).click();
  URL.revokeObjectURL(url);
  showToast('✅ Backup saved!','success');
}

async function loadBackup(e){
  const file=e.target.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=async function(ev){
    try{
      const data=JSON.parse(ev.target.result);
      if(data.job!==undefined||data.personal!==undefined){
        if(data.job)      localStorage.setItem('taskManager_job',JSON.stringify(data.job));
        if(data.personal) localStorage.setItem('taskManager_personal',JSON.stringify(data.personal));
      } else if(Array.isArray(data)){
        localStorage.setItem('taskManager_job',JSON.stringify(data));
      }
      collapsedSet.clear();sortSettings={col:2,dir:1};
      // Push restored data to cloud
      await Promise.all([
        fetch('/api/tasks?workspace=job',      {method:'POST',headers:{'Content-Type':'application/json'},body:localStorage.getItem('taskManager_job')||'[]'}),
        fetch('/api/tasks?workspace=personal', {method:'POST',headers:{'Content-Type':'application/json'},body:localStorage.getItem('taskManager_personal')||'[]'}),
      ]).catch(()=>{});
      loadData().then(()=>renderTasks());
      showToast('✅ Backup loaded & synced to cloud!','success');
    }catch(err){showToast('❌ Invalid backup file','error');}
    e.target.value='';
  };
  reader.readAsText(file);
}

/* ══════════════════════════════════════════════
   DAILY TOAST REMINDER
══════════════════════════════════════════════ */
function initDailyToast(){
  const today=new Date().toISOString().slice(0,10);
  if(localStorage.getItem('dailyToast_shown')===today)return;
  const now=new Date();
  const fireTime=new Date();
  const h=11+Math.floor(Math.random()*4);
  const m=Math.floor(Math.random()*60);
  fireTime.setHours(h,m,0,0);
  let delay=fireTime-now;
  if(delay<0)delay=1500;
  setTimeout(()=>{showDailyToast();localStorage.setItem('dailyToast_shown',today);},delay);
}

function showDailyToast(){
  let el=document.getElementById('daily-toast');
  if(!el){
    el=document.createElement('div');el.id='daily-toast';
    el.innerHTML=`<div class="dt-title">👋 Reminder zilnic</div><div class="dt-msg">${DAILY_MSG}</div><button class="dt-close" onclick="closeDailyToast()">OK, am înțeles</button>`;
    document.body.appendChild(el);
  }
  setTimeout(()=>el.classList.add('show'),100);
}

function closeDailyToast(){
  const el=document.getElementById('daily-toast');
  if(el){el.classList.remove('show');setTimeout(()=>el.remove(),400);}
}

/* ══════════════════════════════════════════════
   UTILS
══════════════════════════════════════════════ */
function autoResize(el){el.style.height='auto';el.style.height=el.scrollHeight+'px';}
function esc(s){if(!s)return'';return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function fmtTs(ts){const d=new Date(ts),p=n=>String(n).padStart(2,'0');return`${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}  ${p(d.getHours())}:${p(d.getMinutes())}`;}

function showToast(msg,type){
  type=type||'success';
  const el=document.getElementById('tm-toast');
  el.textContent=msg;
  el.style.background=type==='error'?'#fee2e2':'#dcfce7';
  el.style.color=type==='error'?'#991b1b':'#166534';
  el.style.border=type==='error'?'1px solid #fca5a5':'1px solid #86efac';
  el.classList.add('show');
  clearTimeout(el._t);
  el._t=setTimeout(()=>el.classList.remove('show'),2800);
}