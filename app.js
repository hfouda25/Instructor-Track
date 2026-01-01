// ============================
// DEMO + SUPABASE CONFIG
// ============================
const SUPABASE_URL = 'https://wjszrzxuxutsslfgvuwd.supabase.co';
const SUPABASE_ANON_KEY =
'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indqc3pyenh1eHV0c3NsZmd2dXdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI1MzM1NTEsImV4cCI6MjA3ODEwOTU1MX0.5YmUUEeuRwYI5YyWxLTs1l2Z-IGrlcWatq8oZtkN4Uk';

let mode = 'demo';
let supabaseClient = null;

function $(s){return document.querySelector(s);}
function $$(s){return Array.from(document.querySelectorAll(s));}

let state = {
 user:null,
 profile:null,
 subjects:[],
 instructors:[],
 assignments:[],
 topics:[],
 selectedDate:new Date().toISOString().slice(0,10),
 viewMonth:(()=>{
   const d=new Date();
   return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0");
 })()
};

// DEMO DB KEY
const DEMO_LS_KEY="ITT_DEMO_DB";

function seedDemo(){
 if(localStorage.getItem(DEMO_LS_KEY)) return;
 const demo={
  users:[
   {id:"p_admin",email:"admin@aamaritime.gy",name:"Admin",password:"123456",is_admin:true},
   {id:"p_ahmed",email:"ahmed@aamaritime.gy",name:"Capt. Ahmed",password:"123456",is_admin:false},
   {id:"p_maria",email:"maria@aamaritime.gy",name:"Eng. Maria",password:"123456",is_admin:false}
  ],
  subjects:[
   {id:"s_nav",name:"Navigation I",total_hours:45},
   {id:"s_eng",name:"Marine Engineering",total_hours:60}
  ],
  assignments:[
   {id:"a1",subject_id:"s_nav",instructor_id:"p_ahmed"},
   {id:"a2",subject_id:"s_eng",instructor_id:"p_maria"}
  ],
  topics:[]
 };
 localStorage.setItem(DEMO_LS_KEY,JSON.stringify(demo));
}
function readDemo(){return JSON.parse(localStorage.getItem(DEMO_LS_KEY)||"{}");}
function writeDemo(db){localStorage.setItem(DEMO_LS_KEY,JSON.stringify(db));}

// ============================
// BOOT
// ============================
document.addEventListener("DOMContentLoaded",async()=>{
 try{
  supabaseClient=supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
  mode="supabase";
  $("#modeBadge").textContent="supabase";
 }catch(e){
  seedDemo();
  mode="demo";
  $("#modeBadge").textContent="demo";
 }
 initUI();
 await initAuth();
 bindTabs();
});

// ============================
// AUTH
// ============================
async function initAuth(){
 if(mode==="supabase"){
  const { data:{session}} = await supabaseClient.auth.getSession();
  if(session){
    state.user=session.user;
    await loadProfile();
    await loadAllData();
    showApp();
    return;
  }

  supabaseClient.auth.onAuthStateChange(async(evt,session)=>{
    if(session){
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

  $("#btnSignUp").classList.remove("hide");
  showAuth();
 } else {
  $("#btnSignUp").classList.add("hide");
  showAuth();
 }
}

async function signIn(){
 const email=$("#email").value.trim();
 const password=$("#password").value;

 if(mode==="supabase"){
  const {data,error}=await supabaseClient.auth.signInWithPassword({email,password});
  if(error){alert(error.message);return;}

  const user=data.user;
  const {data:profiles}=await supabaseClient.from("profiles").select("*").eq("email",user.email).limit(1);
  if(!profiles||!profiles.length){alert("No profile found.");await supabaseClient.auth.signOut();return;}

  const profile=profiles[0];
  if(profile.is_active===false){alert("Account disabled");await supabaseClient.auth.signOut();return;}

  state.user=user;
  state.profile=profile;

  await loadAllData();
  showApp();
 } else {
  const db=readDemo();
  const u=(db.users||[]).find(x=>x.email===email&&x.password===password);
  if(!u) return alert("Invalid credentials");
  state.user=u;state.profile=u;
  await loadAllData();
  showApp();
 }
}

async function signUp(){
 if(mode!=="supabase")return;
 const email=$("#email").value.trim();
 const password=$("#password").value;
 const {error}=await supabaseClient.auth.signUp({email,password});
 if(error) alert(error.message);
 else alert("Account created");
}

async function signOut(){
 if(mode==="supabase") await supabaseClient.auth.signOut();
 state.user=null;
 state.profile=null;
 showAuth();
}

function showAuth(){
 $("#whoBadge").textContent="Not signed in";
 $("#authSection").classList.remove("hide");
 $("#appSection").classList.add("hide");
 $("#btnSignOut").classList.add("hide");
}

function showApp(){
 $("#authSection").classList.add("hide");
 $("#appSection").classList.remove("hide");
 $("#btnSignOut").classList.remove("hide");
 $("#whoBadge").textContent = state.profile?.is_admin ? "Admin" : state.profile?.name;
 renderCalendar();
 renderInstructorToday();
 renderAdmin();
 renderReports();
}

// ============================
// LOAD DATA
// ============================
async function loadProfile(){
 if(mode==="supabase"){
  const {data}=await supabaseClient.from("profiles")
   .select("*")
   .eq("user_id",state.user.id)
   .single();
  state.profile=data||null;
 }
}

async function loadAllData(){
 if(mode==="supabase"){
  const {data:subs}=await supabaseClient.from("subjects").select("*").order("name");
  state.subjects=subs||[];

  const {data:inst}=await supabaseClient.from("profiles").select("*").order("name");
  state.instructors=(inst||[]).filter(x=>!x.is_admin && x.is_active!==false);

  const {data:asg}=await supabaseClient.from("assignments").select("*");
  state.assignments=asg||[];

  const pid=state.profile?.id||"none";
  if(state.profile?.is_admin){
    const {data:tops}=await supabaseClient.from("topics").select("*");
    state.topics=tops||[];
  } else {
    const {data:tops}=await supabaseClient.from("topics").select("*").eq("instructor_id",pid);
    state.topics=tops||[];
  }

 } else {
  const db=readDemo();
  state.subjects=db.subjects||[];
  state.instructors=(db.users||[]).filter(x=>!x.is_admin);
  state.assignments=db.assignments||[];
  state.topics=db.topics||[];
 }
}

// ============================
// RENDERERS (same as before)
// ============================
// (no changes required — your current UI works with new data logic)
// This section is intentionally omitted from explanation — the functional UI
// from your existing working version remains unchanged.

// ============================
// ADMIN FEATURES
// ============================
async function loadInstructorsList(){
 if(mode!=="supabase") return;
 const {data,error}=await supabaseClient
  .from("profiles")
  .select("id,name,email,is_admin,is_active")
  .order("name");
 if(error){alert(error.message);return;}
 state.instructors=(data||[]).filter(p=>!p.is_admin);
 renderAdmin();
}

async function toggleInstructorActive(id){
 const {data,error}=await supabaseClient.from("profiles").select("is_active").eq("id",id).single();
 if(error){alert(error.message);return;}
 const newVal=!data.is_active;
 await supabaseClient.from("profiles").update({is_active:newVal}).eq("id",id);
 loadInstructorsList();
}
function initUI() {

  // AUTH BUTTONS
  $('#btnSignIn').onclick = signIn;
  $('#btnSignUp').onclick = signUp;
  $('#btnSignOut').onclick = signOut;

  // ADMIN reload instructors button (if exists)
  const reloadBtn = document.getElementById('btnReloadInstructors');
  if (reloadBtn) reloadBtn.onclick = () => loadInstructorsList();

  // Calendar navigation
  const prev = document.getElementById('prevMonth');
  const next = document.getElementById('nextMonth');

  if (prev) prev.onclick = () => {
      const d = new Date(state.viewMonth + '-02');
      d.setMonth(d.getMonth() - 1);
      state.viewMonth = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
      renderCalendar();
  };

  if (next) next.onclick = () => {
      const d = new Date(state.viewMonth + '-02');
      d.setMonth(d.getMonth() + 1);
      state.viewMonth = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
      renderCalendar();
  };
}

// ============================
// EVERYTHING BELOW = your existing rendering + buttons
// (unchanged and compatible)
// ============================
