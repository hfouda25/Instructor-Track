// ===========================================
// AA Maritime Instructor Tracking - App JS
// Stable version with Supabase + Demo fallback
// ===========================================

// 1) SUPABASE CONFIG
// -------------------------------------------------
// Put your real Supabase URL and ANON key here.
// Example URL: https://xxxxxx.supabase.co
// Example key: long jwt string
// -------------------------------------------------
const SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR-ANON-KEY-HERE';

// If both are filled, use Supabase. Otherwise, Demo mode.
let mode = (SUPABASE_URL && SUPABASE_ANON_KEY) ? 'supabase' : 'demo';
let supabaseClient = null;

// Simple DOM helpers
function $(sel){ return document.querySelector(sel); }
function $$(sel){ return Array.from(document.querySelectorAll(sel)); }

function todayISO(){
  const d = new Date();
  return d.toISOString().slice(0,10);
}
function firstDayOfMonth(y,m){ return new Date(y, m, 1); }
function daysInMonth(y,m){ return new Date(y, m+1, 0).getDate(); }

// Application state
let state = {
  user: null,      // auth user (Supabase or demo)
  profile: null,   // profile (Supabase profiles table or demo user)
  selectedDate: todayISO(),
  viewMonth: (()=>{ const d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); })(),
  subjects: [],
  instructors: [],      // non-admin profiles / demo instructors
  assignments: [],
  topics: []
};

// DEMO STORAGE KEY
const DEMO_LS_KEY = 'itt_demo_db_v1';

// ===========================================
// DEMO DATA FUNCTIONS
// ===========================================
function seedDemo(){
  if (localStorage.getItem(DEMO_LS_KEY)) return;

  const demo = {
    users: [
      { id:'p_admin', email:'admin@aamaritime.gy', name:'Admin', is_admin:true,  password:'123456' },
      { id:'p_ahmed', email:'ahmed@aamaritime.gy', name:'Capt. Ahmed', is_admin:false, password:'123456' },
      { id:'p_maria', email:'maria@aamaritime.gy', name:'Eng. Maria',  is_admin:false, password:'123456' },
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
        id:'t1', subject_id:'s_nav', instructor_id:'p_ahmed',
        title:'Mercator Sailing', date: todayISO(),
        start:'09:00', end:'11:00', duration_hours:2, completed:false
      },
      {
        id:'t2', subject_id:'s_eng', instructor_id:'p_maria',
        title:'Fuel Systems', date: todayISO(),
        start:'13:00', end:'16:00', duration_hours:3, completed:false
      }
    ]
  };

  localStorage.setItem(DEMO_LS_KEY, JSON.stringify(demo));
}

function readDemo(){
  return JSON.parse(localStorage.getItem(DEMO_LS_KEY) || '{}');
}
function writeDemo(db){
  localStorage.setItem(DEMO_LS_KEY, JSON.stringify(db));
}

// ===========================================
// BOOTSTRAP
// ===========================================
document.addEventListener('DOMContentLoaded', async () => {
  if (mode === 'supabase') {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const badge = document.getElementById('modeBadge');
    if (badge) badge.textContent = 'Supabase';
  } else {
    seedDemo();
    const badge = document.getElementById('modeBadge');
    if (badge) badge.textContent = 'Demo';
  }

  initUI();
  await initAuth();
  bindTabs();
});

// ===========================================
// UI INIT + TABS
// ===========================================
function initUI(){
  // Auth buttons
  if ($('#btnSignIn'))  $('#btnSignIn').onclick  = signIn;
  if ($('#btnSignUp'))  $('#btnSignUp').onclick  = signUp;
  if ($('#btnSignOut')) $('#btnSignOut').onclick = signOut;

  // Optional admin actions: only hook up if function exists
  if (typeof createInstructorProfile === 'function' && $('#btnCreateInstructor')) {
    $('#btnCreateInstructor').onclick = createInstructorProfile;
  }
  if (typeof addSubject === 'function' && $('#btnAddSubject')) {
    $('#btnAddSubject').onclick = addSubject;
  }
  if (typeof assignSubject === 'function' && $('#btnAssign')) {
    $('#btnAssign').onclick = assignSubject;
  }
  if (typeof addTopic === 'function' && $('#btnAddTopic')) {
    $('#btnAddTopic').onclick = addTopic;
  }
  if (typeof setDemoPassword === 'function' && $('#btnSetPw')) {
    $('#btnSetPw').onclick = setDemoPassword;
  }

  // Backup buttons (only if functions exist)
  const imp = document.getElementById('fileImport');
  if (imp && typeof importBackup === 'function') {
    imp.addEventListener('change', importBackup, false);
  }
  const exp = document.getElementById('btnExport');
  if (exp && typeof exportBackup === 'function') {
    exp.onclick = exportBackup;
  }
  const prn = document.getElementById('btnPrint');
  if (prn) prn.onclick = ()=>window.print();

  // Calendar month navigation
  const prev = document.getElementById('prevMonth');
  const next = document.getElementById('nextMonth');
  if (prev) prev.onclick = () => {
    const [Y,M] = state.viewMonth.split('-').map(Number);
    const d = new Date(Y, M-2, 1);
    state.viewMonth = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
    renderCalendar();
  };
  if (next) next.onclick = () => {
    const [Y,M] = state.viewMonth.split('-').map(Number);
    const d = new Date(Y, M, 1);
    state.viewMonth = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
    renderCalendar();
  };
}

function bindTabs(){
  $$('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.tab').forEach(x => x.classList.remove('active'));
      btn.classList.add('active');
      const key = btn.dataset.tab;

      $$('.tabpane').forEach(p => p.classList.add('hide'));
      const pane = document.getElementById('tab_'+key);
      if (pane) pane.classList.remove('hide');

      if (key === 'calendar')   renderCalendar();
      if (key === 'instructor') renderInstructorToday();
      if (key === 'admin')      renderAdmin();
      if (key === 'reports')    renderReports();
    });
  });
}

// ===========================================
// AUTH
// ===========================================
async function initAuth(){
  if (mode === 'supabase') {
    const { data: { session } } = await supabaseClient.auth.getSession();

    if (session) {
      state.user = session.user;
      await loadProfile();
      await loadAllData();
      showApp();
    } else {
      showAuth();
    }

    supabaseClient.auth.onAuthStateChange(async (event, session2) => {
      if (session2) {
        state.user = session2.user;
        await loadProfile();
        await loadAllData();
        showApp();
      } else {
        state.user = null;
        state.profile = null;
        showAuth();
      }
    });
  } else {
    // Demo mode
    showAuth();
  }
}

async function signIn(){
  const email = $('#email') ? $('#email').value.trim() : '';
  const password = $('#password') ? $('#password').value : '';

  if (!email || !password) {
    alert('Please enter email and password.');
    return;
  }

  if (mode === 'supabase') {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) {
      alert(error.message);
      return;
    }
    // onAuthStateChange will handle the rest
  } else {
    // Demo login
    const db = readDemo();
    const u = (db.users || []).find(x =>
      x.email.toLowerCase() === email.toLowerCase() &&
      x.password === password
    );
    if (!u) {
      alert('Invalid credentials (demo mode).');
      return;
    }
    state.user = u;
    state.profile = u;
    await loadAllData();
    showApp();
  }
}

async function signUp(){
  if (mode !== 'supabase') {
    alert('Sign up only available in Supabase mode.');
    return;
  }
  const email = $('#email') ? $('#email').value.trim() : '';
  const password = $('#password') ? $('#password').value : '';

  if (!email || !password) {
    alert('Enter email and password.');
    return;
  }
  const { error } = await supabaseClient.auth.signUp({ email, password });
  if (error) alert(error.message);
  else alert('Account created. Admin must configure profile in Supabase.');
}

async function signOut(){
  if (mode === 'supabase') {
    await supabaseClient.auth.signOut();
  }
  state.user = null;
  state.profile = null;
  showAuth();
}

function showAuth(){
  const badge = document.getElementById('whoBadge');
  if (badge) badge.textContent = 'Not signed in';

  const authS = document.getElementById('authSection');
  const appS  = document.getElementById('appSection');
  if (authS) authS.classList.remove('hide');
  if (appS)  appS.classList.add('hide');
  if ($('#btnSignOut')) $('#btnSignOut').classList.add('hide');
}

function showApp(){
  const name = (mode === 'supabase')
    ? (state.profile?.is_admin ? 'Admin' : (state.profile?.name || 'Instructor'))
    : (state.user?.is_admin ? 'Admin' : (state.user?.name || 'Instructor'));

  const badge = document.getElementById('whoBadge');
  if (badge) badge.textContent = name;

  if ($('#btnSignOut')) $('#btnSignOut').classList.remove('hide');
  const authS = document.getElementById('authSection');
  const appS  = document.getElementById('appSection');
  if (authS) authS.classList.add('hide');
  if (appS)  appS.classList.remove('hide');

  renderCalendar();
  renderInstructorToday();
  renderAdmin();
  renderReports();
}

// ===========================================
// LOAD DATA
// ===========================================
async function loadProfile(){
  if (mode !== 'supabase') return;
  const { data, error } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('user_id', state.user.id)
    .single();

  if (error) {
    // profile may not exist yet, treat as null
    state.profile = null;
  } else {
    state.profile = data;
  }
}

async function loadAllData(){
  if (mode === 'supabase') {
    const isAdmin = !!state.profile?.is_admin;

    // Profiles
    const { data: allProfiles } = await supabaseClient
      .from('profiles')
      .select('*')
      .order('name');

    state.instructors = (allProfiles || []).filter(p => !p.is_admin && p.is_active !== false);

    // Subjects
    const { data: subs } = await supabaseClient
      .from('subjects')
      .select('*')
      .order('name');

    state.subjects = subs || [];

    // Assignments
    const { data: asg } = await supabaseClient
      .from('assignments')
      .select('*');

    state.assignments = asg || [];

    // Topics
    if (isAdmin) {
      const { data: tops } = await supabaseClient
        .from('topics')
        .select('*');
      state.topics = tops || [];
    } else {
      const myId = state.profile?.id || 'none';
      const { data: tops } = await supabaseClient
        .from('topics')
        .select('*')
        .eq('instructor_id', myId);
      state.topics = tops || [];
    }
  } else {
    // DEMO
    const db = readDemo();
    state.instructors = (db.users || []).filter(u => !u.is_admin);
    state.subjects    = db.subjects    || [];
    state.assignments = db.assignments || [];
    if (state.user?.is_admin) {
      state.topics = db.topics || [];
    } else {
      state.topics = (db.topics || []).filter(t => t.instructor_id === state.user?.id);
    }
  }
}

// ===========================================
// RENDER: CALENDAR
// ===========================================
function renderCalendar(){
  const cal = document.getElementById('calendarGrid');
  const label = document.getElementById('monthLabel');
  if (!cal) return;

  const [Y,M] = state.viewMonth.split('-').map(Number);
  const first = firstDayOfMonth(Y, M-1);
  const days  = daysInMonth(Y, M-1);

  const monthName = first.toLocaleString('en', {month:'long'});
  if (label) label.textContent = `${monthName} ${Y}`;

  const startDow = first.getDay(); // 0 Sunday

  let html = '<div class="cal-row head"><span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span></div>';

  let day = 1;
  let rowCount = Math.ceil((startDow + days)/7);
  let dIndex = 0;

  for (let r = 0; r < rowCount; r++) {
    html += '<div class="cal-row">';
    for (let c = 0; c < 7; c++) {
      const cellIdx = r*7 + c;
      if (cellIdx < startDow || day > days) {
        html += '<div class="cal-cell empty"></div>';
      } else {
        const dISO = `${Y}-${String(M).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        const isToday = (dISO === todayISO());
        const topics = state.topics.filter(t => t.date === dISO);
        html += `<div class="cal-cell${isToday?' today':''}" data-date="${dISO}">
          <div class="cal-day">${day}</div>
          <div class="cal-topics">
            ${topics.map(t=>`<div class="cal-topic">${t.title||''}</div>`).join('')}
          </div>
        </div>`;
        day++;
      }
      dIndex++;
    }
    html += '</div>';
  }

  cal.innerHTML = html;

  // Click to select date
  cal.querySelectorAll('.cal-cell[data-date]').forEach(cell => {
    cell.addEventListener('click', () => {
      state.selectedDate = cell.getAttribute('data-date');
      renderInstructorToday();
    });
  });
}

// ===========================================
// RENDER: INSTRUCTOR TODAY
// ===========================================
function renderInstructorToday(){
  const box = document.getElementById('instrToday');
  if (!box) return;

  const date = state.selectedDate || todayISO();
  const isAdmin = (mode === 'supabase') ? !!state.profile?.is_admin : !!state.user?.is_admin;

  let myId = null;
  if (mode === 'supabase') {
    if (!state.profile) {
      box.innerHTML = '<div class="muted">No profile loaded.</div>';
      return;
    }
    myId = state.profile.id;
  } else {
    myId = state.user?.id;
  }

  let todays;
  if (isAdmin) {
    todays = state.topics.filter(t => t.date === date);
  } else {
    todays = state.topics.filter(t => t.date === date && t.instructor_id === myId);
  }

  if (!todays.length) {
    box.innerHTML = `<div class="muted">No topics scheduled for ${date}.</div>`;
    return;
  }

  const rows = todays.map(t => {
    const subj = state.subjects.find(s => String(s.id) === String(t.subject_id));
    const inst = state.instructors.find(i => String(i.id) === String(t.instructor_id));
    return `<div class="row">
      <span>${t.start || ''}–${t.end || ''}</span>
      <b>${subj?.name || 'Subject'}</b>
      <span>${t.title || ''}</span>
      <span>${inst?.name || inst?.email || ''}</span>
      <span>${t.duration_hours || 0} h</span>
    </div>`;
  }).join('');

  box.innerHTML = rows;
}

// ===========================================
// RENDER: ADMIN TAB
// ===========================================
function renderAdmin(){
  const wrap = document.getElementById('adminWrap');
  if (!wrap) return;

  const isAdmin = (mode === 'supabase')
    ? !!state.profile?.is_admin
    : !!state.user?.is_admin;

  if (!isAdmin) {
    wrap.innerHTML = '<div class="muted">You are not an admin. Admins see this tab.</div>';
    return;
  }

  // Demo-only user panel info
  if (mode === 'demo') {
    const db = readDemo();
    const users = db.users || [];
    const demoPanel = document.getElementById('demoUsersPanel');
    if (demoPanel) {
      demoPanel.innerHTML = users.map(u => `
        <div class="card-row">
          <b>${u.name}</b>
          <span class="muted small">${u.email}</span>
          ${u.is_admin ? '<span class="badge">Admin</span>' : ''}
        </div>
      `).join('');
    }
    const pwUser = document.getElementById('pwUser');
    if (pwUser) {
      pwUser.innerHTML = users.map(u => `
        <option value="${u.id}">${u.name} – ${u.email}</option>
      `).join('');
    }
  } else {
    const demoPanel = document.getElementById('demoUsersPanel');
    if (demoPanel) demoPanel.innerHTML = '<div class="muted">Using Supabase authentication.</div>';
  }

  // Populate subject/instructor selects
  if ($('#asgnSubject')) {
    $('#asgnSubject').innerHTML =
      '<option value="">Select subject</option>' +
      state.subjects.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
  }
  if ($('#asgnInstructor')) {
    $('#asgnInstructor').innerHTML =
      '<option value="">Select instructor</option>' +
      state.instructors.map(i => `<option value="${i.id}">${i.name||i.email}</option>`).join('');
  }
  if ($('#topicSubject')) {
    $('#topicSubject').innerHTML =
      '<option value="">Select subject</option>' +
      state.subjects.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
  }
  if ($('#topicInstructor')) {
    $('#topicInstructor').innerHTML =
      '<option value="">Select instructor</option>' +
      state.instructors.map(i => `<option value="${i.id}">${i.name||i.email}</option>`).join('');
  }

  // Subject list
  if ($('#subjList')) {
    $('#subjList').innerHTML =
      state.subjects.map(s => `
        <div class="card-row">
          <b>${s.name}</b>
          <span class="muted small">${s.total_hours || 0} planned hours</span>
        </div>
      `).join('') || '<div class="muted">No subjects.</div>';
  }

  // Topics list (basic)
  const topicList = document.getElementById('topicList');
  if (topicList) {
    const rows = state.topics
      .slice()
      .sort((a,b)=>a.date.localeCompare(b.date))
      .map(t => {
        const subj = state.subjects.find(s => String(s.id) === String(t.subject_id));
        const inst = state.instructors.find(i => String(i.id) === String(t.instructor_id));
        return `<div class="row">
          <span>${t.date}</span>
          <b>${subj?.name || 'Subject'}</b>
          <span>${t.title || ''}</span>
          <span>${inst?.name || inst?.email || ''}</span>
          <span>${t.duration_hours || 0} h</span>
        </div>`;
      }).join('');
    topicList.innerHTML = rows || '<div class="muted">No topics yet.</div>';
  }

  // Load instructor list for enable/disable
  loadInstructorsList();
}

// ===========================================
// ADMIN ACTIONS: SUBJECT / ASSIGNMENT / TOPIC
// ===========================================
async function addSubject(){
  const nameInput = document.getElementById('newSubjectName');
  const hrsInput  = document.getElementById('newSubjectHours');
  if (!nameInput) return;

  const name = nameInput.value.trim();
  const hours = Number(hrsInput ? hrsInput.value : 0) || 0;
  if (!name) {
    alert('Enter subject name.');
    return;
  }

  if (mode === 'supabase') {
    const { data, error } = await supabaseClient
      .from('subjects')
      .insert({ name, total_hours: hours })
      .select('*')
      .single();
    if (error) {
      alert(error.message);
      return;
    }
    state.subjects.push(data);
  } else {
    const db = readDemo();
    const subj = { id: 's_'+Date.now(), name, total_hours: hours };
    db.subjects = db.subjects || [];
    db.subjects.push(subj);
    writeDemo(db);
    state.subjects = db.subjects;
  }

  if (nameInput) nameInput.value = '';
  if (hrsInput) hrsInput.value = '';
  renderAdmin();
  renderReports();
}

async function assignSubject(){
  const sSel = document.getElementById('asgnSubject');
  const iSel = document.getElementById('asgnInstructor');
  if (!sSel || !iSel) return;

  const subject_id = sSel.value;
  const instructor_id = iSel.value;
  if (!subject_id || !instructor_id) {
    alert('Select subject and instructor.');
    return;
  }

  if (mode === 'supabase') {
    const { error } = await supabaseClient
      .from('assignments')
      .insert({ subject_id, instructor_id });
    if (error) {
      alert(error.message);
      return;
    }
  } else {
    const db = readDemo();
    db.assignments = db.assignments || [];
    db.assignments.push({ id:'a_'+Date.now(), subject_id, instructor_id });
    writeDemo(db);
    state.assignments = db.assignments;
  }

  alert('Assigned successfully.');
  renderAdmin();
}

async function addTopic(){
  const sSel = document.getElementById('topicSubject');
  const iSel = document.getElementById('topicInstructor');
  const titleInput = document.getElementById('topicTitle');
  const dateInput  = document.getElementById('topicDate');
  const startInput = document.getElementById('topicStart');
  const endInput   = document.getElementById('topicEnd');
  const hrsInput   = document.getElementById('topicHours');

  if (!sSel || !iSel || !titleInput || !dateInput) return;

  const subject_id = sSel.value;
  const instructor_id = iSel.value;
  const title = titleInput.value.trim();
  const date = dateInput.value || todayISO();
  const start = startInput ? startInput.value : '';
  const end   = endInput   ? endInput.value   : '';
  const duration_hours = Number(hrsInput ? hrsInput.value : 0) || 0;

  if (!subject_id || !instructor_id || !title) {
    alert('Subject, instructor, and title are required.');
    return;
  }

  let newTopic;
  if (mode === 'supabase') {
    const { data, error } = await supabaseClient
      .from('topics')
      .insert({
        subject_id, instructor_id, title, date,
        start, end, duration_hours, completed:false
      })
      .select('*')
      .single();
    if (error) {
      alert(error.message);
      return;
    }
    newTopic = data;
  } else {
    const db = readDemo();
    newTopic = {
      id:'t_'+Date.now(),
      subject_id, instructor_id, title, date,
      start, end, duration_hours, completed:false
    };
    db.topics = db.topics || [];
    db.topics.push(newTopic);
    writeDemo(db);
  }

  state.topics.push(newTopic);

  if (titleInput) titleInput.value = '';
  if (hrsInput)   hrsInput.value   = '';
  if (startInput) startInput.value = '';
  if (endInput)   endInput.value   = '';

  renderAdmin();
  renderCalendar();
  renderInstructorToday();
  renderReports();
}

// ===========================================
// DEMO ONLY: CHANGE PASSWORD
// ===========================================
function setDemoPassword(){
  if (mode !== 'demo') {
    alert('Password change only works in Demo mode.');
    return;
  }

  const userSel = document.getElementById('pwUser');
  const newPw   = document.getElementById('pwNew');
  if (!userSel || !newPw) return;

  const uid = userSel.value;
  const pw  = newPw.value;
  if (!uid || !pw) {
    alert('Select user and enter password.');
    return;
  }

  const db = readDemo();
  db.users = db.users || [];
  const u = db.users.find(x => x.id === uid);
  if (!u) {
    alert('User not found (demo).');
    return;
  }
  u.password = pw;
  writeDemo(db);
  alert('Password updated (demo).');
}

// ===========================================
// BACKUP (DEMO ONLY)
// ===========================================
function exportBackup(){
  if (mode !== 'demo') {
    alert('Backup/restore currently only supports Demo mode.');
    return;
  }
  const db = readDemo();
  const blob = new Blob([JSON.stringify(db, null, 2)], {type:'application/json'});
  const url  = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = 'itt_demo_backup.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function importBackup(ev){
  if (mode !== 'demo') {
    alert('Backup/restore currently only supports Demo mode.');
    return;
  }
  const file = ev.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const db = JSON.parse(reader.result);
      writeDemo(db);
      alert('Backup restored (demo).');
      state.user = null;
      state.profile = null;
      showAuth();
    } catch(e){
      alert('Invalid backup file.');
    }
  };
  reader.readAsText(file);
}

// ===========================================
// REPORTS TAB
// ===========================================
function renderReports(){
  const wrap = document.getElementById('reportsWrap');
  if (!wrap) return;

  if (!state.subjects.length) {
    wrap.innerHTML = '<div class="muted">No subjects yet.</div>';
    return;
  }

  // Compute required hours by subject
  const requiredBySubject = {};
  state.subjects.forEach(s => {
    requiredBySubject[s.id] = Number(s.total_hours || 0);
  });

  // Compute delivered hours per subject
  const deliveredBySubject = {};
  state.topics.forEach(t => {
    const sid = t.subject_id;
    const hrs = Number(t.duration_hours || t.hours || 0);
    if (!deliveredBySubject[sid]) deliveredBySubject[sid] = 0;
    deliveredBySubject[sid] += hrs;
  });

  let html = `
    <table class="tbl">
      <thead>
        <tr>
          <th>Subject</th>
          <th>Required Hours</th>
          <th>Delivered</th>
          <th>Remaining</th>
        </tr>
      </thead>
      <tbody>
  `;

  state.subjects.forEach(s => {
    const req = requiredBySubject[s.id] || 0;
    const del = deliveredBySubject[s.id] || 0;
    const rem = Math.max(req - del, 0);
    html += `
      <tr>
        <td>${s.name}</td>
        <td>${req}</td>
        <td>${del}</td>
        <td>${rem}</td>
      </tr>
    `;
  });

  html += '</tbody></table>';

  wrap.innerHTML = html;
}

// ===========================================
// INSTRUCTORS LIST (ADMIN) + TOGGLE ACTIVE
// ===========================================
async function loadInstructorsList(){
  const tbody = document.querySelector('#tblInstructors tbody');
  if (!tbody) return;

  if (mode === 'demo') {
    // From demo users
    const db = readDemo();
    const list = (db.users || []).filter(u => !u.is_admin);
    tbody.innerHTML = list.map(u => `
      <tr>
        <td>${u.name}</td>
        <td>${u.email}</td>
        <td>Demo</td>
        <td>-</td>
      </tr>
    `).join('');
    return;
  }

  // Supabase
  tbody.innerHTML = '<tr><td colspan="4">Loading...</td></tr>';

  const { data, error } = await supabaseClient
    .from('profiles')
    .select('id, name, email, is_admin, is_active')
    .eq('is_admin', false)
    .order('name');

  if (error) {
    tbody.innerHTML = `<tr><td colspan="4">Error: ${error.message}</td></tr>`;
    return;
  }

  const list = data || [];

  tbody.innerHTML = list.map(p => `
    <tr>
      <td>${p.name || ''}</td>
      <td>${p.email || ''}</td>
      <td>${p.is_active === false ? 'Disabled' : 'Active'}</td>
      <td>
        <button class="btn small" data-id="${p.id}">
          ${p.is_active === false ? 'Enable' : 'Disable'}
        </button>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('button[data-id]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.currentTarget.getAttribute('data-id');
      await toggleInstructorActive(id);
      await loadInstructorsList();
    });
  });
}

async function toggleInstructorActive(profileId){
  if (mode !== 'supabase') return;

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
