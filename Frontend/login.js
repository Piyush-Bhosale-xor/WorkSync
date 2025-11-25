const API_BASE =  "http://127.0.0.1:8000";
const $ = sel => document.querySelector(sel);
function setToken(t){ localStorage.setItem("access_token", t); }
function getToken(){ return localStorage.getItem("access_token"); }

function setApi(){
  const val = $("#api-base").value.trim();
  if(val){ localStorage.setItem("API_BASE", val.replace(/\/$/, "")); alert("API set: "+localStorage.getItem("API_BASE")); }
}

async function login(){
  const u = $("#login-username").value.trim();
  const p = $("#login-password").value;
  const err = $("#login-error"), ok=$("#login-success");
  err.hidden = true; ok.hidden = true;
  if(!u || !p){ err.textContent="Username and password are required."; err.hidden=false; return; }

  try{
    const res = await fetch(`${API_BASE}/api/token/`,{
      method:"POST", headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ username:u, password:p })
    });
    const data = await res.json();
    if(!res.ok){ err.textContent = data?.detail || "Invalid credentials."; err.hidden=false; return; }
    if(!data?.access){ err.textContent="No access token in response."; err.hidden=false; return; }
    setToken(data.access);
    ok.textContent = "Login successful. Redirecting…";
    ok.hidden = false;
    setTimeout(()=> location.href="dashboard.html", 600);
  }catch(e){
    err.textContent = "Network/CORS error. Check API Base & backend."; err.hidden=false;
  }
}

$("#set-api").addEventListener("click", setApi);
$("#login-btn").addEventListener("click", login);
