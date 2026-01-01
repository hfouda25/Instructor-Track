// Demo Mode + optional Supabase Mode, with @aamaritime.gy users
// *** Put your project URL and ANON PUBLIC KEY here ***
const SUPABASE_URL = 'https://wjszrzxuxutsslfgvuwd.supabase.co';   // <-- your project URL
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9....wYI5YyWxLTs1l2Z-IGrlcWatq8oZtkN4Uk'; // <-- your anon public key

// Keys to store config in browser (Settings tab)
const CFG_URL_KEY = 'itt_supabase_url';
const CFG_ANON_KEY = 'itt_supabase_anon_key';

// Start in demo; will switch to "supabase" only when URL+key are valid
let mode = 'demo';
let supabaseClient = null;

// Read config (first from localStorage, fallback to hard-coded constants)
function getConfig() {
  const url = localStorage.getItem(CFG_URL_KEY) || SUPABASE_URL || '';
  const key = localStorage.getItem(CFG_ANON_KEY) || SUPABASE_ANON_KEY || '';
  return { url, key };
}

// Save config from Settings tab
function saveConfig(url, key) {
  localStorage.setItem(CFG_URL_KEY, url);
  localStorage.setItem(CFG_ANON_KEY, key);
}

// ---------- SIMPLE STATE ----------

const state = {
  user: null,          // auth user (Supabase) or demo user
  profile: null,       // row from profiles table (Supabase) or demo profile
  subjects: [],
  instructors: [],
  topics: [],
  deliveries: [],
  viewMonth: (() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0'); })(),
  subjectsById: {},
  instructorsById: {},
  topicsById: {}
};

// ---------- DEMO STORAGE ----------

const DEMO_LS_KEY = 'itt_demo_db_v1';

function seedDemo() {
  if (localStorage.getItem(DEMO_LS_KEY)) return;
  const demo = {
    users: [
      { id:'p_admin', email:'admin@aamaritime.gy', name:'Admin',  is_admin:true,  password:'123456' },
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
      { id:'t1', subject_id:'s_nav', instructor_id:'p_ahmed', title:'Mercator Sailing', date: todayISO(), start:'09:00', end:'11:00', duration_hours:2 },
      { id:'t2', subject_id:'s_eng', instructor_id:'p_maria', title:'Fuel Systems', date: todayISO(), start:'13:00', end:'16:00', duration_hours:3 }
    ]
  };
  localStorage.setItem(DEMO_LS_KEY, JSON.stringify(demo));
}

function readDemo() {
  return JSON.parse(localStorage.getItem(DEMO_LS_KEY) || '{}');
}

function writeDemo(db) {
  localStorage.setItem(DEMO_LS_KEY, JSON.stringify(db));
}

// ---------- UTILS ----------

function $(sel) {
  return document.querySelector(sel);
}

function $$(sel) {
  return Array.from(document.querySelectorAll(sel));
}

function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0,10);
}

function setBadge(value) {
  const el = $('#modeBadge');
  if (!el) return;
  el.textContent = value === 'supabase' ? 'Supabase' : 'Demo';
}

// ---------- AUTH + INIT ----------

async function initApp() {
  bindTabs();
  bindSettings();
  initUI();

  const { url, key } = getConfig();

  if (url && key) {
    try {
      supabaseClient = supabase.createClient(url, key);
      mode = 'supabase';
      setBadge('supabase');
    } catch (err) {
      console.error('Supabase init failed, falling back to demo:', err);
      mode = 'demo';
      seedDemo();
      setBadge('demo');
    }
  } else {
    mode = 'demo';
    seedDemo();
    setBadge('demo');
  }

  updateSettingsUI();

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

    supabaseClient.auth.onAuthStateChange(async (event, session) => {
      if (session) {
        state.user = session.user;
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
    showAuth();
  }
}

async function loadProfile() {
  if (mode !== 'supabase' || !state.user) {
    state.profile = null;
    return;
  }

  const { data, error } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('email', state.user.email)
    .limit(1);

  if (error) {
    alert('Error loading profile: ' + error.message);
    state.profile = null;
    return;
  }

  state.profile = data[0] || null;
}

// ----------- LOAD ALL DATA -----------

async function loadAllData() {
  if (mode === 'supabase') {
    // If the logged-in user is admin, load all instructors; otherwise only this instructor
    const isAdmin = state.profile && state.profile.is_admin;

    if (isAdmin) {
      const { data: inst, error: instError } = await supabaseClient
        .from('profiles')
        .select('*')
        .eq('is_instructor', true)
        .order('name', { ascending: true });

      if (instError) {
        alert('Error instructors: ' + instError.message);
        return;
      }

      const { data: subj, error: subjError } = await supabaseClient
        .from('subjects')
        .select('*'); // removed .order('name') to work with any schema

      if (subjError) {
        alert('Error subjects: ' + subjError.message);
        return;
      }

      const { data: topics, error: topicsError } = await supabaseClient
        .from('topics')
        .select('*')
        .order('date', { ascending: true });

      if (topicsError) {
        alert('Error topics: ' + topicsError.message);
        return;
      }

      state.instructors = inst || [];
      state.subjects = subj || [];
      state.topics = topics || [];
    } else {
      // Non-admin instructor: load only his/her topics & subjects
      if (!state.profile) {
        state.instructors = [];
        state.subjects = [];
        state.topics = [];
      } else {
        const instructorId = state.profile.id;

        const { data: subj, error: subjError } = await supabaseClient
          .from('subjects')
          .select('*');

        if (subjError) {
          alert('Error subjects: ' + subjError.message);
          return;
        }

        const { data: topics, error: topicsError } = await supabaseClient
          .from('topics')
          .select('*')
          .eq('instructor_id', instructorId)
          .order('date', { ascending: true });

        if (topicsError) {
          alert('Error topics: ' + topicsError.message);
          return;
        }

        const { data: inst, error: instError } = await supabaseClient
          .from('profiles')
          .select('*')
          .eq('id', instructorId);

        if (instError) {
          alert('Error instructors: ' + instError.message);
          return;
        }

        state.instructors = inst || [];
        state.subjects = subj || [];
        state.topics = topics || [];
      }
    }
  } else {
    const db = readDemo();
    state.subjects = db.subjects || [];
    state.instructors = db.users || [];
    state.topics = db.topics || [];
  }

  state.subjectsById = Object.fromEntries(state.subjects.map(x => [x.id, x]));
  state.instructorsById = Object.fromEntries(state.instructors.map(x => [x.id, x]));
  state.topicsById = Object.fromEntries(state.topics.map(x => [x.id, x]));

  renderCalendar();
  renderInstructorToday();
  renderAdmin();
  renderReports();
}

// ---------- SIGN IN / SIGN UP / SIGN OUT ----------

async function signIn() {
  const email = $('#email').value.trim();
  const password = $('#password').value;

  if (mode === 'supabase') {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      alert(error.message);
      return;
    }

    const user = data.user;
    state.user = user;

    await loadProfile();
    if (state.profile && state.profile.is_admin) {
      await loadAllData();
    } else {
      await loadAllData();
    }
    showApp();
  } else {
    const db = readDemo();
    const u = (db.users || []).find(x =>
      x.email.toLowerCase() === email.toLowerCase() &&
      x.password === password
    );
    if (!u) {
      alert('Invalid credentials.');
      return;
    }
    state.user = u;
    state.profile = u;
    await loadAllData();
    showApp();
  }
}

async function signUp() {
  if (mode !== 'supabase') {
    alert('Sign up is only available in Supabase mode.');
    return;
  }
  const email = $('#email').value.trim();
  const password = $('#password').value;

  const { error } = await supabaseClient.auth.signUp({ email, password });
  if (error) {
    alert(error.message);
  } else {
    alert('Account created. Ask admin to set your role.');
  }
}

async function signOut() {
  if (mode === 'supabase') {
    await supabaseClient.auth.signOut();
  } else {
    state.user = null;
    state.profile = null;
    showAuth();
  }
}

// ---------- UI BINDINGS ----------

function initUI() {
  $('#btnSignIn').onclick = signIn;
  $('#btnSignUp').onclick = signUp;
  $('#btnSignOut').onclick = signOut;
  $('#btnCreateInstructor').onclick = createInstructorProfile;
  $('#btnAddSubject').onclick = addSubject;
  $('#btnAssign').onclick = assignSubject;
  $('#btnAddTopic').onclick = addTopic;
  $('#btnSetPw').onclick = setDemoPassword;
  $('#prevMonth').onclick = () => {
    const [Y,M] = state.viewMonth.split('-').map(Number);
    const d = new Date(Y,M-2,1);
    state.viewMonth = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
    renderCalendar();
  };
  $('#nextMonth').onclick = () => {
    const [Y,M] = state.viewMonth.split('-').map(Number);
    const d = new Date(Y,M,1);
    state.viewMonth = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
    renderCalendar();
  };

  const imp = document.getElementById('fileImport');
  if (imp) imp.addEventListener('change', importBackup, false);
  const exp = document.getElementById('btnExport');
  if (exp) exp.onclick = exportBackup;
  const prn = document.getElementById('btnPrint');
  if (prn) prn.onclick = () => window.print();
}

function bindTabs() {
  $$('.tab').forEach(btn => btn.addEventListener('click', () => {
    $$('.tab').forEach(x => x.classList.remove('active'));
    btn.classList.add('active');
    const key = btn.dataset.tab;
    $$('.tabpane').forEach(p => p.classList.add('hide'));
    $('#tab_'+key).classList.remove('hide');
    if (key === 'calendar') renderCalendar();
    if (key === 'instructor') renderInstructorToday();
    if (key === 'admin') renderAdmin();
    if (key === 'reports') renderReports();
  }));
}

// ---------- SETTINGS TAB ----------

function bindSettings() {
  const saveBtn = $('#btnSaveSettings');
  if (!saveBtn) return;
  saveBtn.onclick = () => {
    const url = $('#cfgSupabaseUrl').value.trim();
    const key = $('#cfgSupabaseKey').value.trim();
    saveConfig(url, key);
    alert('Settings saved. Reload page to re-init with new settings.');
  };
}

function updateSettingsUI() {
  const { url, key } = getConfig();
  if ($('#cfgSupabaseUrl')) $('#cfgSupabaseUrl').value = url;
  if ($('#cfgSupabaseKey')) $('#cfgSupabaseKey').value = key;
  $('#settingsMode').textContent = mode;
  $('#settingsUser').textContent = state.user ? (state.user.email || state.user.name) : 'Not signed in';
}

// ---------- VIEW SWITCH ----------

function showAuth() {
  $('#authSection').classList.remove('hide');
  $('#appSection').classList.add('hide');
}

function showApp() {
  $('#authSection').classList.add('hide');
  $('#appSection').classList.remove('hide');
  renderCalendar();
  renderInstructorToday();
  renderAdmin();
  renderReports();
}

// ---------- ADMIN FUNCTIONS ----------

async function createInstructorProfile() {
  const name = $('#instName').value.trim();
  const email = $('#instEmail').value.trim();

  if (!name || !email) {
    alert('Name and email are required.');
    return;
  }

  if (mode === 'supabase') {
    const { data, error } = await supabaseClient
      .from('profiles')
      .insert({
        name,
        email,
        is_instructor: true,
        is_admin: false,
        is_active: true
      })
      .select('*')
      .single();

    if (error) {
      alert('Error creating instructor: ' + error.message);
      return;
    }

    alert('Instructor profile created. Ask instructor to sign up with this email.');
    await loadAllData();
  } else {
    const db = readDemo();
    const id = 'p_' + Date.now();
    db.users = db.users || [];
    db.users.push({
      id,
      name,
      email,
      is_admin: false,
      password: '123456'
    });
    writeDemo(db);
    alert('Demo instructor created.');
    await loadAllData();
  }

  $('#instName').value = '';
  $('#instEmail').value = '';
}

async function setDemoPassword() {
  const userId = $('#pwUser').value;
  const newPw = $('#pwNew').value.trim();
  if (!userId || !newPw) {
    alert('Select user and enter new password.');
    return;
  }
  if (mode !== 'demo') {
    alert('This password reset works only in Demo mode.');
    return;
  }
  const db = readDemo();
  const u = (db.users || []).find(x => x.id === userId);
  if (!u) {
    alert('User not found.');
    return;
  }
  u.password = newPw;
  writeDemo(db);
  alert('Password updated in demo data.');
}

async function addSubject() {
  const name = $('#subjName').value.trim();
  const totalHours = Number($('#subjHours').value) || 0;
  if (!name) {
    alert('Subject name required.');
    return;
  }

  if (mode === 'supabase') {
    const { error } = await supabaseClient
      .from('subjects')
      .insert({
        name,
        total_hours: totalHours
      });

    if (error) {
      alert('Error adding subject: ' + error.message);
      return;
    }
    await loadAllData();
  } else {
    const db = readDemo();
    db.subjects = db.subjects || [];
    const id = 's_' + Date.now();
    db.subjects.push({ id, name, total_hours: totalHours });
    writeDemo(db);
    await loadAllData();
  }

  $('#subjName').value = '';
  $('#subjHours').value = '';
}

async function assignSubject() {
  const subjectId = $('#asgSubject').value;
  const instructorId = $('#asgInstructor').value;
  if (!subjectId || !instructorId) {
    alert('Select subject and instructor.');
    return;
  }

  if (mode === 'supabase') {
    const { error } = await supabaseClient
      .from('assignments')
      .insert({
        subject_id: subjectId,
        instructor_id: instructorId
      });

    if (error) {
      alert('Error assigning subject: ' + error.message);
      return;
    }
    await loadAllData();
  } else {
    const db = readDemo();
    db.assignments = db.assignments || [];
    const id = 'a_' + Date.now();
    db.assignments.push({ id, subject_id: subjectId, instructor_id: instructorId });
    writeDemo(db);
    await loadAllData();
  }
}

async function addTopic() {
  const subjectId = $('#topicSubject').value;
  const instructorId = $('#topicInstructor').value;
  const date = $('#topicDate').value;
  const hours = Number($('#topicHours').value) || 0;
  const start = $('#topicStart').value || '09:00';
  const end = $('#topicEnd').value || '12:00';
  const title = $('#topicTitle').value.trim();

  if (!subjectId || !instructorId || !date || !title) {
    alert('Subject, instructor, date, and title are required.');
    return;
  }

  if (mode === 'supabase') {
    const { error } = await supabaseClient
      .from('topics')
      .insert({
        subject_id: subjectId,
        instructor_id: instructorId,
        date,
        start,
        end,
        duration_hours: hours,
        title
      });

    if (error) {
      alert('Error adding topic: ' + error.message);
      return;
    }
    await loadAllData();
  } else {
    const db = readDemo();
    db.topics = db.topics || [];
    const id = 't_' + Date.now();
    db.topics.push({
      id,
      subject_id: subjectId,
      instructor_id: instructorId,
      date,
      start,
      end,
      duration_hours: hours,
      title
    });
    writeDemo(db);
    await loadAllData();
  }

  $('#topicTitle').value = '';
}

// ---------- RENDERING ----------

function renderCalendar() {
  const cal = $('#calendarGrid');
  if (!cal) return;
  cal.innerHTML = '';

  const [Y,M] = state.viewMonth.split('-').map(Number);
  const first = new Date(Y, M-1, 1);
  const startDay = first.getDay(); // 0 Sunday
  const daysInMonth = new Date(Y, M, 0).getDate();

  $('#currentMonthLabel').textContent =
    first.toLocaleString('en', { month:'long', year:'numeric' });

  for (let i=0; i<startDay; i++) {
    const cell = document.createElement('div');
    cell.className = 'day empty';
    cal.appendChild(cell);
  }

  for (let d=1; d<=daysInMonth; d++) {
    const cell = document.createElement('div');
    cell.className = 'day';
    const dateStr = `${Y}-${String(M).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const header = document.createElement('div');
    header.className = 'day-header';
    header.textContent = d;
    cell.appendChild(header);

    const list = document.createElement('div');
    list.className = 'day-topics';
    const topics = state.topics.filter(t => t.date === dateStr);
    topics.forEach(t => {
      const s = state.subjectsById[t.subject_id];
      const inst = state.instructorsById[t.instructor_id];
      const item = document.createElement('div');
      item.className = 'day-topic';
      item.textContent = `${t.start} ${s ? s.name : ''} (${inst ? inst.name : ''})`;
      item.onclick = () => showDayDetails(dateStr);
      list.appendChild(item);
    });

    cell.appendChild(list);
    cal.appendChild(cell);
  }
}

function showDayDetails(dateStr) {
  $('#dayDetailsDate').textContent = dateStr;
  const tbody = $('#dayDetailsBody');
  tbody.innerHTML = '';
  const topics = state.topics.filter(t => t.date === dateStr);
  if (!topics.length) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="7" class="muted">No classes on this date.</td>';
    tbody.appendChild(tr);
    return;
  }

  topics.forEach(t => {
    const s = state.subjectsById[t.subject_id];
    const inst = state.instructorsById[t.instructor_id];
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${t.done ? '✔' : ''}</td>
      <td>${t.start}-${t.end}</td>
      <td>${s ? s.name : ''}</td>
      <td>${t.title}</td>
      <td>${inst ? inst.name : ''}</td>
      <td>${(t.duration_hours || 0).toFixed(1)}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderInstructorToday() {
  const tbody = $('#instTodayBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!state.profile) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="5" class="muted">No instructor profile.</td>';
    tbody.appendChild(tr);
    return;
  }

  const isAdmin = state.profile.is_admin;
  const today = todayISO();
  const topics = state.topics.filter(t =>
    t.date === today && (isAdmin || t.instructor_id === state.profile.id)
  );

  if (!topics.length) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="5" class="muted">No topics today.</td>';
    tbody.appendChild(tr);
    return;
  }

  topics.forEach(t => {
    const s = state.subjectsById[t.subject_id];
    const inst = state.instructorsById[t.instructor_id];
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${t.start}-${t.end}</td>
      <td>${s ? s.name : ''}</td>
      <td>${t.title}</td>
      <td>${inst ? inst.name : ''}</td>
      <td>${(t.duration_hours || 0).toFixed(1)}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderAdmin() {
  // Only show Admin tab content if admin
  const adminBlock = $('#adminBlock');
  const adminOnly = $('#adminOnly');
  const demoUsersPanel = $('#demoUsersPanel');

  if (!state.profile || !state.profile.is_admin) {
    if (adminBlock) adminBlock.classList.remove('hide');
    if (adminOnly) adminOnly.classList.add('hide');
    if (demoUsersPanel) demoUsersPanel.classList.add('hide');
  } else {
    if (adminBlock) adminBlock.classList.add('hide');
    if (adminOnly) adminOnly.classList.remove('hide');
    if (demoUsersPanel) {
      demoUsersPanel.style.display = (mode === 'demo') ? 'block' : 'none';
    }
  }

  // Fill dropdowns
  const subjSel = $('#asgSubject');
  const instSel = $('#asgInstructor');
  const topicSubj = $('#topicSubject');
  const topicInst = $('#topicInstructor');
  const pwUser = $('#pwUser');

  if (subjSel) subjSel.innerHTML = '';
  if (instSel) instSel.innerHTML = '';
  if (topicSubj) topicSubj.innerHTML = '';
  if (topicInst) topicInst.innerHTML = '';
  if (pwUser) pwUser.innerHTML = '';

  state.subjects.forEach(s => {
    const opt1 = document.createElement('option');
    opt1.value = s.id;
    opt1.textContent = s.name;
    if (subjSel) subjSel.appendChild(opt1);

    const opt2 = document.createElement('option');
    opt2.value = s.id;
    opt2.textContent = s.name;
    if (topicSubj) topicSubj.appendChild(opt2);
  });

  state.instructors.forEach(p => {
    const opt1 = document.createElement('option');
    opt1.value = p.id;
    opt1.textContent = p.name;
    if (instSel) instSel.appendChild(opt1);

    const opt2 = document.createElement('option');
    opt2.value = p.id;
    opt2.textContent = p.name;
    if (topicInst) topicInst.appendChild(opt2);

    const opt3 = document.createElement('option');
    opt3.value = p.id;
    opt3.textContent = p.name + (p.is_admin ? ' (admin)' : '');
    if (pwUser) pwUser.appendChild(opt3);
  });
}

// ---------- REPORTS ----------

function renderReports() {
  const tbody = $('#hoursSummaryBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  // For each subject + instructor, sum hours
  const map = {};
  state.topics.forEach(t => {
    const key = `${t.subject_id}::${t.instructor_id}`;
    map[key] = (map[key] || 0) + (t.duration_hours || 0);
  });

  const entries = Object.entries(map);
  if (!entries.length) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="5" class="muted">No delivered hours yet.</td>';
    tbody.appendChild(tr);
    return;
  }

  entries.forEach(([key, hours]) => {
    const [subjectId, instructorId] = key.split('::');
    const s = state.subjectsById[subjectId];
    const inst = state.instructorsById[instructorId];
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${s ? s.name : ''}</td>
      <td>${inst ? inst.name : ''}</td>
      <td>${hours.toFixed(1)}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ---------- BACKUP (DEMO MODE ONLY) ----------

function exportBackup() {
  if (mode !== 'demo') {
    alert('Backup works only in Demo mode (local data).');
    return;
  }
  const db = readDemo();
  const blob = new Blob([JSON.stringify(db,null,2)], { type:'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'itt-backup.json';
  a.click();
  URL.revokeObjectURL(url);
}

function importBackup(evt) {
  if (mode !== 'demo') {
    alert('Import works only in Demo mode (local data).');
    return;
  }
  const file = evt.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const db = JSON.parse(ev.target.result);
      writeDemo(db);
      alert('Backup imported.');
      loadAllData();
    } catch (err) {
      alert('Invalid backup file.');
    }
  };
  reader.readAsText(file);
}

// ---------- START ----------

document.addEventListener('DOMContentLoaded', initApp);
