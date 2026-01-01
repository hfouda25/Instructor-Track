// Demo Mode + optional Supabase Mode, with @aamaritime.gy users
// *** Put your project URL and ANON PUBLIC KEY here ***
const SUPABASE_URL = 'https://wjszrzxuxutsslfgvuwd.supabase.co';   // <-- your project URL
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXV...wYI5YyWxLTs1l2Z-IGrlcWatq8oZtkN4Uk'; // <-- your anon public key

// Keys to store config in browser (Settings tab)
const CFG_URL_KEY = 'itt_supabase_url';
const CFG_ANON_KEY = 'itt_supabase_anon_key';

// Start in demo; will switch to "supabase" only when URL+key are valid
let mode = 'demo';
let supabaseClient = null;

// Read config (first from localStorage, fallback to hard-coded constants)
function getConfig() {
  const url = localStorage.getItem(CFG_URL_KEY) || SUPABASE_URL || '';
  const anon = localStorage.getItem(CFG_ANON_KEY) || SUPABASE_ANON_KEY || '';
  return { url, anon };
}

// Save config from Settings tab
function saveConfig(url, anon) {
  localStorage.setItem(CFG_URL_KEY, url || '');
  localStorage.setItem(CFG_ANON_KEY, anon || '');
}

// Try to initialize Supabase; if fails, stay in demo mode
async function initSupabaseIfPossible() {
  const { url, anon } = getConfig();
  if (!url || !anon) {
    mode = 'demo';
    supabaseClient = null;
    return;
  }
  try {
    supabaseClient = window.supabase.createClient(url, anon);
    mode = 'supabase';
  } catch (e) {
    console.error('Error creating Supabase client', e);
    mode = 'demo';
    supabaseClient = null;
  }
}

// ---------- DEMO STORAGE ----------
const DEMO_LS_KEY = 'itt_demo_db';

// Create demo data if not existing
function seedDemo() {
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
      {
        id:'t1',
        subject_id:'s_nav',
        instructor_id:'p_ahmed',
        title:'Mercator Sailing',
        date: new Date().toISOString().slice(0,10),
        start:'09:00',
        end:'11:00',
        duration_hours:2
      }
    ],
    deliveries: []
  };
  localStorage.setItem(DEMO_LS_KEY, JSON.stringify(demo));
}
function readDemo(){ return JSON.parse(localStorage.getItem(DEMO_LS_KEY)||'{}'); }
function writeDemo(db){ localStorage.setItem(DEMO_LS_KEY, JSON.stringify(db)); }

// ---------- APP STATE ----------
const state = {
  user:null,
  profile:null,
  subjects:[],
  instructors:[],
  topics:[],
  deliveries:[],
  viewMonth: (()=>{ const d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); })(),
  subjectsById:{},
  instructorsById:{},
  topicsById:{}
};

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

  // NEW: reload instructors list in Admin tab
  $('#btnReloadInstructors').onclick = () => loadInstructorsList();

  $('#prevMonth').onclick = ()=>{ const [Y,M]=state.viewMonth.split('-').map(Number); const d=new Date(Y,M-2,1); state.viewMonth=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); renderCalendar(); };
  $('#nextMonth').onclick = ()=>{ const [Y,M]=state.viewMonth.split('-').map(Number); const d=new Date(Y,M,1); state.viewMonth=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); renderCalendar(); };

  const imp = document.getElementById('fileImport');
  if (imp) imp.addEventListener('change', importBackup, false);
  const exp = document.getElementById('btnExport'); if (exp) exp.onclick = exportBackup;
  const prn = document.getElementById('btnPrint'); if (prn) prn.onclick = ()=>window.print();
}

function bindTabs(){
  $$('.tab').forEach(btn=>btn.addEventListener('click', ()=>{
    $$('.tab').forEach(x=>x.classList.remove('active')); btn.classList.add('active');
    const key = btn.dataset.tab;
    $$('.tabpane').forEach(p=>p.classList.add('hide'));
    $(`#tab_${key}`).classList.remove('hide');
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
  const email = $('#email').value.trim();
  const password = $('#password').value;

  if (mode==='supabase'){
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      alert(error.message);
      return;
    }

    const user = data.user;

    // get profile record
    const { data: profiles, error: pErr } = await supabaseClient
      .from('profiles')
      .select('*')
      .eq('email', user.email)
      .limit(1);

    if (pErr || !profiles || !profiles.length) {
      alert('No profile found for this account. Contact admin.');
      await supabaseClient.auth.signOut();
      return;
    }

    const profile = profiles[0];

    if (profile.is_active === false) {
      alert('This account has been disabled by admin.');
      await supabaseClient.auth.signOut();
      return;
    }

    // save to app state
    state.user = user;
    state.profile = profile;

    await loadAllData();
    showApp();

    // if this user is admin, load the instructors list into the Admin tab
    if (state.profile && state.profile.is_admin) {
      loadInstructorsList();
    }

  } else {
    // DEMO mode login (local JSON)
    const db = readDemo();
    const u = (db.users||[]).find(
      x => x.email.toLowerCase()===email.toLowerCase() && x.password===password
    );
    if (!u) return alert('Invalid credentials.');
    state.user = u;
    state.profile = u;
    await loadAllData();
    showApp();
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
  $('#whoBadge').textContent = (state.profile?.name||state.user?.email||'User');
  $('#btnSignOut').classList.remove('hide');
  $('#authSection').classList.add('hide');
  $('#appSection').classList.remove('hide');
  renderCalendar();
  renderInstructorToday();
  renderAdmin();
  renderReports();
}

// ---------- LOAD DATA ----------
async function loadProfile(){
  if (mode!=='supabase' || !state.user) { state.profile=null; return; }
  const { data, error } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('email', state.user.email)
    .limit(1);
  if (error) { alert('Error loading profile: '+error.message); state.profile=null; return; }
  state.profile = data[0]||null;
}

async function loadAllData(){
  if (mode==='supabase'){
    const [ subj, inst, topics, deliveries ] = await Promise.all([
      supabaseClient.from('subjects').select('*').order('name'),
      supabaseClient.from('profiles').select('*').eq('is_admin', false).order('name'),
      supabaseClient.from('topics').select('*').order('date'),
      supabaseClient.from('deliveries').select('*').order('date')
    ]);
    if (subj.error) alert('Error subjects: '+subj.error.message);
    if (inst.error) alert('Error instructors: '+inst.error.message);
    if (topics.error) alert('Error topics: '+topics.error.message);
    if (deliveries.error) alert('Error deliveries: '+deliveries.error.message);
    state.subjects = subj.data||[];
    state.instructors = inst.data||[];
    state.topics = topics.data||[];
    state.deliveries = deliveries.data||[];
  } else {
    const db = readDemo();
    state.subjects = db.subjects||[];
    state.instructors = db.users.filter(x=>!x.is_admin);
    state.topics = db.topics||[];
    state.deliveries = db.deliveries||[];
  }
  state.subjectsById = Object.fromEntries(state.subjects.map(x=>[x.id,x]));
  state.instructorsById = Object.fromEntries(state.instructors.map(x=>[x.id,x]));
  state.topicsById = Object.fromEntries(state.topics.map(x=>[x.id,x]));
}

// ---------- HELPERS ----------
function $(sel){ return document.querySelector(sel); }
function $$(sel){ return Array.from(document.querySelectorAll(sel)); }

function todayISO(){ return new Date().toISOString().slice(0,10); }

// ---------- CALENDAR ----------
function renderCalendar(){
  const container = $('#calendarGrid');
  if (!container) return;
  const [Y,M] = state.viewMonth.split('-').map(Number);
  const first = new Date(Y, M-1, 1);
  const startDow = first.getDay(); // 0=Sun
  const daysInMonth = new Date(Y, M, 0).getDate();
  const cells = [];

  for (let i=0;i<startDow;i++){ cells.push(null); }
  for (let d=1; d<=daysInMonth; d++){ cells.push(d); }

  container.innerHTML = '';
  cells.forEach(day=>{
    const div = document.createElement('div');
    div.className = 'dayCell';
    if (day===null){ div.classList.add('empty'); container.appendChild(div); return; }
    const dateStr = `${Y}-${String(M).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    div.dataset.date = dateStr;
    const title = document.createElement('div');
    title.className = 'dayNumber';
    title.textContent = day;
    div.appendChild(title);

    const ul = document.createElement('ul');
    ul.className = 'topicsList';
    state.topics.filter(t=>t.date===dateStr).forEach(t=>{
      const li = document.createElement('li');
      const subj = state.subjectsById[t.subject_id];
      const inst = state.instructorsById[t.instructor_id];
      li.textContent = `${t.start||''} ${subj?.name||''} / ${inst?.name||''} (${t.duration_hours||0}h)`;
      ul.appendChild(li);
    });
    div.appendChild(ul);
    container.appendChild(div);
  });

  $('#monthLabel').textContent = new Date(Y, M-1, 1).toLocaleDateString(undefined, { month:'long', year:'numeric' });

  const list = $('#dayDetails');
  if (list) list.innerHTML = '';
}

// ---------- INSTRUCTOR TODAY ----------
function renderInstructorToday(){
  const tbl = $('#tblToday');
  if (!tbl) return;
  const tbody = tbl.querySelector('tbody');
  tbody.innerHTML = '';

  const today = todayISO();
  const todaysTopics = state.topics.filter(t=>t.date===today);
  if (!todaysTopics.length){
    const tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="5" class="muted">No classes today.</td>';
    tbody.appendChild(tr);
    return;
  }

  todaysTopics.forEach(t=>{
    const subj = state.subjectsById[t.subject_id];
    const inst = state.instructorsById[t.instructor_id];
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${t.date}</td>
      <td>${t.start||''}</td>
      <td>${subj?.name||''}</td>
      <td>${t.title||''}</td>
      <td>${inst?.name||''}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ---------- ADMIN TAB ----------
function renderAdmin(){
  const isAdmin = (mode==='supabase') ? (state.profile?.is_admin===true) : true;
  const adminOnly = $('#adminOnly');
  const adminBlock = $('#adminBlock');
  if (!adminOnly || !adminBlock) return;

  if (!isAdmin){
    adminOnly.classList.add('hide');
    adminBlock.classList.remove('hide');
  } else {
    adminOnly.classList.remove('hide');
    adminBlock.classList.add('hide');
  }

  const instSelect = $('#topicInstructor');
  if (instSelect){
    instSelect.innerHTML = state.instructors.map(i=>`<option value="${i.id}">${i.name||i.email}</option>`).join('');
  }

  const subjSelect = $('#topicSubject');
  if (subjSelect){
    subjSelect.innerHTML = state.subjects.map(s=>`<option value="${s.id}">${s.name}</option>`).join('');
  }

  const assignSubj = $('#asgnSubject');
  const assignInst = $('#asgnInstructor');
  if (assignSubj && assignInst){
    assignSubj.innerHTML = state.subjects.map(s=>`<option value="${s.id}">${s.name}</option>`).join('');
    assignInst.innerHTML = state.instructors.map(i=>`<option value="${i.id}">${i.name||i.email}</option>`).join('');
  }

  const subjList = $('#subjList');
  if (subjList){
    subjList.innerHTML = state.subjects.map(s=>{
      const total = s.total_hours||0;
      const delivered = state.topics
        .filter(t=>t.subject_id===s.id)
        .reduce((sum,t)=>sum+(t.duration_hours||0),0);
      return `<li><b>${s.name}</b> – total ${total}h, planned ${delivered.toFixed(1)}h</li>`;
    }).join('') || '<li class="muted">No subjects yet.</li>';
  }

  const topicList = $('#topicList');
  if (topicList){
    topicList.innerHTML = state.topics.map(t=>{
      const subj = state.subjectsById[t.subject_id];
      const inst = state.instructorsById[t.instructor_id];
      return `<li>
        <b>${t.date}</b> ${t.start||''}-${t.end||''} – ${subj?.name||''} /
        ${inst?.name||inst?.email||''} – ${t.title||''} (${t.duration_hours||0}h)
      </li>`;
    }).join('') || '<li class="muted">No topics yet.</li>';
  }

  // Demo users panel
  if (mode==='demo'){
    const db = readDemo();
    const users = db.users||[];

    document.getElementById('demoUsersPanel').innerHTML =
      users.map(u=>`<div class="row" data-id="${u.id}">
        <b class="grow">${u.name}</b>
        <span class="muted small">${u.email}</span>
        ${u.is_admin?'<span class="badge">Admin</span>':'<button class="btn small warn" data-act="delUser">Delete</button>'}
      </div>`).join('');
    document.getElementById('pwUser').innerHTML = users.map(u=>`<option value="${u.id}">${u.name} – ${u.email}</option>`).join('');

  } else {
    document.getElementById('demoUsersPanel').innerHTML = '<div class="muted">Using Supabase authentication.</div>';
  }
  // Populate selects
  $('#asgnSubject').innerHTML = '<option value="">Select subject</option>' + state.subjects.map(s=>`<option value="${s.id}">${s.name}</option>`).join('');
  const allInst = [...state.instructors];
  $('#asgnInstructor').innerHTML = '<option value="">Select instructor</option>' + allInst.map(i=>`<option value="${i.id}">${i.name||i.email}</option>`).join('');

}

async function createInstructorProfile(){
  if (mode!=='supabase') return alert('Creating instructors is only available in Supabase mode.');
  const name = $('#instName').value.trim();
  const email = $('#instEmail').value.trim().toLowerCase();
  if (!name || !email) return alert('Enter full name and email.');
  if (!email.endsWith('@aamaritime.gy')) return alert('Email must be @aamaritime.gy');

  const { data: existing, error: errCheck } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('email', email)
    .limit(1);

  if (errCheck) return alert('Error checking existing profiles: '+errCheck.message);
  if (existing && existing.length) return alert('Profile already exists for this email.');

  const { data, error } = await supabaseClient
    .from('profiles')
    .insert({ name, email, is_admin:false, is_active:true })
    .select();
  if (error) return alert('Error creating profile: '+error.message);

  alert('Instructor profile created. Ask admin to set a password in Supabase Auth.');
  $('#instName').value='';
  $('#instEmail').value='';
  await loadAllData();
  renderAdmin();
}

// Demo password update
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
    const { error } = await supabaseClient.from('subjects').insert({ name, total_hours:total });
    if (error) return alert(error.message);
  } else {
    const db = readDemo();
    const id = 's_'+Date.now();
    db.subjects = db.subjects||[];
    db.subjects.push({ id, name, total_hours:total });
    writeDemo(db);
  }
  $('#subjName').value='';
  $('#subjHours').value='';
  await loadAllData();
  renderAdmin();
  renderCalendar();
  renderReports();
}

async function assignSubject(){
  const subjectId = $('#asgnSubject').value;
  const instId = $('#asgnInstructor').value;
  if (!subjectId || !instId) return;
  if (mode==='supabase'){
    const { error } = await supabaseClient.from('assignments').insert({ subject_id:subjectId, instructor_id:instId });
    if (error) return alert(error.message);
  } else {
    const db = readDemo();
    db.assignments = db.assignments||[];
    const id = 'a_'+Date.now();
    db.assignments.push({ id, subject_id:subjectId, instructor_id:instId });
    writeDemo(db);
  }
  await loadAllData();
  renderAdmin();
  renderCalendar();
  renderReports();
}

async function addTopic(){
  const subjectId = $('#topicSubject').value;
  const instId = $('#topicInstructor').value;
  const date = $('#topicDate').value || todayISO();
  const hours = parseFloat($('#topicHours').value||'0');
  const title = $('#topicTitle').value.trim();
  const start = $('#topicStart').value||'';
  const end = $('#topicEnd').value||'';
  if (!subjectId || !instId || !(hours>0)) return alert('Select subject, instructor and valid hours.');
  const payload = {
    subject_id:subjectId,
    instructor_id:instId,
    date,
    duration_hours:hours,
    title,
    start,
    end
  };
  if (mode==='supabase'){
    const { error } = await supabaseClient.from('topics').insert(payload);
    if (error) return alert(error.message);
  } else {
    const db = readDemo();
    db.topics = db.topics||[];
    payload.id = 't_'+Date.now();
    db.topics.push(payload);
    writeDemo(db);
  }
  $('#topicTitle').value='';
  await loadAllData();
  renderAdmin();
  renderCalendar();
  renderReports();
}

// ---------- BACKUP (DEMO ONLY) ----------
function exportBackup(){
  const db = readDemo();
  const blob = new Blob([JSON.stringify(db,null,2)], { type:'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href=url; a.download='itt_backup.json'; a.click();
  URL.revokeObjectURL(url);
}
function importBackup(evt){
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
function renderReports() {
  // Hours Summary table
  const isAdmin = (mode === 'supabase')
    ? (state.profile?.is_admin === true)
    : true;

  const container = document.getElementById('hoursSummary');
  if (!container) return;

  if (!isAdmin) {
    // Hide for non-admins in Supabase mode
    container.innerHTML = '<div class="muted">Reports available for admins only.</div>';
    return;
  }

  // Only proceed if we have data
  if (!state.subjects.length || !state.instructors.length) {
    container.innerHTML = '<div class="muted">No data yet for reports.</div>';
    return;
  }

  populateSubjectReportFilters();

  if (!subjectReportButtonBound) {
    const btn = document.getElementById('generateSubjectReportBtn');
    if (btn) {
      btn.addEventListener('click', generateSubjectReport);
      subjectReportButtonBound = true;
    }
  }

  // Also regenerate summary table immediately
  generateSubjectReport();
}

function populateSubjectReportFilters() {
  const subjectSelect = document.getElementById('reportSubjectSelect');
  const instructorSelect = document.getElementById('reportInstructorSelect');

  if (!subjectSelect || !instructorSelect) return;

  const subjects = state.subjects || [];
  const instructors = state.instructors || [];

  // Clear any existing options
  subjectSelect.innerHTML = '';
  instructorSelect.innerHTML = '<option value="all">All instructors</option>';

  // Subjects
  subjects.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.name || s.title || ('Subject ' + s.id);
    subjectSelect.appendChild(opt);
  });

  // Instructors
  instructors.forEach(i => {
    const opt = document.createElement('option');
    opt.value = i.id;
    opt.textContent = i.name || i.email || ('Instructor ' + i.id);
    instructorSelect.appendChild(opt);
  });
}

let subjectReportButtonBound = false;

function generateSubjectReport() {
  const subjectSelect = document.getElementById('reportSubjectSelect');
  const instructorSelect = document.getElementById('reportInstructorSelect');
  const tbody = document.querySelector('#subjectReportTable tbody');

  if (!subjectSelect || !instructorSelect || !tbody) return;

  const selectedSubjectId = subjectSelect.value;
  const selectedInstructorId = instructorSelect.value;

  if (!selectedSubjectId) return;

  const subject = state.subjectsById[selectedSubjectId];
  const topics = state.topics.filter(t => t.subject_id === selectedSubjectId);

  const grouped = {};

  topics.forEach(t => {
    if (selectedInstructorId !== 'all' && t.instructor_id !== selectedInstructorId) return;
    const key = t.instructor_id;
    if (!grouped[key]) {
      grouped[key] = {
        instructor_id: key,
        hours: 0
      };
    }
    grouped[key].hours += (t.duration_hours || 0);
  });

  const rows = Object.values(grouped);
  const instructorsById = state.instructorsById;

  tbody.innerHTML = '';

  const requiredHours = subject?.total_hours || 0;
  let totalDelivered = 0;

  rows.forEach(row => {
    const inst = instructorsById[row.instructor_id];
    const delivered = row.hours;
    const remaining = Math.max(requiredHours - delivered, 0);
    totalDelivered += delivered;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${subject?.name || subject?.title || subject.id}</td>
      <td>${inst?.name || inst?.email || row.instructor_id}</td>
      <td>${requiredHours}</td>
      <td>${delivered.toFixed(1)}</td>
      <td>${remaining.toFixed(1)}</td>
    `;
    tbody.appendChild(tr);
  });

  if (selectedInstructorId === 'all') {
    const remainingAll = Math.max(requiredHours - totalDelivered, 0);
    const trTotal = document.createElement('tr');
    trTotal.innerHTML = `
      <td><strong>${subject.name || subject.title || subject.id}</strong></td>
      <td><strong>Total (All)</strong></td>
      <td><strong>${requiredHours}</strong></td>
      <td><strong>${totalDelivered.toFixed(1)}</strong></td>
      <td><strong>${remainingAll.toFixed(1)}</strong></td>
    `;
    tbody.appendChild(trTotal);
  }

  if (!filtered.length) {
    const trEmpty = document.createElement('tr');
    trEmpty.innerHTML = '<td colspan="5" class="muted">No delivered hours yet for this subject/instructor.</td>';
    tbody.appendChild(trEmpty);
  }
}

async function loadInstructorsList() {
  const tbody = document.querySelector('#tblInstructors tbody');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="4">Loading...</td></tr>';

  const { data, error } = await supabaseClient
    .from('profiles')
    .select('id, name, email, is_admin, is_active')
    .eq('is_admin', false)  // only instructors
    .order('name');

  if (error) {
    tbody.innerHTML = `<tr><td colspan="4">Error: ${error.message}</td></tr>`;
    return;
  }

  if (!data || !data.length) {
    tbody.innerHTML = '<tr><td colspan="4">No instructors yet.</td></tr>';
    return;
  }

  tbody.innerHTML = '';

  data.forEach(row => {
    const tr = document.createElement('tr');

    tr.innerHTML = `
      <td>${row.name || ''}</td>
      <td>${row.email || ''}</td>
      <td>${row.is_active ? 'Yes' : 'No'}</td>
      <td>
        <button type="button" class="btnToggleInstructor" data-id="${row.id}">
          ${row.is_active ? 'Disable' : 'Enable'}
        </button>
      </td>
    `;

    tbody.appendChild(tr);
  });

  // attach click handlers for each button
  document.querySelectorAll('.btnToggleInstructor').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.currentTarget.getAttribute('data-id');
      await toggleInstructorActive(id);
      await loadInstructorsList();
    });
  });
}

async function toggleInstructorActive(profileId) {
  const { data, error } = await supabaseClient
    .from('profiles')
    .select('is_active')
    .eq('id', profileId)
    .single();

  if (error) {
    alert('Error reading instructor: ' + error.message);
    return;
  }

  const newValue = !data.is_active;

  const { error: updError } = await supabaseClient
    .from('profiles')
    .update({ is_active: newValue })
    .eq('id', profileId);

  if (updError) {
    alert('Error updating instructor: ' + updError.message);
  }
}

// ---------- INITIALIZE ----------
(async function main(){
  seedDemo();
  await initSupabaseIfPossible();
  initUI();
  bindTabs();
  await initAuth();
  await loadAllData();
  renderCalendar();
  renderInstructorToday();
  renderAdmin();
  renderReports();
})();
