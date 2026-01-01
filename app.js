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

  // Enable Supabase if keys exist
  if (url && key) {
    mode = 'supabase';
    supabaseClient = supabase.createClient(url, key);
    setBadge('Supabase');
  } else {
    seedDemo();
    setBadge('');
  }

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

function initUI(){
  // --- main auth buttons (must always work) ---
  $('#btnSignIn').onclick  = signIn;
  $('#btnSignUp').onclick  = signUp;
  $('#btnSignOut').onclick = signOut;

  // --- optional admin buttons (only hook up if function exists) ---
  if (typeof createInstructorProfile === 'function') {
    $('#btnCreateInstructor').onclick = createInstructorProfile;
  }

  if (typeof addSubject === 'function') {
    $('#btnAddSubject').onclick = addSubject;
  }

  if (typeof assignSubject === 'function') {
    $('#btnAssign').onclick = assignSubject;
  }

  if (typeof addTopic === 'function') {
    $('#btnAddTopic').onclick = addTopic;
  }

  if (typeof setDemoPassword === 'function') {
    $('#btnSetPw').onclick = setDemoPassword;
  }

  // --- backup buttons: protect against missing functions ---
  const imp = document.getElementById('fileImport');
  if (imp && typeof importBackup === 'function') {
    imp.addEventListener('change', importBackup, false);
  }

  const exp = document.getElementById('btnExport');
  if (exp && typeof exportBackup === 'function') {
    exp.onclick = exportBackup;
  }

  const prn = document.getElementById('btnPrint');
  if (prn) {
    prn.onclick = () => window.print();
  }
}

function bindTabs(){
  $$('.tab').forEach(btn=>btn.addEventListener('click', ()=>{
    $$('.tab').forEach(x=>x.classList.remove('active'));
    btn.classList.add('active');
    const key = btn.dataset.tab;

    $$('.tabpane').forEach(p=>p.classList.add('hide'));
    $('#tab_'+key).classList.remove('hide');

    if (key==='calendar') renderCalendar();
    if (key==='instructor') renderInstructorToday();
    if (key==='admin') renderAdmin();
    if (key==='reports') renderReports();
  }));
}

// ---------- AUTH ----------
async function initAuth(){
  if (mode==='supabase'){
    const { data: { session } } = await supabaseClient.auth.getSession();

    if (session) {
      state.user=session.user;
      await loadProfile();
      await loadAllData();
      showApp();
      return;
    }

    supabaseClient.auth.onAuthStateChange(async (_, session) => {
      if (session) {
        state.user=session.user;
        await loadProfile();
        await loadAllData();
        showApp();
      } else {
        state.user=null; 
        state.profile=null; 
        showAuth();
      }
    });

    $('#btnSignUp').classList.remove('hide');
  } 
  else {
    $('#btnSignUp').classList.add('hide');
    showAuth();
  }
}

async function signIn(){
  const email = $('#email').value.trim(); 
  const password = $('#password').value;

  if (mode==='supabase'){
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) alert(error.message);
  } else {
    const db = readDemo();
    const u = (db.users||[]).find(x=>x.email.toLowerCase()===email.toLowerCase() && x.password===password);
    if (!u) return alert('Invalid credentials.');
    state.user = u;
    state.profile = u;
    await loadAllData();
    showApp();
  }
}

async function signUp(){
  if (mode!=='supabase') return;
  const email = $('#email').value.trim(); 
  const password = $('#password').value;

  const { error } = await supabaseClient.auth.signUp({ email, password });
  if (error) alert(error.message);
  else alert('Account created. Admin must assign role in Supabase.');
}

async function signOut(){
  if (mode==='supabase'){ 
    await supabaseClient.auth.signOut(); 
  }
  state.user=null; 
  state.profile=null; 
  showAuth();
}

function showAuth(){
  $('#whoBadge').textContent = 'Not signed in';
  $('#btnSignOut').classList.add('hide');
  $('#authSection').classList.remove('hide');
  $('#appSection').classList.add('hide');
}

function showApp(){
  const name =
    (mode==='supabase')
      ? (state.profile?.is_admin ? 'Admin' : (state.profile?.name || 'Instructor'))
      : (state.user?.is_admin ? 'Admin' : (state.user?.name||'Instructor'));

  $('#whoBadge').textContent = name;
  $('#btnSignOut').classList.remove('hide');
  $('#authSection').classList.add('hide');
  $('#appSection').classList.remove('hide');

  renderCalendar();
  renderInstructorToday();
  renderAdmin();
  renderReports();
}

// ---------- LOADERS ----------
async function loadProfile(){
  if (mode==='supabase'){
    const { data } = await supabaseClient
      .from('profiles')
      .select('*')
      .eq('user_id', state.user.id)
      .single();

    state.profile = data || null;
  }
}

async function loadAllData(){
  if (mode==='supabase'){
    const isAdmin = !!state.profile?.is_admin;

    const { data: inst } = await supabaseClient.from('profiles').select('*').order('name');
    state.instructors = (inst||[]).filter(p=>!p.is_admin);

    const { data: subs } = await supabaseClient.from('subjects').select('*').order('name');
    state.subjects = subs || [];

    const { data: asg } = await supabaseClient.from('assignments').select('*');
    state.assignments = asg || [];

    if (isAdmin){
      const { data: tops } = await supabaseClient.from('topics').select('*');
      state.topics = tops || [];
    } else {
      const myId = state.profile?.id || 'none';
      const { data: tops } = await supabaseClient
        .from('topics')
        .select('*')
        .eq('instructor_id', myId);

      state.topics = tops || [];
    }
  }
  else {
    const db = readDemo();

    state.instructors = (db.users||[]).filter(u=>!u.is_admin);
    state.subjects = db.subjects||[];
    state.assignments = db.assignments||[];

    if (state.user?.is_admin)
      state.topics = db.topics||[];
    else
      state.topics = (db.topics||[]).filter(t=>t.instructor_id===state.user?.id);
  }
}
