/* ═══════════════════════════════════════════════
   TASK MANAGER — script.js
═══════════════════════════════════════════════ */

/* ══ USER CONFIG ══════════════════════════════ */
const USERS = [
  { id:'user1',     name:'Alex B',     pin:'1995', superUser:false  },
  { id:'user2',     name:'Giani C',    pin:'0000', superUser:true  },
  { id:'user3',     name:'user3',      pin:'0000', superUser:false },
  { id:'user4',     name:'user4',      pin:'0000', superUser:false },
  { id:'user5',     name:'user5',      pin:'0000', superUser:false },
  { id:'user6',     name:'user6',      pin:'0000', superUser:false },
];

/* ══ STATUS CONFIG ════════════════════════════ */
const STATUS_LIST = [
  {value:'1-ME On Going',     label:'1 · ME: On Going',     cls:'s1'},
  {value:'2-Others On Going', label:'2 · Others: On Going', cls:'s2'},
  {value:'3-Not Started',     label:'3 · Not Started',      cls:'s3'},
  {value:'4-Follow Up',       label:'4 · Follow Up',        cls:'s4'},
  {value:'5-Delayed',         label:'5 · Delayed',          cls:'s5'},
  {value:'Done',              label:'✓  Done',              cls:'s6'},
];
function getStatusCls(v){const s=STATUS_LIST.find(s=>s.value===v);return s?s.cls:'s3';}

/* ══ STATE ════════════════════════════════════ */
let tasks=[], collapsedSet=new Set();
let currentFilter='todo';
let currentWorkspace='job';
let sortSettings={col:2,dir:1};
let activeTaskId=null;
let dragId=null;
let currentUser=null;
let viewingUserId=null;   // null = own tasks; 'all' = all colleagues; else userId
let _pinBuffer='';
let _saveTimer=null, _syncing=false;

/* ══ BOOT ═════════════════════════════════════ */
document.addEventListener('DOMContentLoaded',()=>{
  buildUserDropdown();
  // Keyboard PIN support
  document.addEventListener('keydown', onKeyboardPin);
  // Check remembered session
  try{
    const s=JSON.parse(localStorage.getItem('tm_session')||'null');
    if(s){
      const u=USERS.find(u=>u.id===s.id&&u.pin===s.pin);
      if(u){currentUser=u;bootApp();return;}
    }
  }catch(e){}
  showLogin();
});

/* ══ LOGIN ════════════════════════════════════ */
function showLogin(){
  document.getElementById('loginScreen').style.display='flex';
  document.getElementById('appScreen').style.display='none';
  document.getElementById('stepUser').style.display='block';
  document.getElementById('stepPin').style.display='none';
  document.getElementById('userSelect').value='';
  _pinBuffer='';
}

function buildUserDropdown(){
  const sel=document.getElementById('userSelect');
  sel.innerHTML='<option value="">— Alege utilizatorul —</option>';
  USERS.forEach(u=>{
    const opt=document.createElement('option');
    opt.value=u.id; opt.textContent=u.name+(u.superUser?' (Admin)':'');
    sel.appendChild(opt);
  });
}

function onUserSelect(id){
  if(!id) return;
  const u=USERS.find(u=>u.id===id); if(!u) return;
  document.getElementById('pinGreetName').textContent=u.name.split(' ')[0];
  document.getElementById('stepUser').style.display='none';
  document.getElementById('stepPin').style.display='block';
  document.getElementById('pinError').textContent='';
  _pinBuffer='';
  updatePinDots('');
}

function backToUserSelect(){
  document.getElementById('stepPin').style.display='none';
  document.getElementById('stepUser').style.display='block';
  document.getElementById('userSelect').value='';
  _pinBuffer='';
}

function pinKey(val){
  if(val==='del'){
    _pinBuffer=_pinBuffer.slice(0,-1);
  } else {
    if(_pinBuffer.length>=4) return;
    _pinBuffer+=val;
  }
  updatePinDots(_pinBuffer);
  if(_pinBuffer.length===4) setTimeout(submitPin,120);
}

function updatePinDots(val){
  document.querySelectorAll('.pin-dot').forEach((d,i)=>d.classList.toggle('filled',i<val.length));
}

function submitPin(){
  const selId=document.getElementById('userSelect').value;
  const u=USERS.find(u=>u.id===selId); if(!u) return;
  if(u.pin===_pinBuffer){
    currentUser=u;
    localStorage.setItem('tm_session',JSON.stringify({id:u.id,pin:u.pin}));
    bootApp();
  } else {
    document.getElementById('pinError').textContent='PIN incorect. Încearcă din nou.';
    _pinBuffer='';
    updatePinDots('');
  }
}

function onKeyboardPin(e){
  // Only active when PIN step is visible
  const pinStep=document.getElementById('stepPin');
  if(!pinStep||pinStep.style.display==='none') return;
  if(e.key>='0'&&e.key<='9') pinKey(e.key);
  else if(e.key==='Backspace') pinKey('del');
  else if(e.key==='Escape') backToUserSelect();
}

function logout(){
  localStorage.removeItem('tm_session');
  currentUser=null;viewingUserId=null;tasks=[];collapsedSet.clear();
  currentFilter='todo';currentWorkspace='job';sortSettings={col:2,dir:1};
  showLogin();
}

/* ══ APP BOOT ══════════════════════════════════ */
function bootApp(){
  document.getElementById('loginScreen').style.display='none';
  const app=document.getElementById('appScreen');
  app.style.display='flex';

  // Header user info
  document.getElementById('headerUserName').textContent=currentUser.name;
  document.getElementById('headerUserAvatar').textContent=
    currentUser.name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();

  // Super user bar
  if(currentUser.superUser){
    buildSuperUserBar();
    document.getElementById('superUserBar').style.display='flex';
  } else {
    document.getElementById('superUserBar').style.display='none';
  }

  viewingUserId=null;
  initSortHeaders();
  initResizers();
  initSlicer();
  initWorkspaceSlicer();
  autoAdjustNameCol();
  document.getElementById('addTaskBtn').addEventListener('click',addTopTask);

  loadData().then(()=>renderTasks());
  initWellnessReminder();
}

/* ══ SUPER USER BAR ════════════════════════════ */
function buildSuperUserBar(){
  const row=document.getElementById('superUserFilterBtns');
  row.innerHTML='';
  // My tasks
  const myBtn=document.createElement('button');
  myBtn.className='su-filter-btn active';myBtn.dataset.uid='';
  myBtn.textContent='👤 My Tasks';
  myBtn.onclick=()=>switchViewUser(null,myBtn);
  row.appendChild(myBtn);
  // Each non-super user
  USERS.filter(u=>!u.superUser).forEach(u=>{
    const btn=document.createElement('button');
    btn.className='su-filter-btn';btn.dataset.uid=u.id;
    btn.textContent=u.name;
    btn.onclick=()=>switchViewUser(u.id,btn);
    row.appendChild(btn);
  });
  // "All colleagues" button handled in HTML, bind here
  document.getElementById('btnAllColleagues').onclick=switchViewAll;
}

function switchViewUser(uid,btn){
  viewingUserId=uid||null;
  document.querySelectorAll('.su-filter-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('btnAllColleagues').classList.remove('active');
  // title
  if(!uid){
    setTitle(currentWorkspace);
  } else {
    const u=USERS.find(u=>u.id===uid);
    document.getElementById('workspaceTitle').textContent=`💼 ${u.name}`;
  }
  // hide personal/focus when viewing others
  ['personal','focus'].forEach(v=>{
    const el=document.querySelector(`#workspaceSlicer .slicer-opt[data-value="${v}"]`);
    if(el) el.style.display=uid?'none':'';
  });
  if(uid&&currentWorkspace!=='job'){
    currentWorkspace='job';
    document.querySelectorAll('#workspaceSlicer .slicer-opt').forEach(b=>b.classList.remove('active'));
    document.querySelector('#workspaceSlicer .slicer-opt[data-value="job"]').classList.add('active');
  }
  // owner column
  document.getElementById('colOwnerHeader').style.display='none';
  collapsedSet.clear();
  loadData().then(()=>renderTasks());
}

async function switchViewAll(){
  viewingUserId='all';
  document.querySelectorAll('.su-filter-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById('btnAllColleagues').classList.add('active');
  document.getElementById('workspaceTitle').textContent='👥 Toți colegii — Job';
  document.getElementById('colOwnerHeader').style.display='';
  currentWorkspace='job';
  document.querySelectorAll('#workspaceSlicer .slicer-opt').forEach(b=>b.classList.remove('active'));
  document.querySelector('#workspaceSlicer .slicer-opt[data-value="job"]').classList.add('active');
  // Switch view filter to "all" so nothing gets hidden
  currentFilter='all';
  document.querySelectorAll('#statusSlicer .slicer-opt').forEach(b=>b.classList.remove('active'));
  document.querySelector('#statusSlicer .slicer-opt[data-value="all"]').classList.add('active');
  ['personal','focus'].forEach(v=>{
    const el=document.querySelector(`#workspaceSlicer .slicer-opt[data-value="${v}"]`);
    if(el) el.style.display='none';
  });
  collapsedSet.clear();
  setSyncStatus('load');

  // Load ALL users' job tasks (including super users)
  const allTasks=[];
  await Promise.all(USERS.map(async u=>{
    try{
      const res=await fetch(`/api/tasks?workspace=job&user=${u.id}`);
      if(!res.ok) return;
      const raw=await res.json();
      if(!Array.isArray(raw)||raw.length===0) return;
      raw.forEach(t=>{
        t._owner=u.id;
        t._ownerName=u.name;
      });
      allTasks.push(...raw);
    }catch(e){
      console.warn('Failed to load tasks for',u.id,e);
    }
  }));

  tasks=allTasks;
  tasks.forEach(migrateTask);
  // Collapse all top-level by default
  tasks.filter(t=>!t.parentId).forEach(t=>collapsedSet.add(t.id));
  setSyncStatus('ok');
  renderTasks();
}

/* ══ STORAGE ═══════════════════════════════════ */
function activeUserId(){
  if(currentUser.superUser&&viewingUserId&&viewingUserId!=='all') return viewingUserId;
  return currentUser.id;
}

function setSyncStatus(state){
  let badge=document.getElementById('sync-badge');
  if(!badge){
    badge=document.createElement('span');badge.id='sync-badge';
    badge.style.cssText='font-size:11px;font-weight:600;padding:3px 9px;border-radius:20px;margin-left:6px;transition:all .3s;';
    const h1=document.getElementById('workspaceTitle');if(h1)h1.after(badge);
  }
  const cfg={saving:['💾…','#fef3c7','#92400e'],ok:['☁ Saved','#dcfce7','#166534'],err:['⚠ Offline','#fee2e2','#b91c1c'],load:['⏳','#dbeafe','#1d4ed8']};
  const [txt,bg,color]=cfg[state]||cfg.ok;
  badge.textContent=txt;badge.style.background=bg;badge.style.color=color;badge.style.opacity='1';
  if(state==='ok')setTimeout(()=>{if(badge)badge.style.opacity='0';},3000);
}

function migrateTask(t){
  if(!t.status)         t.status='3-Not Started';
  if(!t.commentHistory) t.commentHistory=[];
  if(!t.photos)         t.photos=[];
  if(!t.notes)          t.notes='';
  if(!t.hasOwnProperty('order')) t.order=t.id;
  if(!t.hasOwnProperty('focus')) t.focus=false;
  if(!t.hasOwnProperty('done'))  t.done=t.status==='Done';
  if(t.comment&&t.comment.trim()&&t.commentHistory.length===0)
    t.commentHistory.push({text:t.comment,ts:t.id});
  return t;
}

async function loadData(){
  if(viewingUserId==='all') return; // handled by switchViewAll
  setSyncStatus('load');
  const uid=activeUserId();
  try{
    if(currentWorkspace==='focus'){
      const [j,p]=await Promise.all([fetchWS(uid,'job'),fetchWS(uid,'personal')]);
      tasks=[...j,...p];
    } else {
      tasks=await fetchWS(uid,currentWorkspace);
    }
    tasks.forEach(migrateTask);
    tasks.filter(t=>!t.parentId).forEach(t=>collapsedSet.add(t.id));
    setSyncStatus('ok');
  }catch(e){
    console.warn('Cloud load failed, using localStorage:',e);
    loadFromLocal(uid);setSyncStatus('err');
  }
}

async function fetchWS(uid,ws){
  const res=await fetch(`/api/tasks?workspace=${ws}&user=${uid}`);
  if(!res.ok) throw new Error('HTTP '+res.status);
  return res.json();
}

function loadFromLocal(uid){
  try{
    if(currentWorkspace==='focus'){
      const j=JSON.parse(localStorage.getItem(`tm_${uid}_job`)||'[]');
      const p=JSON.parse(localStorage.getItem(`tm_${uid}_personal`)||'[]');
      tasks=[...j,...p];
    } else {
      tasks=JSON.parse(localStorage.getItem(`tm_${uid}_${currentWorkspace}`)||'[]');
    }
    tasks.forEach(migrateTask);
    tasks.filter(t=>!t.parentId).forEach(t=>collapsedSet.add(t.id));
  }catch(e){tasks=[];}
}

function saveData(){
  if(viewingUserId==='all') return; // read-only
  const uid=activeUserId();
  _saveToLocal(uid);
  clearTimeout(_saveTimer);
  _saveTimer=setTimeout(()=>_saveToCloud(uid),600);
}

function _saveToLocal(uid){
  if(currentWorkspace==='focus'){
    localStorage.setItem(`tm_${uid}_job`,      JSON.stringify(tasks.filter(t=>t.workspace==='job'||!t.workspace)));
    localStorage.setItem(`tm_${uid}_personal`, JSON.stringify(tasks.filter(t=>t.workspace==='personal')));
  } else {
    tasks.forEach(t=>t.workspace=currentWorkspace);
    localStorage.setItem(`tm_${uid}_${currentWorkspace}`,JSON.stringify(tasks));
  }
}

async function _saveToCloud(uid){
  if(_syncing){_saveTimer=setTimeout(()=>_saveToCloud(uid),400);return;}
  _syncing=true;setSyncStatus('saving');
  try{
    if(currentWorkspace==='focus'){
      await Promise.all([
        pushWS(uid,'job',     tasks.filter(t=>t.workspace==='job'||!t.workspace)),
        pushWS(uid,'personal',tasks.filter(t=>t.workspace==='personal')),
      ]);
    } else {
      await pushWS(uid,currentWorkspace,tasks);
    }
    setSyncStatus('ok');
  }catch(e){console.warn('Cloud save failed:',e);setSyncStatus('err');}
  finally{_syncing=false;}
}

async function pushWS(uid,ws,data){
  const res=await fetch(`/api/tasks?workspace=${ws}&user=${uid}`,{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),
  });
  if(!res.ok) throw new Error('HTTP '+res.status);
}

function saveAndRender(){saveData();renderTasks();}

/* ══ RENDER ════════════════════════════════════ */
function renderTasks(){
  const tbody=document.getElementById('taskBody');
  tbody.innerHTML='';
  const rows=buildVisibleList();
  if(rows.length===0){
    const tr=document.createElement('tr');
    tr.innerHTML=`<td colspan="9" style="text-align:center;padding:48px;color:#94a3b8;font-size:13px">
      Niciun task — apasă <strong>Add Task</strong> pentru a începe.</td>`;
    tbody.appendChild(tr);
  } else {
    rows.forEach(t=>buildRow(t,tbody));
  }
  document.querySelectorAll('.sort-arrow').forEach(el=>{
    const c=parseInt(el.dataset.col);el.className='sort-arrow';
    if(sortSettings.col===c)el.classList.add(sortSettings.dir===1?'asc':'desc');
  });
  initDragDrop();
}

/* ── FILTER LOGIC ── */
function matchFilter(task){
  if(currentFilter==='all') return true;
  if(currentFilter==='done') return task.done;
  if(currentFilter==='nodelay') return task.status!=='5-Delayed'&&!task.done;

  // 'todo' filter: show task if:
  // - it's not done itself, OR
  // - it's done but has at least one undone direct child (so parent stays visible)
  if(currentFilter==='todo'){
    if(!task.done) return true;
    // Done parent: keep visible only if has active children
    if(!task.parentId){
      return tasks.some(c=>c.parentId===task.id&&!c.done);
    }
    // Sub-tasks: stay visible as long as their parent is visible — never disappear on their own
    return true;
  }
  return true;
}

/* For sub-tasks specifically: only hide when main task is done */
function subTaskVisible(task){
  if(currentFilter==='done') return task.done;
  // In 'todo' and 'nodelay': hide sub-task ONLY if its top-level parent is done
  const root=getRootTask(task);
  if(!root) return true;
  if(currentFilter==='nodelay') return root.status!=='5-Delayed'&&!root.done;
  if(currentFilter==='todo') return !root.done;
  return true;
}

function getRootTask(task){
  if(!task.parentId) return task;
  const parent=tasks.find(t=>t.id===task.parentId);
  return parent?getRootTask(parent):task;
}

function buildVisibleList(){
  const colKeys=['name','comment','status','dueDate'];

  // FOCUS workspace
  if(currentWorkspace==='focus'){
    let tops=tasks.filter(t=>!t.parentId&&t.focus).sort((a,b)=>a.order-b.order);
    if(sortSettings.col!==null){
      const key=colKeys[sortSettings.col];
      tops=tops.sort((a,b)=>(a[key]||'').toString().toLowerCase().localeCompare((b[key]||'').toString().toLowerCase())*sortSettings.dir);
    }
    const result=[];
    tops.forEach(task=>{
      if(!matchFilter(task))return;
      result.push(task);
      if(collapsedSet.has(task.id))return;
      tasks.filter(t=>t.parentId===task.id).sort((a,b)=>a.order-b.order).forEach(s1=>{
        if(!subTaskVisible(s1))return;
        result.push(s1);
        if(collapsedSet.has(s1.id))return;
        tasks.filter(t=>t.parentId===s1.id).sort((a,b)=>a.order-b.order).forEach(s2=>{
          if(subTaskVisible(s2))result.push(s2);
        });
      });
    });
    return result;
  }

  // All colleagues view (super user)
  if(viewingUserId==='all'){
    // Group by owner, show all top-level tasks
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
      tasks.filter(t=>t.parentId===task.id).sort((a,b)=>a.order-b.order).forEach(s1=>{
        if(!subTaskVisible(s1))return;
        result.push(s1);
        if(collapsedSet.has(s1.id))return;
        tasks.filter(t=>t.parentId===s1.id).sort((a,b)=>a.order-b.order).forEach(s2=>{
          if(subTaskVisible(s2))result.push(s2);
        });
      });
    });
    return result;
  }

  // Normal view
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
    tasks.filter(t=>t.parentId===task.id).sort((a,b)=>a.order-b.order).forEach(s1=>{
      if(!subTaskVisible(s1))return;
      result.push(s1);
      if(collapsedSet.has(s1.id))return;
      tasks.filter(t=>t.parentId===s1.id).sort((a,b)=>a.order-b.order).forEach(s2=>{
        if(subTaskVisible(s2))result.push(s2);
      });
    });
  });
  return result;
}

/* ══ BUILD ROW ══════════════════════════════════ */
function buildRow(task,tbody){
  const tr=document.createElement('tr');
  tr.dataset.id=task.id;
  const lvlCls=['row-task','row-sub1','row-sub2'][task.level]||'row-sub2';
  tr.className=lvlCls;
  if(task.done) tr.classList.add('row-done');

  const isReadOnly=!!(viewingUserId&&viewingUserId!=='all')||viewingUserId==='all';
  const hasChildren=tasks.some(t=>t.parentId===task.id);
  const collapsed=collapsedSet.has(task.id);
  const canParent=task.level<2;
  const hasDetails=(task.commentHistory?.length>0)||!!task.notes?.trim();

  // INDENTATION: indent entire row content by level
  const indent=task.level*28; // px indent for full row

  let toggleHtml=canParent
    ?`<button class="toggle-btn${hasChildren?' has-children':''}" onclick="toggleCollapse(${task.id})" style="margin-left:${indent}px" title="${collapsed?'Expand':'Collapse'}">${collapsed?'+':'−'}</button>`
    :`<div class="toggle-placeholder" style="margin-left:${indent}px"></div>`;

  // NAME CELL
  const tdName=document.createElement('td');
  tdName.innerHTML=`
    <div class="cell-name">
      <div class="check-box ${task.done?'checked':''}"
        ${isReadOnly?'':'onclick="toggleDone('+task.id+')"'} title="Mark done"></div>
      ${toggleHtml}
      <div class="name-wrap">
        <textarea class="name-area" rows="1" placeholder="Task name…"
          ${isReadOnly?'readonly':'onchange="updateField('+task.id+',\'name\',this.value)" oninput="autoResize(this)"'}
        >${esc(task.name)}</textarea>
      </div>
      ${canParent&&!isReadOnly?`<button class="btn-add-child" onclick="addChild(${task.id},${task.level})" title="Sub-task">+</button>`:''}
      ${task.level===0&&!isReadOnly?`<button class="btn-focus ${task.focus?'focused':''}" onclick="toggleFocus(${task.id})" title="Focus">⭐</button>`:''}
    </div>`;

  // COMMENT
  const latestCmt=task.commentHistory?.length?task.commentHistory[task.commentHistory.length-1].text:(task.comment||'');
  const tdComment=document.createElement('td');
  tdComment.innerHTML=`<textarea class="comment-area" rows="1"
    ${isReadOnly?'readonly':'onchange="updateComment('+task.id+',this.value)" oninput="autoResize(this)"'}
  >${esc(latestCmt)}</textarea>`;

  // DETAILS
  const tdDetails=document.createElement('td');
  tdDetails.innerHTML=`<button class="btn-details ${hasDetails?'has-content':''}" onclick="openModal(${task.id})" title="Details">
    <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 3a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm1 7H7V7h2v4z"/>
    </svg>
  </button>`;

  // STATUS
  const sCls=task.done?'s6':getStatusCls(task.status);
  const opts=STATUS_LIST.map(s=>`<option value="${s.value}" ${task.status===s.value?'selected':''}>${s.label}</option>`).join('');
  const tdStatus=document.createElement('td');
  tdStatus.innerHTML=`<select class="status-select ${sCls}"
    ${isReadOnly?'disabled':'onchange="updateStatus('+task.id+',this)\"'}>${opts}</select>`;

  // DATE
  const tdDate=document.createElement('td');
  tdDate.innerHTML=`<input type="date" class="date-input" value="${task.dueDate||''}"
    ${isReadOnly?'disabled':'onchange="updateField('+task.id+',\'dueDate\',this.value)"'}>`;

  // TIME LEFT
  const tdTime=document.createElement('td');
  tdTime.innerHTML=`<div class="time-cell">${timeLeft(task.dueDate,task.done)}</div>`;

  // OWNER (only in "all colleagues" view, top-level tasks only)
  const tdOwner=document.createElement('td');
  tdOwner.style.display=viewingUserId==='all'?'':'none';
  if(viewingUserId==='all'&&task.level===0){
    tdOwner.innerHTML=`<div class="owner-chip">${esc(task._ownerName||'')}</div>`;
  }

  // DRAG
  const tdDrag=document.createElement('td');
  tdDrag.innerHTML=isReadOnly?'<div style="width:30px"></div>':`<div class="drag-handle" draggable="true" title="Reorder">⠿</div>`;

  // DELETE
  const tdDel=document.createElement('td');
  tdDel.innerHTML=isReadOnly?'':`<button class="btn-delete" onclick="deleteTask(${task.id})" title="Delete">
    <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
      <path d="M6 2a1 1 0 0 0-1 1v.5H2.5a.5.5 0 0 0 0 1h.5l.5 9A1.5 1.5 0 0 0 5 15h6
      a1.5 1.5 0 0 0 1.5-1.5l.5-9h.5a.5.5 0 0 0 0-1H11V3a1 1 0 0 0-1-1H6zm1 1h2v.5H7V3z
      M4.5 5h7l-.5 8.5a.5.5 0 0 1-.5.5H5.5a.5.5 0 0 1-.5-.5L4.5 5z"/>
    </svg>
  </button>`;

  [tdName,tdComment,tdDetails,tdStatus,tdDate,tdTime,tdOwner,tdDrag,tdDel].forEach(td=>tr.appendChild(td));
  tbody.appendChild(tr);
  tr.querySelectorAll('textarea').forEach(autoResize);
}

/* ══ TASK MUTATIONS ════════════════════════════ */
function addTopTask(){
  const id=Date.now();
  tasks.push({id,parentId:null,level:0,name:'',comment:'',status:'3-Not Started',
    dueDate:'',done:false,commentHistory:[],photos:[],notes:'',order:id,focus:false,workspace:currentWorkspace});
  saveAndRender();
  setTimeout(()=>{
    const rows=document.querySelectorAll('#taskBody tr');
    if(rows.length){const ta=rows[rows.length-1].querySelector('textarea.name-area');if(ta)ta.focus();}
  },40);
}

function addChild(parentId,parentLevel){
  const id=Date.now();
  tasks.push({id,parentId,level:parentLevel+1,name:'',comment:'',status:'3-Not Started',
    dueDate:'',done:false,commentHistory:[],photos:[],notes:'',order:id,focus:false,workspace:currentWorkspace});
  collapsedSet.delete(parentId);
  saveAndRender();
}

function toggleDone(id){
  const t=tasks.find(t=>t.id===id);if(!t)return;
  t.done=!t.done;
  t.status=t.done?'Done':'3-Not Started';
  if(t.done){
    playDoneSound();
    animateBird(id);
    const tr=document.querySelector(`tr[data-id="${id}"]`);
    if(tr){tr.classList.add('just-done');setTimeout(()=>tr.classList.remove('just-done'),700);}
  }
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
  if(t.done){playDoneSound();animateBird(id);}
  saveData();
}

function toggleFocus(id){
  const t=tasks.find(t=>t.id===id);if(!t||t.parentId!==null)return;
  t.focus=!t.focus;saveData();renderTasks();
}

function deleteTask(id){
  if(!confirm('Ștergi task-ul și toate sub-task-urile sale?'))return;
  const del=new Set();
  const collect=tid=>{del.add(tid);tasks.filter(t=>t.parentId===tid).forEach(c=>collect(c.id));};
  collect(id);
  tasks=tasks.filter(t=>!del.has(t.id));
  collapsedSet.delete(id);
  if(activeTaskId&&del.has(activeTaskId))closeDetailsModal();
  saveAndRender();
}

/* ══ COLLAPSE / SORT / FILTER / RESIZE ════════ */
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
      btn.classList.add('active');currentFilter=btn.dataset.value;renderTasks();
    });
  });
}

function initWorkspaceSlicer(){
  document.querySelectorAll('#workspaceSlicer .slicer-opt').forEach(btn=>{
    btn.addEventListener('click',()=>{
      if(btn.dataset.value==='personal'&&viewingUserId)return;
      document.querySelectorAll('#workspaceSlicer .slicer-opt').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      currentWorkspace=btn.dataset.value;
      document.querySelectorAll('#statusSlicer .slicer-opt').forEach(b=>b.classList.remove('active'));
      document.querySelector('#statusSlicer .slicer-opt[data-value="todo"]').classList.add('active');
      currentFilter='todo';
      if(!viewingUserId) setTitle(currentWorkspace);
      closeDetailsModal();collapsedSet.clear();sortSettings={col:2,dir:1};
      loadData().then(()=>renderTasks());
    });
  });
}

function setTitle(ws){
  const titles={job:'💼 Job Tasks',personal:'🏠 Personal',focus:'🎯 Focus'};
  document.getElementById('workspaceTitle').textContent=titles[ws]||'Tasks';
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

/* ══ DRAG & DROP ═══════════════════════════════ */
function initDragDrop(){
  const tbody=document.getElementById('taskBody');
  tbody.querySelectorAll('.drag-handle').forEach(handle=>{
    const row=handle.closest('tr'),id=parseInt(row.dataset.id);
    handle.addEventListener('dragstart',e=>{dragId=id;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',String(id));setTimeout(()=>row.classList.add('dragging'),0);});
    handle.addEventListener('dragend',()=>{row.classList.remove('dragging');tbody.querySelectorAll('tr').forEach(r=>r.classList.remove('drag-over'));dragId=null;});
  });
  tbody.querySelectorAll('tr').forEach(row=>{
    row.addEventListener('dragover',e=>{e.preventDefault();const tid=parseInt(row.dataset.id);if(tid===dragId)return;tbody.querySelectorAll('tr').forEach(r=>r.classList.remove('drag-over'));row.classList.add('drag-over');});
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
      without.splice(tgtIdx,0,src);without.forEach((t,i)=>t.order=i*10);
      row.classList.remove('drag-over');saveAndRender();
    });
  });
}

/* ══ TIME LEFT ═════════════════════════════════ */
function timeLeft(dateStr,done){
  if(!dateStr)return'<span style="color:#cbd5e1">—</span>';
  if(done)return'<span style="color:#22c55e;font-weight:600">Done ✓</span>';
  const today=new Date();today.setHours(0,0,0,0);
  const due=new Date(dateStr);const diff=Math.ceil((due-today)/86400000);
  if(diff<0) return`<span class="time-late">−${Math.abs(diff)}d late</span>`;
  if(diff===0)return`<span class="time-today">Today!</span>`;
  if(diff<=3) return`<span class="time-warn">${diff}d left</span>`;
  return`<span class="time-ok">${diff}d left</span>`;
}

/* ══ DONE SOUND + BIRD ANIMATION ══════════════ */
/* ================= FÂȘÂIT ELECTRONIC / LASER ================= */
function playDoneSound(){
  try{
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const t = ctx.currentTime;

    // --- 1. GENERĂM FÂȘÂITUL (Efectul de aer / "Swoosh") ---
    // Creăm un buffer scurt de zgomot (0.4 secunde)
    const bufferSize = ctx.sampleRate * 0.4;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noiseNode = ctx.createBufferSource();
    noiseNode.buffer = buffer;

    // Folosim un filtru ca fâșâitul să nu fie deranjant, ci să sune a "vânt/aer"
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(400, t);
    // Filtrul urcă rapid în frecvență odată cu mișcarea aerului
    filter.frequency.exponentialRampToValueAtTime(1500, t + 0.25);

    const noiseGain = ctx.createGain();
    // Volumul fâșâitului pornește de la 0 și urcă (Swoosh!)
    noiseGain.gain.setValueAtTime(0, t);
    noiseGain.gain.linearRampToValueAtTime(0.25, t + 0.15);
    noiseGain.gain.linearRampToValueAtTime(0, t + 0.3);

    // Conectăm fâșâitul
    noiseNode.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(ctx.destination);

    // --- 2. GENERĂM NOTA FINALĂ (Confirmarea) ---
    // O notă cristalină și fină, exact când se termină fâșâitul
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(987.77, t + 0.18); // Nota Si (B5) curată

    oscGain.gain.setValueAtTime(0, t + 0.18);
    oscGain.gain.linearRampToValueAtTime(0.12, t + 0.20);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.5); // Se stinge fin

    osc.connect(oscGain);
    oscGain.connect(ctx.destination);

    // --- 3. PORNIREA SIMULTANĂ ---
    noiseNode.start(t);
    noiseNode.stop(t + 0.35);

    osc.start(t + 0.18);
    osc.stop(t + 0.55);

  } catch(e) {
    console.log("Audio Error:", e);
  }
}

function animateBird(taskId){ // Păstrăm numele funcției ca să nu fii nevoit să schimbi în altă parte a codului
  const row=document.querySelector(`tr[data-id="${taskId}"]`);
  if(!row) return;
  const rect=row.getBoundingClientRect();
  const canvas=document.getElementById('birdCanvas');
  
  canvas.width=window.innerWidth;
  canvas.height=window.innerHeight;
  canvas.style.display='block';
  const ctx=canvas.getContext('2d');

  // Punctul de pornire: centrul rândului selectat
  const sx=rect.left+140;
  const sy=rect.top+rect.height/2;

  // Generăm o listă de confeti (ex: 25 de bucăți mici)
  const confettiCount = 35;
  const particles = [];
  const colors = ['#f59e0b', '#fbbf24', '#f97316', '#3b82f6', '#10b981', '#ec4899'];

  for (let i = 0; i < confettiCount; i++) {
    particles.push({
      x: sx + (Math.random() * 40 - 20), // pornesc ușor împrăștiate pe orizontală
      y: sy + (Math.random() * 20 - 10),
      size: Math.random() * 5 + 4,        // dimensiuni mici (4-9px) ca să fie discrete
      color: colors[Math.floor(Math.random() * colors.length)],
      // Viteze haotice: unele zboară puțin în sus la început, dar gravitația le trage în jos
      vx: (Math.random() * 6 - 3), 
      vy: (Math.random() * -4 - 2), // viteză inițială în sus (efect de explozie ușoară)
      gravity: 0.15,                 // forța care le trage în jos în curbă
      alpha: 1,                      // opacitatea inițială pentru efectul de disolve
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: Math.random() * 0.2 - 0.1
    });
  }

  let startTime = null;

  function frame(timestamp) {
    if (!startTime) startTime = timestamp;
    const elapsed = timestamp - startTime;

    // Curățăm canvas-ul perfect (fără să facem ecranul alb)
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    let anyParticleVisible = false;

    particles.forEach(p => {
      if (p.alpha <= 0) return;

      anyParticleVisible = true;

      // Aplicăm fizica de mișcare (curba în jos)
      p.vy += p.gravity; // gravitația trage viteza în jos
      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.rotationSpeed;
      
      // Efectul de disolve / dispariție treptată (scade opacitatea)
      p.alpha -= 0.018; 
      if (p.alpha < 0) p.alpha = 0;

      // Desenăm o confeti (pătrat rotit)
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      ctx.restore();
    });

    // Dacă mai sunt particule vizibile și nu au trecut mai mult de 2 secunde, continuăm
    if (anyParticleVisible && elapsed < 2000) {
      requestAnimationFrame(frame);
    } else {
      canvas.style.display = 'none'; // Ascundem canvas-ul când totul s-a terminat
    }
  }

  requestAnimationFrame(frame);
}

/* ══ DETAILS MODAL ══════════════════════════════ */
function openModal(id){
  activeTaskId=id;const t=tasks.find(t=>t.id===id);if(!t)return;
  document.getElementById('dmTitle').textContent=t.name||'Untitled';
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
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!document.getElementById('stepPin').style.display)closeDetailsModal();});

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

/* ══ BACKUP ════════════════════════════════════ */
function saveBackup(){
  const uid=activeUserId();
  const data={version:4,exportedAt:new Date().toISOString(),userId:uid,
    job:     JSON.parse(localStorage.getItem(`tm_${uid}_job`)||'[]'),
    personal:JSON.parse(localStorage.getItem(`tm_${uid}_personal`)||'[]')};
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  Object.assign(document.createElement('a'),{href:url,download:`backup_${uid}_${new Date().toISOString().slice(0,10)}.json`}).click();
  URL.revokeObjectURL(url);showToast('✅ Backup saved!','success');
}

async function loadBackup(e){
  const file=e.target.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=async function(ev){
    try{
      const data=JSON.parse(ev.target.result);const uid=activeUserId();
      if(data.job)      localStorage.setItem(`tm_${uid}_job`,      JSON.stringify(data.job));
      if(data.personal) localStorage.setItem(`tm_${uid}_personal`, JSON.stringify(data.personal));
      await Promise.all([
        fetch(`/api/tasks?workspace=job&user=${uid}`,      {method:'POST',headers:{'Content-Type':'application/json'},body:localStorage.getItem(`tm_${uid}_job`)||'[]'}),
        fetch(`/api/tasks?workspace=personal&user=${uid}`, {method:'POST',headers:{'Content-Type':'application/json'},body:localStorage.getItem(`tm_${uid}_personal`)||'[]'}),
      ]).catch(()=>{});
      collapsedSet.clear();sortSettings={col:2,dir:1};
      await loadData();renderTasks();showToast('✅ Backup loaded!','success');
    }catch(err){showToast('❌ Fișier invalid','error');}
    e.target.value='';
  };
  reader.readAsText(file);
}

/* ══ WELLNESS REMINDER ═════════════════════════ */
const WELLNESS_QUESTIONS=[
  {
    emoji:'💧',
    q:'Ai băut apă azi?',
    yes:'Foarte bine! O hidratare bună înseamnă sănătate, concentrare și energie. Continuă! 💪',
    no: 'Ar trebui să bei apă acum. Deshidratarea poate provoca dureri de cap, oboseală și scăderea concentrării — simptomele apar mai repede decât crezi.',
  },
  {
    emoji:'🏃',
    q:'Ai făcut mișcare azi?',
    yes:'Excelent! Nu uita: cel puțin 30 de minute pe zi fac minuni pentru corpul și mintea ta.',
    no: 'Lipsa mișcării duce la dureri de spate, atrofierea mușchilor și probleme posturale. Chiar și o plimbare scurtă de 15 minute ajută enorm / Sau macar o scurta sesiune de stretching direct in birou 😂!',
  },
];

function initWellnessReminder(){
  const today=new Date().toISOString().slice(0,10);
  const key=`wellness_${currentUser.id}_${today}`;
  if(localStorage.getItem(key))return;
  const h=11+Math.floor(Math.random()*4),m=Math.floor(Math.random()*60);
  const fire=new Date();fire.setHours(h,m,0,0);
  let delay=fire-new Date();if(delay<0)delay=2000;
  setTimeout(()=>{showWellness(0,key);},delay);
}

function showWellness(idx,storageKey){
  if(idx>=WELLNESS_QUESTIONS.length){
    if(storageKey)localStorage.setItem(storageKey,'1');
    return;
  }
  const q=WELLNESS_QUESTIONS[idx];
  const box=document.getElementById('wellnessBox');
  box.innerHTML=`
    <div class="wellness-emoji">${q.emoji}</div>
    <div class="wellness-q">${q.q}</div>
    <div class="wellness-btns">
      <button class="wellness-btn wellness-btn-yes" onclick="wellnessAnswer(${idx},'yes','${storageKey}')">Da ✓</button>
      <button class="wellness-btn wellness-btn-no"  onclick="wellnessAnswer(${idx},'no','${storageKey}')">Nu ✗</button>
    </div>
    <div class="wellness-answer" id="wellnessAns"></div>
    <button class="wellness-dismiss" id="wellnessDismiss" style="display:none" onclick="wellnessNext(${idx+1},'${storageKey}')">Continuă →</button>`;
  document.getElementById('wellnessOverlay').style.display='flex';
}

function wellnessAnswer(idx,ans,storageKey){
  const q=WELLNESS_QUESTIONS[idx];
  const ansEl=document.getElementById('wellnessAns');
  ansEl.textContent=ans==='yes'?q.yes:q.no;
  ansEl.style.display='block';
  document.getElementById('wellnessDismiss').style.display='inline-block';
  document.querySelectorAll('.wellness-btn').forEach(b=>b.disabled=true);
}

function wellnessNext(nextIdx,storageKey){
  document.getElementById('wellnessOverlay').style.display='none';
  setTimeout(()=>showWellness(nextIdx,storageKey),400);
}

/* ══ TOAST ═════════════════════════════════════ */
function showToast(msg,type){
  type=type||'success';const el=document.getElementById('tm-toast');
  el.textContent=msg;
  el.style.background=type==='error'?'#fee2e2':'#dcfce7';
  el.style.color=type==='error'?'#991b1b':'#166534';
  el.style.border=type==='error'?'1px solid #fca5a5':'1px solid #86efac';
  el.classList.add('show');clearTimeout(el._t);
  el._t=setTimeout(()=>el.classList.remove('show'),2800);
}

/* ══ UTILS ═════════════════════════════════════ */
function autoResize(el){el.style.height='auto';el.style.height=el.scrollHeight+'px';}
function esc(s){if(!s)return'';return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function fmtTs(ts){const d=new Date(ts),p=n=>String(n).padStart(2,'0');return`${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}  ${p(d.getHours())}:${p(d.getMinutes())}`;}
