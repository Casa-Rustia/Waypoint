import { client } from './cloud.js';
let mode='login';
const result=document.querySelector('#auth-result');
function select(next){mode=next;document.querySelector('#auth-title').textContent=mode==='login'?'Welcome back. Good to see you.':'Let us get you started';document.querySelector('#auth-submit').textContent=mode==='login'?'Sign in':'Create my account';document.querySelector('[name=password]').autocomplete=mode==='login'?'current-password':'new-password';document.querySelector('#choose-login').className=mode==='login'?'primary':'secondary';document.querySelector('#choose-register').className=mode==='register'?'primary':'secondary';result.textContent='';}
document.querySelector('#choose-login').addEventListener('click',()=>select('login'));
document.querySelector('#choose-register').addEventListener('click',()=>select('register'));
document.querySelector('#auth-form').addEventListener('submit',async event=>{
 event.preventDefault();const button=document.querySelector('#auth-submit');button.disabled=true;result.textContent='';
 try{
  const values=Object.fromEntries(new FormData(event.target));values.email=values.email.trim();
  const {data,error}=mode==='register'?await client.auth.signUp({...values,options:{emailRedirectTo:new URL('./signin.html',location.href).href}}):await client.auth.signInWithPassword(values);
  if(error)throw error;
  if(!data.session){result.className='muted';result.textContent='Check your email for a confirmation link, then come back to sign in. If you already have an account, choose Sign in.';return;}
  location.assign('./dashboard.html#dashboard');
 }catch(error){result.className='error-text';result.textContent=error.message||'Could not sign in. Please try again.';}finally{button.disabled=false;}
});
const hash=new URLSearchParams(location.hash.slice(1));
if(hash.has('error')){result.className='error-text';result.textContent=hash.get('error_description')||'This confirmation link has expired. Request another email.';history.replaceState(null,'',location.pathname);}
client.auth.getSession().then(({data,error})=>{if(!error&&data.session)location.replace('./dashboard.html#dashboard');});
