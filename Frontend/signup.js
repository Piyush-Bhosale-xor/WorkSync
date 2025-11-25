const API_BASE =  "http://127.0.0.1:8000";
const $ = sel => document.querySelector(sel);

function setApi(){
  const val = $("#api-base").value.trim();
  if(val){ localStorage.setItem("API_BASE", val.replace(/\/$/, "")); alert("API set: "+localStorage.getItem("API_BASE")); }
}

async function signup(){
  const username = $("#signup-username").value.trim();
  const email = $("#signup-email").value.trim();
  const password = $("#signup-password").value;
  const role = $("#signup-role").value || "employee";
  const err = $("#signup-error"), ok = $("#signup-success");
  err.hidden = true; ok.hidden = true;

  if(!username || !password){
    err.textContent = "Username and password are required."; err.hidden = false; return;
  }

  try{
    const res = await fetch(`${API_BASE}/api/user/`,{
      method:"POST", headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ username, email, password, role })
    });
    const data = await res.json();
    if(!res.ok){ err.textContent = data?.detail || JSON.stringify(data); err.hidden=false; return; }
    ok.textContent = "Account created. You can log in now.";
    ok.hidden = false;
    setTimeout(()=> location.href="login.html", 900);
  }catch(e){
    err.textContent = "Network/CORS error. Check API Base & backend."; err.hidden=false;
  }
}

document.getElementById("set-api").addEventListener("click", setApi);
document.getElementById("signup-btn").addEventListener("click", signup);
