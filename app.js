// Demo Mode + optional Supabase Mode, with @aamaritime.gy users
const CFG_URL_KEY = 'aa_supabase_url';
const CFG_ANON_KEY = 'aa_supabase_key';
const DEMO_LS_KEY = 'aa_demo_data_v2';

function getConfig() {
  return { url: localStorage.getItem(CFG_URL_KEY) || '', key: localStorage.getItem(CFG_ANON_KEY) || '' };
}
function setBadge(text){ document.getElementById('modeBadge').textContent = text; }
let supabaseClient = null;
let mode = 'demo'; // 'demo' or 'supabase'

document.addEventListener('DOMContentLoaded', async () => {
  const { url, key } = getConfig();
  if (url && key) { mode='supabase'; supabaseClient = supabase.createClient(url,key); setBadge('Supabase'); }
  else { seedDemo(); setBadge(''); }
  initUI();
  await initAuth();
  bindTabs();
});

function $(sel){ return document.querySelector(sel); }
function $$(sel){ return Array.from(document.querySelectorAll(sel)); }
function todayISO(){ const d=new Date(); return d.toISOString().slice(0,10); }
function firstDayOfMonth(y,m){ return new Date(y, m, 1); }
function daysInMonth(y,m){ return new Date(y, m+1, 0).getDate(); }

let state = {
  user: null, profile: null,
  selectedDate: todayISO(),
  viewMonth: (()=>{ const d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0') })(),
  subjects: [], instructors: [], assignments: [], topics: [],
};

// ---------- DEMO STORAGE ----------
function seedDemo(){
  if (localStorage.getItem(DEMO_LS_KEY)) return;
  const demo = {
    users: [
      { id:'p_admin', email:'admin@aamaritime.gy', name:'Admin', is_admin:true, password:'123456' },
      { id:'p_ahmed', email:'ahmed@aamaritime.gy', name:'Capt. Ahmed', is_admin:false, password:'123456' },
      { id:'p_maria', email:'maria@aamaritime.gy', name:'Eng. Maria', is_admin:false, password:'123456' },
    ],
    subjects: [
      { id:'s_nav', name:'Navigation I', total_hours:45 },
      { id:'s_eng', name:'Marine Engineering Basics', total_hours:60 }
    ],
    assignments: [
      { id:'a1', subject_id:'s_nav', instructor_id:'p_ahmed' },
      { id:'a2', subject_id:'s_eng', instructor_id:'p_maria' }
    ],
    topics: [
      { id:'t1', subject_id:'s_nav', instructor_id:'p_ahmed', title:'Mercator Sailing', date: todayISO(), start:'09:00', end:'11:00', duration_hours:2, completed:false },
      { id:'t2', subject_id:'s_eng', instructor_id:'p_maria', title:'Fuel Systems', date: todayISO(), start:'13:00', end:'16:00', duration_hours:3, completed:false }
    ]
  };
  localStorage.setItem(DEMO_LS_KEY, JSON.stringify(demo));
}
function readDemo(){ return JSON.parse(localStorage.getItem(DEMO_LS_KEY)||'{}'); }
function writeDemo(db){ localStorage.setItem(DEMO_LS_KEY, JSON.stringify(db)); }

// ---------- UI & AUTH ----------
function initUI(){
  $('#btnSignIn').onclick = signIn;
  $('#btnSignUp').onclick = signUp;
  $('#btnSignOut').onclick = signOut;
  $('#btnCreateInstructor').onclick = createInstructorProfile;
  $('#btnAddSubject').onclick = addSubject;
  $('#btnAssign').onclick = assignSubject;
  $('#btnAddTopic').onclick = addTopic;
  $('#btnSetPw').onclick = setDemoPassword;
  $('#prevMonth').onclick = ()=>{ const [Y,M]=state.viewMonth.split('-').map(Number); const d=new Date(Y,M-2,1); state.viewMonth=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); renderCalendar(); };
  $('#nextMonth').onclick = ()=>{ const [Y,M]=state.viewMonth.split('-').map(Number); const d=new Date(Y,M,1); state.viewMonth=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); renderCalendar(); };
  const imp = document.getElementById('fileImport'); if (imp) imp.addEventListener('change', importBackup, false);
  const exp = document.getElementById('btnExport'); if (exp) exp.onclick = exportBackup;
  const prn = document.getElementById('btnPrint'); if (prn) prn.onclick = ()=>window.print();
}

function bindTabs(){
  $$('.tab').forEach(btn=>btn.addEventListener('click', ()=>{
    $$('.tab').forEach(x=>x.classList.remove('active')); btn.classList.add('active');
    const key = btn.dataset.tab;
    $$('.tabpane').forEach(p=>p.classList.add('hide'));
    $('#tab_'+key).classList.remove('hide');
    if (key==='calendar') renderCalendar();
    if (key==='instructor') renderInstructorToday();
    if (key==='admin') renderAdmin();
    if (key==='reports') renderReports();
  }));
}

async function initAuth(){
  if (mode==='supabase'){
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) { state.user=session.user; await loadProfile(); await loadAllData(); showApp(); return; }
    supabaseClient.auth.onAuthStateChange(async (event, session) => {
      if (session) { state.user=session.user; await loadProfile(); await loadAllData(); showApp(); }
      else { state.user=null; state.profile=null; showAuth(); }
    });
    $('#btnSignUp').classList.remove('hide');
  } else {
    $('#btnSignUp').classList.add('hide');
    showAuth();
  }
}

async function signIn(){
  const email = $('#email').value.trim(); const password = $('#password').value;
  if (mode==='supabase'){
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) alert(error.message);
  } else {
    const db = readDemo();
    const u = (db.users||[]).find(x=>x.email.toLowerCase()===email.toLowerCase() && x.password===password);
    if (!u) return alert('Invalid credentials.');
    state.user = u; state.profile = u; await loadAllData(); showApp();
  }
}
async function signUp(){
  if (mode!=='supabase') return;
  const email = $('#email').value.trim(); const password = $('#password').value;
  const { error } = await supabaseClient.auth.signUp({ email, password });
  if (error) alert(error.message); else alert('Account created. Ask admin to set your role.');
}
async function signOut(){
  if (mode==='supabase'){ await supabaseClient.auth.signOut(); }
  state.user=null; state.profile=null; showAuth();
}

function showAuth(){
  $('#whoBadge').textContent = 'Not signed in';
  $('#btnSignOut').classList.add('hide');
  $('#authSection').classList.remove('hide');
  $('#appSection').classList.add('hide');
}
function showApp(){
  const name = (mode==='supabase') ? (state.profile?.is_admin ? 'Admin' : (state.profile?.name || 'Instructor')) : (state.user?.is_admin ? 'Admin' : (state.user?.name||'Instructor'));
  $('#whoBadge').textContent = name;
  $('#btnSignOut').classList.remove('hide');
  $('#authSection').classList.add('hide');
  $('#appSection').classList.remove('hide');
  renderCalendar(); renderInstructorToday(); renderAdmin(); renderReports();
}

// ---------- DATA LOADERS ----------
async function loadProfile(){
  if (mode==='supabase'){
    const { data } = await supabaseClient.from('profiles').select('*').eq('user_id', state.user.id).single();
    state.profile = data || null;
  }
}
async function loadAllData(){
  if (mode==='supabase'){
    const isAdmin = !!state.profile?.is_admin;
    const { data: inst } = await supabaseClient.from('profiles').select('*').order('name');
    state.instructors = (inst||[]).filter(p=>!p.is_admin);
    const { data: subs } = await supabaseClient.from('subjects').select('*').order('name');
    state.subjects = subs||[];
    const { data: asg } = await supabaseClient.from('assignments').select('*');
    state.assignments = asg||[];
    if (isAdmin){
      const { data: tops } = await supabaseClient.from('topics').select('*');
      state.topics = tops||[];
    } else {
      const myId = state.profile?.id || 'none';
      const { data: tops } = await supabaseClient.from('topics').select('*').eq('instructor_id', myId);
      state.topics = tops||[];
    }
  } else {
    const db = readDemo();
    state.instructors = (db.users||[]).filter(u=>!u.is_admin);
    state.subjects = db.subjects||[];
    state.assignments = db.assignments||[];
    if (state.user?.is_admin) state.topics = db.topics||[];
    else state.topics = (db.topics||[]).filter(t=>t.instructor_id===state.user?.id);
  }
}

// ---------- RENDERERS ----------
function renderCalendar(){
  const [Y,M] = state.viewMonth.split('-').map(Number);
  $('#monthTitle').textContent = new Date(Y, M-1, 1).toLocaleString(undefined, { month:'long', year:'numeric' });
  const dows = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  $('#calDow').innerHTML = dows.map(x=>`<div>${x}</div>`).join('');
  const grid = $('#calGrid'); grid.innerHTML='';
  const first = firstDayOfMonth(Y, M-1);
  const startOffset = first.getDay();
  const total = daysInMonth(Y, M-1);
  const prevDays = daysInMonth(Y, M-2);
  const cells = 42;
  for (let i=0;i<cells;i++){
    const el = document.createElement('div'); el.className='day';
    let dNum, dMonth=M-1, dYear=Y, other=false;
    if (i < startOffset){ dNum = prevDays - (startOffset - 1 - i); dMonth = M-2; other=true; }
    else if (i >= startOffset + total){ dNum = i - (startOffset + total) + 1; dMonth = M; other=true; }
    else { dNum = i - startOffset + 1; }
    const d = new Date(dYear, dMonth, dNum);
    const iso = d.toISOString().slice(0,10);
    if (iso === state.selectedDate) el.classList.add('sel');
    if (other) el.classList.add('other');
    const count = state.topics.filter(t=>t.date===iso).length;
    el.innerHTML = `<div class="n">${dNum}</div>${count? `<div class="muted small">${count} class${count>1?'es':''}</div>`:''}`;
    el.addEventListener('click', ()=>{ state.selectedDate = iso; renderCalendar(); renderDayList(); });
    grid.appendChild(el);
  }
  renderDayList();
}
function renderDayList(){
  $('#dayTitle').textContent = new Date(state.selectedDate+'T00:00:00').toDateString();
  const tbody = $('#dayTbody'); tbody.innerHTML='';
  const items = state.topics.filter(t=>t.date===state.selectedDate).sort((a,b)=>(a.start||'').localeCompare(b.start||''));
  $('#noClasses').classList.toggle('hide', items.length>0);
  for (const t of items){
    const subj = state.subjects.find(s=>s.id===t.subject_id);
    const inst = state.instructors.find(i=>i.id===t.instructor_id) || (state.user && state.user.id===t.instructor_id ? state.user : null);
    const tr = document.createElement('tr');
    const chk = document.createElement('input'); chk.type='checkbox'; chk.checked=!!t.completed;
    chk.onchange = async (e)=>{
      if (mode==='supabase'){
        const { error } = await supabaseClient.from('topics').update({ completed: e.target.checked, completed_at: e.target.checked ? new Date().toISOString() : null }).eq('id', t.id);
        if (error) alert(error.message);
      } else {
        const db = readDemo();
        const row = (db.topics||[]).find(x=>x.id===t.id);
        if (row){ row.completed = e.target.checked; row.completed_at = e.target.checked ? new Date().toISOString() : null; writeDemo(db); }
      }
      await loadAllData(); renderCalendar();
    };
    const td0 = document.createElement('td'); td0.appendChild(chk);
    const td1 = document.createElement('td'); td1.textContent = (t.start||'—') + (t.end? ' – '+t.end : '');
    const td2 = document.createElement('td'); td2.textContent = subj?.name || '—';
    const td3 = document.createElement('td'); td3.textContent = t.title || '';
    const td4 = document.createElement('td'); td4.textContent = inst?.name || '—';
    const td5 = document.createElement('td'); td5.textContent = (t.duration_hours||0);
    tr.append(td0,td1,td2,td3,td4,td5); tbody.appendChild(tr);
  }
}

function renderInstructorToday(){
  if (!state.user && !state.profile) { $('#mySchedule').innerHTML = '<div class="muted">No profile yet.</div>'; return; }
  const iso = todayISO();
  const myId = (mode==='supabase') ? state.profile?.id : state.user?.id;
  const items = state.topics.filter(t=>t.instructor_id===myId && t.date===iso).sort((a,b)=>(a.start||'').localeCompare(b.start||''));
  if (items.length===0){ $('#mySchedule').innerHTML = '<div class="muted">No classes scheduled for today.</div>'; return; }
  const rows = items.map(t=>{
    const subj = state.subjects.find(s=>s.id===t.subject_id);
    return `<div class="row"><span>${t.start||'—'}${t.end?' – '+t.end:''}</span><b>${subj?.name||''}</b><span>${t.title||''}</span><span>${t.duration_hours||0} h</span></div>`;
  }).join('');
  $('#mySchedule').innerHTML = rows;
}

function renderAdmin(){
  const isAdmin = (mode==='supabase') ? !!state.profile?.is_admin : !!state.user?.is_admin;
  $('#adminOnly').classList.toggle('hide', !isAdmin ? true : false);
  $('#adminBlock').classList.toggle('hide', isAdmin ? true : false);
  if (!isAdmin) return;
  if (mode==='demo'){
    const db = readDemo();
    const users = db.users||[];
    
document.getElementById('demoUsersPanel').innerHTML =
  users.map(u=>`<div class="row" data-id="${u.id}">
    <b class="grow">${u.name}</b>
    <span class="muted small">${u.email}</span>
    ${u.is_admin?'<span class="badge">Admin</span>':'<button class="btn small" data-act="editUser">Edit</button><button class="btn small warn" data-act="delUser">Delete</button>'}
  </div>`).join('');
document.getElementById('pwUser').innerHTML = users.map(u=>`<option value="${u.id}">${u.name} – ${u.email}</option>`).join('');

  } else {
    document.getElementById('demoUsersPanel').innerHTML = '<div class="muted">Using Supabase authentication.</div>';
  }
  // Populate selects
  $('#asgnSubject').innerHTML = '<option value="">Select subject</option>' + state.subjects.map(s=>`<option value="${s.id}">${s.name}</option>`).join('');
  const allInst = [...state.instructors];
  $('#asgnInstructor').innerHTML = '<option value="">Select instructor</option>' + allInst.map(i=>`<option value="${i.id}">${i.name||i.email}</option>`).join('');
  $('#topicSubject').innerHTML = '<option value="">Select subject</option>' + state.subjects.map(s=>`<option value="${s.id}">${s.name}</option>`).join('');
  $('#topicInstructor').innerHTML = '<option value="">Select instructor</option>' + allInst.map(i=>`<option value="${i.id}">${i.name||i.email}</option>`).join('');
  $('#subjList').innerHTML = state.subjects.map(s=>`<div class="row"><b>${s.name}</b><span class="muted">${s.total_hours} h</span></div>`).join('') || '<div class="muted">No subjects.</div>';
  const rows = state.topics.slice().sort((a,b)=>a.date.localeCompare(b.date)).map(t=>{
    const subj = state.subjects.find(s=>s.id===t.subject_id);
    const inst = state.instructors.find(i=>i.id===t.instructor_id);
    return `<div class="row"><span>${t.date}</span><b>${subj?.name||''}</b><span>${t.title||''}</span><span>${inst?.name||''}</span><span>${t.duration_hours||0} h</span></div>`;
  }).join('');
  $('#topicList').innerHTML = rows || '<div class="muted">No topics yet.</div>';


  // Rebuild Topic list with Edit/Delete controls (admin only)
  try {
    const topicListEl = document.getElementById('topicList');
    if (topicListEl){
      const isAdmin = (mode==='supabase') ? !!state.profile?.is_admin : !!state.user?.is_admin;
      if (isAdmin){
        const trows = state.topics.slice().sort((a,b)=> (a.date||'').localeCompare(b.date||'')).map(t=>{
          const subj = state.subjects.find(s=>s.id===t.subject_id);
          const inst = state.instructors.find(i=>i.id===t.instructor_id);
          return `<div class="row" data-topic="${t.id}">
            <span>${t.date||''}</span>
            <b class="grow">${subj?.name||''}</b>
            <span>${inst?.name||''}</span>
            <span>${t.duration_hours||0} h</span>
            <button class="btn small" data-act="editTopic">Edit</button>
            <button class="btn small warn" data-act="delTopic">Delete</button>
          </div>`;
        }).join('');
        topicListEl.innerHTML = trows || '<div class="muted">No topics yet.</div>';
      }
    }
  } catch(e){}


  // Rebuild Subjects list with Edit/Delete controls (local mode)
  try {
    const subjListEl = document.getElementById('subjList');
    if (subjListEl){
      const rows = (state.subjects||[]).map(s=>`<div class="row" data-subj="${s.id}">
        <b class="grow">${s.name}</b>
        <span class="muted small">${(s.total_hours||0)} h</span>
        <button class="btn small" data-act="editSubject">Edit</button>
        <button class="btn small warn" data-act="delSubject">Delete</button>
      </div>`).join('');
      subjListEl.innerHTML = rows || '<div class="muted">No subjects.</div>';
    }
  } catch(e){}
}

// ---------- ADMIN ACTIONS ----------
async function createInstructorProfile(){
  const name = $('#instName').value.trim();
  const email = $('#instEmail').value.trim();
  if (!name || !email) return alert('Enter name and email');
  if (mode==='supabase'){
    const { error } = await supabaseClient.from('profiles').insert({ name, email, is_admin: false });
    if (error) alert(error.message); else { alert('Instructor profile created. Ask them to sign up with this email.'); await loadAllData(); renderAdmin(); }
  } else {
    const db = readDemo();
    if ((db.users||[]).some(u=>u.email.toLowerCase()===email.toLowerCase())) return alert('Email already exists.');
    const id = 'p_' + Math.random().toString(36).slice(2,8);
    db.users.push({ id, email, name, is_admin:false, password:'123456' });
    writeDemo(db); alert('Instructor profile created. Default password 123456.');
    await loadAllData(); renderAdmin();
  }
}

async function setDemoPassword(){
  if (mode!=='demo') return;
  const uid = document.getElementById('pwUser').value;
  const pw = document.getElementById('pwNew').value.trim();
  if (!uid || !pw) return alert('Select user and enter a new password.');
  const db = readDemo();
  const u = (db.users||[]).find(x=>x.id===uid); if (!u) return alert('User not found');
  u.password = pw; writeDemo(db); alert('Password updated.');
  renderAdmin();
}

async function addSubject(){
  const name = $('#subjName').value.trim();
  const total = parseFloat($('#subjHours').value||'0');
  if (!name || !(total>=0)) return;
  if (mode==='supabase'){
    const { error } = await supabaseClient.from('subjects').insert({ name, total_hours: total });
    if (error) alert(error.message); else { await loadAllData(); renderAdmin(); }
  } else {
    const db = readDemo();
    const id = 's_' + Math.random().toString(36).slice(2,8);
    db.subjects.push({ id, name, total_hours: total });
    writeDemo(db); await loadAllData(); renderAdmin();
  }
}

async function assignSubject(){
  const subject_id = $('#asgnSubject').value;
  const instructor_id = $('#asgnInstructor').value;
  if (!subject_id || !instructor_id) return;
  if (mode==='supabase'){
    const { error } = await supabaseClient.from('assignments').insert({ subject_id, instructor_id });
    if (error) alert(error.message); else { alert('Assigned.'); await loadAllData(); renderAdmin(); }
  } else {
    const db = readDemo();
    const id = 'a_' + Math.random().toString(36).slice(2,8);
    db.assignments.push({ id, subject_id, instructor_id });
    writeDemo(db); alert('Assigned.'); await loadAllData(); renderAdmin();
  }
}

async function addTopic(){
  const subject_id = $('#topicSubject').value;
  const instructor_id = $('#topicInstructor').value;
  const date = $('#topicDate').value;
  const hours = parseFloat($('#topicHours').value||'0');
  const start = $('#topicStart').value || null;
  const end = $('#topicEnd').value || null;
  const title = $('#topicTitle').value.trim();
  if (!subject_id || !instructor_id || !date || !title) return;
  if (mode==='supabase'){
    const { error } = await supabaseClient.from('topics').insert({ subject_id, instructor_id, date, start, end, duration_hours: hours, title, completed: false });
    if (error) alert(error.message); else { await loadAllData(); renderCalendar(); renderAdmin(); }
  } else {
    const db = readDemo();
    db.topics.push({ id:'t_'+Math.random().toString(36).slice(2,8), subject_id, instructor_id, date, start, end, duration_hours: hours, title, completed:false });
    writeDemo(db); await loadAllData(); renderCalendar(); renderAdmin();
  }
}

// ---------- BACKUP (DEMO MODE) ----------
function exportBackup(){
  if (mode!=='demo') return alert('Backups are for Demo Mode only.');
  const db = readDemo();
  const blob = new Blob([JSON.stringify(db, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'aa-maritime-backup.json';
  a.click();
  URL.revokeObjectURL(a.href);
}
function importBackup(evt){
  if (mode!=='demo') return alert('Backups are for Demo Mode only.');
  const file = evt.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data.users || !data.subjects || !data.topics) throw new Error('Invalid backup file');
      localStorage.setItem(DEMO_LS_KEY, JSON.stringify(data));
      alert('Backup imported.');
      loadAllData().then(()=>{ renderCalendar(); renderAdmin(); renderReports(); });
    } catch(e){ alert('Import failed: '+e.message); }
  };
  reader.readAsText(file);
}

// ---------- REPORTS ----------
function renderReports(){
  const isAdmin = (mode==='supabase') ? !!state.profile?.is_admin : !!state.user?.is_admin;
  const myId = (mode==='supabase'? state.profile?.id : state.user?.id);
  const list = isAdmin? state.topics : state.topics.filter(t=>t.instructor_id===myId);

  let head='<table class="table"><thead><tr><th>Subject</th><th>Date</th><th>Hours</th><th>Topic Name</th><th>Instructor</th><th>Status</th></tr></thead><tbody>';

  let body=list.map(t=>{
    const subj = state.subjects.find(s=>s.id===t.subject_id);
    const inst = state.instructors.find(i=>i.id===t.instructor_id);
    const status = t.completed? 'Complete':'Pending';
    const topic = t.completed? (t.title||''):'No completed topics yet';
    const instructor = t.completed? (inst?.name||inst?.email||''):'No completed topics yet';
    const date = t.date||'';
    const hours = (t.duration_hours||0).toFixed(1);
    return `<tr><td>${subj?.name||''}</td><td>${date}</td><td>${hours}</td><td>${topic}</td><td>${instructor}</td><td>${status}</td></tr>`;
  }).join("");

  // If no topics at all
  if(!list.length){
    body = '<tr><td colspan="6" class="muted">No topics entered yet.</td></tr>';
  }

  $('#hoursSummary').innerHTML = head + body + '</tbody></table>';
}
// Instructor management (Demo Mode only)

// Topic management (Demo & Supabase)
document.addEventListener('click', function(e){
  const btn = e.target.closest('[data-act]'); if (!btn) return;
  const act = btn.getAttribute('data-act');
  if (act!=='editTopic' && act!=='delTopic') return;
  const row = btn.closest('[data-topic]'); if (!row) return;
  const id = row.getAttribute('data-topic');
  if (act==='editTopic') return editTopic(id);
  if (act==='delTopic') return deleteTopic(id);
}, true);

async function editTopic(id){
  if (mode==='supabase'){
    const t = (state.topics||[]).find(x=>x.id===id);
    if (!t) return alert('Topic not found.');
    const newTitle = prompt('Topic title:', t.title||''); if (newTitle===null) return;
    const newHoursStr = prompt('Hours:', String(t.duration_hours||0)); if (newHoursStr===null) return;
    const newHours = parseFloat(newHoursStr); if (!(newHours>=0)) return alert('Invalid hours');
    const { error } = await supabaseClient.from('topics').update({ title: newTitle.trim(), duration_hours: newHours }).eq('id', id);
    if (error) return alert(error.message);
    await loadAllData(); renderAdmin(); renderCalendar(); renderReports();
  } else {
    const db = readDemo();
    const t = (db.topics||[]).find(x=>x.id===id);
    if (!t) return alert('Topic not found.');
    const newTitle = prompt('Topic title:', t.title||''); if (newTitle===null) return;
    const newHoursStr = prompt('Hours:', String(t.duration_hours||0)); if (newHoursStr===null) return;
    const newHours = parseFloat(newHoursStr); if (!(newHours>=0)) return alert('Invalid hours');
    t.title = newTitle.trim();
    t.duration_hours = newHours;
    writeDemo(db);
    await loadAllData(); renderAdmin(); renderCalendar(); renderReports();
  }
}

async function deleteTopic(id){
  if (!confirm('Delete this topic?')) return;
  if (mode==='supabase'){
    const { error } = await supabaseClient.from('topics').delete().eq('id', id);
    if (error) return alert(error.message);
    await loadAllData(); renderAdmin(); renderCalendar(); renderReports();
  } else {
    const db = readDemo();
    const idx = (db.topics||[]).findIndex(x=>x.id===id);
    if (idx===-1) return alert('Topic not found.');
    db.topics.splice(idx,1);
    writeDemo(db);
    await loadAllData(); renderAdmin(); renderCalendar(); renderReports();
  }
}


document.addEventListener('click', function(e){
  const btn = e.target.closest('[data-act]'); if (!btn) return;
  const act = btn.getAttribute('data-act');
  const row = btn.closest('[data-id]'); if (!row) return;
  const id = row.getAttribute('data-id');
  if (act==='editUser') editInstructorName(id);
  if (act==='delUser') deleteInstructor(id);
}, true);

function editInstructorName(userId){
  if (mode!=='demo') return alert('Edit available in local mode.');
  const db = readDemo(); const u = (db.users||[]).find(x=>x.id===userId && !x.is_admin);
  if (!u) return alert('Instructor not found.');
  const nn = prompt('New instructor name:', u.name); if (!nn) return;
  u.name = nn.trim(); writeDemo(db); loadData().then(()=>{ renderAdmin(); renderCalendar(); });
}
function deleteInstructor(userId){
  if (mode!=='demo') return alert('Delete available in local mode.');
  const db = readDemo(); const u = (db.users||[]).find(x=>x.id===userId && !x.is_admin);
  if (!u) return alert('Instructor not found.');
  if (!confirm('Delete instructor "'+u.name+'" and related items?')) return;
  db.users = (db.users||[]).filter(x=>x.id!==userId);
  db.topics = (db.topics||[]).filter(t=>t.instructor_id!==userId);
  db.assignments = (db.assignments||[]).filter(a=>a.instructor_id!==userId);
  writeDemo(db); loadData().then(()=>{ renderAdmin(); renderCalendar(); });
}

// Subject management (Demo Mode)
document.addEventListener('click', function(e){
  const btn = e.target.closest('[data-act]'); if (!btn) return;
  const act = btn.getAttribute('data-act');
  if (act!=='editSubject' && act!=='delSubject') return;
  const row = btn.closest('[data-subj]'); if (!row) return;
  const id = row.getAttribute('data-subj');
  if (act==='editSubject') return editSubject(id);
  if (act==='delSubject') return deleteSubject(id);
}, true);

async function editSubject(id){
  if (mode!=='demo') return alert('Edit subjects is available in local mode.');
  const db = readDemo();
  const s = (db.subjects||[]).find(x=>x.id===id); if (!s) return alert('Subject not found.');
  const newName = prompt('Subject name:', s.name||''); if (newName===null) return;
  const newHoursStr = prompt('Total hours:', String(s.total_hours||0)); if (newHoursStr===null) return;
  const newHours = parseFloat(newHoursStr); if (!(newHours>=0)) return alert('Invalid hours');
  s.name = newName.trim(); s.total_hours = newHours;
  writeDemo(db); await loadAllData(); renderAdmin(); renderReports();
}

async function deleteSubject(id){
  if (mode!=='demo') return alert('Delete subjects is available in local mode.');
  const db = readDemo();
  const s = (db.subjects||[]).find(x=>x.id===id); if (!s) return alert('Subject not found.');
  if (!confirm('Delete subject "'+(s.name||'')+'" and all related topics/assignments?')) return;
  db.subjects = (db.subjects||[]).filter(x=>x.id!==id);
  db.topics = (db.topics||[]).filter(t=>t.subject_id!==id);
  db.assignments = (db.assignments||[]).filter(a=>a.subject_id!==id);
  writeDemo(db); await loadAllData(); renderAdmin(); renderReports(); renderCalendar();
}

// restrict completion to today
function enforceTodayCompletion(topic){
  const today=new Date().toISOString().slice(0,10);
  const d=(topic.date||"").slice(0,10);
  if(topic.completed && d!==today){ topic.completed=false; }
}

function populateReportFilters() {
  const subjectSelect = document.getElementById("reportSubjectSelect");
  const instructorSelect = document.getElementById("reportInstructorSelect");

  if (!subjectSelect || !instructorSelect) return;

  // Clear first
  subjectSelect.innerHTML = "";
  instructorSelect.innerHTML = `<option value="all">All instructors</option>`;

  // Subjects list must already exist in your app
  if (window.subjects && Array.isArray(subjects)) {
    subjects.forEach(subj => {
      const opt = document.createElement("option");
      opt.value = subj.id;
      opt.textContent = subj.name;
      subjectSelect.appendChild(opt);
    });
  }

  // Instructors list must already exist in your app
  if (window.instructors && Array.isArray(instructors)) {
    instructors.forEach(inst => {
      const opt = document.createElement("option");
      opt.value = inst.id;
      opt.textContent = inst.name;
      instructorSelect.appendChild(opt);
    });
  }
}
function generateSubjectReport() {
  const subjectSelect = document.getElementById("reportSubjectSelect");
  const instructorSelect = document.getElementById("reportInstructorSelect");
  const tbody = document.querySelector("#subjectReportTable tbody");

  if (!subjectSelect || !instructorSelect || !tbody) return;

  const selectedSubjectId = subjectSelect.value;
  const selectedInstructorId = instructorSelect.value;

  const subject = subjects.find(s => s.id === selectedSubjectId);
  if (!subject) {
    alert("Please select a subject.");
    return;
  }

  const requiredHours = Number(subject.requiredHours || 0);

  // Filter lessons (topics)
  const filteredTopics = (topics || []).filter(t => {
    if (t.subjectId !== selectedSubjectId) return false;
    if (selectedInstructorId !== "all" && t.instructorId !== selectedInstructorId) return false;
    return true;
  });

  const deliveredByInstructor = {};
  let totalDelivered = 0;

  filteredTopics.forEach(t => {
    const hrs = Number(t.hours) || 0;
    if (!deliveredByInstructor[t.instructorId]) deliveredByInstructor[t.instructorId] = 0;
    deliveredByInstructor[t.instructorId] += hrs;
    totalDelivered += hrs;
  });

  tbody.innerHTML = "";

  Object.keys(deliveredByInstructor).forEach(id => {
    const inst = instructors.find(i => i.id === id);
    const instructorName = inst ? inst.name : "(Unknown)";
    const delivered = deliveredByInstructor[id];
    const remaining = Math.max(requiredHours - delivered, 0);

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${subject.name}</td>
      <td>${instructorName}</td>
      <td>${requiredHours}</td>
      <td>${delivered}</td>
      <td>${remaining}</td>
    `;
    tbody.appendChild(tr);
  });

  if (selectedInstructorId === "all") {
    const remaining = Math.max(requiredHours - totalDelivered, 0);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${subject.name}</strong></td>
      <td><strong>Total (All)</strong></td>
      <td><strong>${requiredHours}</strong></td>
      <td><strong>${totalDelivered}</strong></td>
      <td><strong>${remaining}</strong></td>
    `;
    tbody.appendChild(tr);
  }
}
document.addEventListener("DOMContentLoaded", () => {
  populateReportFilters();

  const btn = document.getElementById("generateSubjectReportBtn");
  if (btn) btn.addEventListener("click", generateSubjectReport);
});
