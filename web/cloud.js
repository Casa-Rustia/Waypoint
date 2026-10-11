import { defaults, statuses, categories, evaluate, validateJob, validateSettings, canonicalCountry } from './model.js';
import { validateProfile } from './profile.js';
import { importRows } from './csv.js';
import { extractResume } from './resume-extract.js';
import { supabaseUrl, supabaseAnonKey } from './config.js';

export const client = window.supabase.createClient(supabaseUrl, supabaseAnonKey, {
  auth: { storageKey: 'waypoint-auth', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});
const empty = () => ({ jobs: [], settings: structuredClone(defaults), profile: { facts: [] }, contacts: {}, resumeObject: '', queue: [], events: [], metadata: {}, nextJobId: 1, nextQueueId: 1, setupCompleted: false, preferencesReviewed: false, lastRefresh: null });
let signingOut=false;
let state, revision, currentUser, sequence = Promise.resolve();
const drafts = new Map();
function check(error) {
  if (!error) return;
  if (error.code === '40001') throw Error('Your workspace changed in another tab. Refresh before trying again. Your change was not saved.');
  throw Error(error.message || 'Supabase could not complete this request');
}
export async function requireUser() {
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) { location.replace('./signin.html'); throw Error('Sign in to continue'); }
  if (currentUser && currentUser.id !== data.user.id) { state = undefined; drafts.clear(); }
  currentUser = data.user;
  return currentUser;
}
async function load() {
  await requireUser();
  const { data, error } = await client.rpc('waypoint_load_workspace', { p_defaults: empty() });
  check(error); state = data.data; revision = data.revision;
  state = { ...empty(), ...state };
}
const info = (s,id) => s.metadata[id] || { followUp: '', notes: '', availability: 'Not checked', checkedAt: null, checkNote: '' };
const status = s => ({ busy: false, setupCompleted: s.setupCompleted, preferencesReviewed: s.preferencesReviewed, lastFinished: s.lastRefresh });
const scored = (s,j) => ({ ...j, ...evaluate(j,s.settings), workspace: info(s,j.id), analysis: null, analysisError: null, analyzing: false });
const snapshot = s => ({ config: { answers: s.contacts, resumePath: s.resumeObject }, manualOnly: true, busy: false, queue: s.queue.map(q => { const j=s.jobs.find(j=>j.id===q.jobId); return j ? { ...scored(s,j), ...q } : null; }).filter(Boolean), events: s.events });
function contacts(raw) {
  const value={};
  for (const key of ['fullName','email','phone','city','address','country','headline']) {
    if (typeof raw?.[key] !== 'string' || raw[key].length>500) throw Error('Check your contact details');
    if(raw[key].trim()) value[key]=raw[key].trim();
  }
  if(value.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email)) throw Error('Enter a valid email');
  return value;
}
function event(s,q,message) { s.events.unshift({ id: crypto.randomUUID(), queueId:q.id, status:q.status, message, createdAt:new Date().toISOString() }); s.events=s.events.slice(0,200); }
function add(s,raw) { const j={...validateJob(raw),id:s.nextJobId++,createdAt:new Date().toISOString()};s.jobs.unshift(j);return j; }
const outcomes=['Applied','Interview','Offer','Rejected'];
async function preview(raw) {
  const binary=Uint8Array.from(atob(raw.data),c=>c.charCodeAt(0));
  if(!binary.length || binary.length>3145728) throw Error('Choose a resume up to 3 MB');
  const ext=raw.filename.split('.').pop().toLowerCase();
  let text;
  if(ext==='txt') text=new TextDecoder('utf-8',{fatal:true}).decode(binary);
  else if(ext==='docx') {
    if(binary[0]!==80||binary[1]!==75) throw Error('Choose a valid DOCX file');
    const module = await import('./vendor/mammoth-wrapper.js');
    text=(await module.mammoth.extractRawText({arrayBuffer:binary.buffer})).value;
  } else if(ext==='pdf') {
    const pdfjs=await import('./vendor/pdf.mjs');pdfjs.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdf.worker.mjs',import.meta.url).href;
    const task=pdfjs.getDocument({data:binary.slice(),isEvalSupported:false});
    try {const pdf=await task.promise;if(pdf.numPages>100)throw Error('Use a resume with fewer than 100 pages');const pages=[];
      for(let i=1;i<=pdf.numPages;i++){const content=await(await pdf.getPage(i)).getTextContent();pages.push(content.items.map(x=>x.str+(x.hasEOL?'\n':' ')).join(''));}text=pages.join('\n');
    } finally {await task.destroy();}
  } else throw Error('Choose a text-based PDF, DOCX or UTF-8 TXT resume');
  if(!text.trim()||text.includes('\0')||text.length>200000)throw Error('Could not read resume text. Scanned PDFs need a text version.');
  const draftId=crypto.randomUUID(),draft={...extractResume(text,raw.filename),draftId};
  drafts.clear();drafts.set(draftId,{binary,filename:raw.filename,ext,expires:Date.now()+1800000});return draft;
}
export function api(path,options={}) {
  const run=async()=>{
    const method=options.method||'GET',raw=options.body && options.headers?.['Content-Type']!=='text/csv'?JSON.parse(options.body):{};
    await load();
    if(path==='/api/resume/preview')return preview(raw);
    if(method==='GET') {
      if(path==='/api/bootstrap')return {token:'supabase',statuses,categories,settings:state.settings,profile:state.profile,workspace:status(state),intelligence:{configured:false}};
      if(path==='/api/jobs')return state.jobs.map(j=>scored(state,j)).sort((a,b)=>b.id-a.id);
      if(path==='/api/workspace')return status(state);
      if(path==='/api/applications')return snapshot(state);
    }
    const next=structuredClone(state);let result,newResume,oldResume;
    const match=path.match(/^\/api\/jobs\/(\d+)(?:\/(reminder))?$/), queueMatch=path.match(/^\/api\/applications\/(\d+)\/status$/);
    if(path==='/api/settings' && method==='PUT') {
      result=validateSettings(raw);if(canonicalCountry(result.applicantCountry)!==canonicalCountry(next.settings.applicantCountry))next.jobs.forEach(j=>j.philippinesEligibility='Unknown');next.settings=result;next.preferencesReviewed=true;
    } else if(path==='/api/profile' && method==='PUT')next.profile=result=validateProfile(raw);
    else if(path==='/api/setup/complete')next.setupCompleted=true;
    else if(path==='/api/applications/contacts') { next.contacts=contacts(raw); result=snapshot(next); }
    else if(path==='/api/jobs' && method==='POST')result=add(next,raw);
    else if(path==='/api/import') {if(options.body.length>5242880)throw Error('CSV limit is 5 MB');const parsed=importRows(options.body);if(parsed.errors.length){const e=Error('Correct the CSV errors before importing');e.details=parsed;throw e;}parsed.jobs.forEach(j=>add(next,j));result={imported:parsed.jobs.length,warnings:parsed.warnings};}
    else if(match) {
      const id=Number(match[1]),j=next.jobs.find(j=>j.id===id);if(!j)throw Error('Job not found');
      if(match[2]) {if(typeof raw.notes!=='string'||raw.notes.length>3000||typeof raw.followUp!=='string'||raw.followUp&&(!/^\d{4}-\d{2}-\d{2}$/.test(raw.followUp)||new Date(raw.followUp).toISOString().slice(0,10)!==raw.followUp))throw Error('Check your reminder date and notes');result=next.metadata[id]={...info(next,id),notes:raw.notes.trim(),followUp:raw.followUp};}
      else if(method==='DELETE') {if(next.queue.some(q=>q.jobId===id))throw Error('This job has application history. Remove it from the queue instead.');next.jobs=next.jobs.filter(j=>j.id!==id);delete next.metadata[id];result={deleted:id};}
      else if(['PUT','PATCH'].includes(method)) {Object.assign(j,validateJob({...j,...raw},true));const q=next.queue.find(q=>q.jobId===id);if(q){q.status=outcomes.includes(j.applicationStatus)?'Submitted':'Queued';q.updatedAt=new Date().toISOString();event(next,q,'Stage updated by you');}result=j;}
      else throw Error('Unsupported job action');
    } else if(path==='/api/applications/queue') {
      const j=next.jobs.find(j=>j.id===Number(raw.jobId));if(!j||!j.applicationLink||outcomes.includes(j.applicationStatus))throw Error('Choose a saved job without an application outcome');
      let q=next.queue.find(q=>q.jobId===j.id||q.url===j.applicationLink);if(q&&!['Cancelled','Skipped'].includes(q.status))throw Error('This job is already queued');
      if(!q){q={id:next.nextQueueId++,jobId:j.id,url:j.applicationLink,createdAt:new Date().toISOString()};next.queue.unshift(q);}Object.assign(q,{status:'Queued',updatedAt:new Date().toISOString()});event(next,q,'Saved for you to apply manually');result={id:q.id};
    } else if(queueMatch) {
      const q=next.queue.find(q=>q.id===Number(queueMatch[1])),j=next.jobs.find(j=>j.id===q?.jobId);if(!q||!j)throw Error('Queue item not found');
      if(!['Queued','In progress','Submitted','Skipped','Cancelled'].includes(raw.status)||outcomes.includes(j.applicationStatus))throw Error('Update this application using the board');
      q.status=raw.status;q.updatedAt=new Date().toISOString();if(raw.status==='Submitted')j.applicationStatus='Applied';event(next,q,'Updated by you; the app sends no applications');result=snapshot(next);
    } else if(path==='/api/resume/apply') {
      const draft=drafts.get(raw.draftId);if(!draft||draft.expires<Date.now())throw Error('Read your resume again');if(raw.confirmed!==true||!['replace','append'].includes(raw.mode))throw Error('Review and confirm the resume draft');
      const facts=validateProfile(raw.profile),details=contacts(raw.contacts);
      next.profile=validateProfile({facts:raw.mode==='replace'?facts.facts:[...next.profile.facts,...facts.facts]});next.contacts=raw.mode==='replace'?details:{...next.contacts,...details};
      next.settings=validateSettings({...next.settings,...(raw.updateCountry?{applicantCountry:details.country}:{}),...(raw.updateTitles?{targetTitles:raw.targetTitles}:{})});
      if(canonicalCountry(next.settings.applicantCountry)!==canonicalCountry(state.settings.applicantCountry))next.jobs.forEach(j=>j.philippinesEligibility='Unknown');
      newResume=currentUser.id+'/'+crypto.randomUUID()+'.'+draft.ext;oldResume=next.resumeObject;
      const mime={pdf:'application/pdf',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',txt:'text/plain'}[draft.ext];
      const upload=await client.storage.from('waypoint-resumes').upload(newResume,draft.binary,{contentType:mime,upsert:false});check(upload.error);
      next.resumeObject=newResume;result={profile:next.profile,settings:next.settings};
    } else throw Error('This optional feature is not connected yet. You can edit job details and use preference grades.');
    if(next.jobs.length>10000)throw Error('Workspace limit is 10,000 jobs');
    const saved=await client.rpc('waypoint_save_workspace',{p_revision:revision,p_data:next});
    if(saved.error){if(newResume)await client.storage.from('waypoint-resumes').remove([newResume]);check(saved.error);}
    state=saved.data.data;revision=saved.data.revision;
    if(newResume){drafts.clear();if(oldResume)await client.storage.from('waypoint-resumes').remove([oldResume]);}
    return result || {saved:true};
  };
  const request=sequence.then(run);sequence=request.catch(()=>{});return request;
}
export async function signOut(){signingOut=true;try{const {error}=await client.auth.signOut();check(error);state=undefined;drafts.clear();}finally{signingOut=false;}}
window.addEventListener('storage',event=>{if(event.key==='waypoint-auth'&&!event.newValue)location.replace('./signin.html');});

client.auth.onAuthStateChange((event,session)=>{
  if(event==='SIGNED_OUT'){state=undefined;drafts.clear();if(!signingOut && location.pathname.endsWith('/dashboard.html'))location.replace('./signin.html');}
  if(event==='SIGNED_IN' && currentUser && session?.user?.id!==currentUser.id){state=undefined;drafts.clear();location.reload();}
});
