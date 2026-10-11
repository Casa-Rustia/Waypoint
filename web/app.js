import { api, requireUser, signOut, client } from './cloud.js';
const $ = s => document.querySelector(s);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = v => v === null ? 'Unknown' : '₱' + Number(v).toLocaleString('en-PH', { maximumFractionDigits: 2 });
let jobs = [], settings, statuses = [], categories = [], token = '', editingId = null, confirmation, toastTimer, profile = { facts: [] }, intelligence = {}, analysisId = null,workspaceState={},refreshPoll=null,linkDraft=null;

function notify(text) { $('#toast').textContent = text; $('#toast').classList.remove('hidden'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.add('hidden'), 4500); }
function error(element, text) { element.className = 'error-text'; element.textContent = text; }
function canonical(v) { v = v.trim().toLowerCase(); if (['us','usa','united states','united states of america'].includes(v)) return 'usa'; if (['uk','united kingdom','great britain'].includes(v)) return 'uk'; if (['ph','phl','philippines','the philippines'].includes(v)) return 'philippines'; return v; }
function employerEligibility(j) {
  if (j.directEmployerStatus === 'No' || canonical(settings.applicantCountry)===canonical(j.headquarters) || settings.excludedCategories.some(c => c.toLowerCase() === j.employerCategory.toLowerCase())) return 'Excluded';
  if (j.directEmployerStatus === 'Unknown' || j.employerCategory === 'Unknown' || j.headquarters.toLowerCase() === 'unknown') return 'Needs review';
  return 'Eligible';
}
function badge(value) { return `<span class="pill ${['Yes','Qualified','Eligible','Offer','HIGH PRIORITY','Explicitly eligible','Verified from supplied sources','Meets minimum'].includes(value) ? 'good' : ['Unknown','Needs review','Under Review','Interview','REVIEW','Likely eligible','Needs verification'].includes(value) ? 'review' : ['No','Not qualified','Excluded','Rejected','EXCLUDE','Ineligible','Below minimum'].includes(value) ? 'bad' : 'neutral'}">${esc(value)}</span>`; }
function route() {
  const name = ['dashboard','jobs','settings','intelligence','applications'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'dashboard';
  document.querySelectorAll('.page').forEach(e => e.classList.toggle('hidden', e.id !== 'page-' + name));
  document.querySelectorAll('nav a').forEach(e => e.classList.toggle('active', e.dataset.page === name));
  document.querySelectorAll('nav a').forEach(e => e.dataset.page === name ? e.setAttribute('aria-current','page') : e.removeAttribute('aria-current'));
  $('#breadcrumb').textContent = 'Workspace / ' + ({ dashboard: 'Overview', jobs: 'Job workspace', settings: 'Search preferences', intelligence: 'Your profile', applications: 'Application queue' }[name]);
  if(name==='applications' && token) loadApplications().catch(err=>error($('#automation-result'),err.message));
}
async function refresh() { jobs = (await api('/api/jobs')).filter(j => !j.isDemo); render(); renderSetup(); }
function render() {
  $('#nav-count').textContent = jobs.length;
  $('#ai-overview-summary').textContent = `${jobs.filter(j=>['A','B'].includes(j.matchGrade)).length} strong preference matches · ${jobs.filter(j=>j.provisional).length} have details to check. Grades use your preferences; AI analysis is optional.`;
  const stats = [
    ['Total jobs', jobs.length, 'All saved jobs', '▤'],
    ['Qualified jobs', jobs.filter(j => j.qualification === 'Qualified').length, 'Meet all required criteria', '✓'],
    ['Under review', jobs.filter(j => j.applicationStatus === 'Under Review').length, 'Application status', '◷'],
    ['Applications submitted', jobs.filter(j => ['Applied','Interview','Rejected','Offer'].includes(j.applicationStatus)).length, 'Applied or later stages', '↗'],
    ['Interviews', jobs.filter(j => j.applicationStatus === 'Interview').length, 'Currently in interview', '◉'],
    ['Rejections', jobs.filter(j => j.applicationStatus === 'Rejected').length, 'Applications not accepted', '−']
  ];
  $('#stats').innerHTML = stats.map((s,i) => `<div class="stat ${i === 1 ? 'highlight' : ''}"><div class="stat-top"><span>${s[0]}</span><span class="stat-icon" aria-hidden="true">${s[3]}</span></div><div class="stat-value">${s[1]}</div><div class="stat-note">${s[2]}</div></div>`).join('');
  $('#criteria').innerHTML = [`${money(settings.minimumSalary)}+ / month`, '100% remote', 'Direct employer', settings.applicantCountry + ' eligible', 'Full-time or contract'].map(c => `<span>${esc(c)}</span>`).join('');
  $('#pipeline').replaceChildren();
  for (const status of statuses) {
    const count = jobs.filter(j => j.applicationStatus === status).length;
    const row = document.createElement('div'); row.className = 'pipeline-row';
    row.innerHTML = `<span class="pipeline-label">${esc(status)}</span><div class="pipeline-track"><div class="pipeline-fill ${status.toLowerCase()}"></div></div><strong>${count}</strong>`;
    row.querySelector('.pipeline-fill').style.width = `${jobs.length ? count / jobs.length * 100 : 0}%`;
    $('#pipeline').append(row);
  }
  $('#recent-jobs').innerHTML = jobs.length ? jobs.slice(0,4).map(j => `<div class="recent-row"><span class="company-mark">${esc(j.company.charAt(0))}</span><div><a class="recent-title" href="#jobs">${esc(j.title)}</a><span class="recent-company">${esc(j.company)} </span></div><div class="recent-location">${esc(j.headquarters)}<span class="cell-sub">${esc(j.workArrangement)}</span></div><span class="recent-salary">${money(j.monthlySalaryPhp)}<span class="cell-sub">gross / month</span></span><div>${badge(j.qualification)}</div></div>`).join('') : '<div class="empty"><p>No saved jobs yet. Add a job link or import a list whenever you are ready.</p></div>';
  renderTable();
}
function renderTable() {
  const filtered = jobs.filter(j =>
    j.title.toLowerCase().includes($('#filter-title').value.toLowerCase()) &&
    j.company.toLowerCase().includes($('#filter-company').value.toLowerCase()) &&
    (!$('#filter-salary').value || (j.monthlySalaryPhp !== null && j.monthlySalaryPhp >= Number($('#filter-salary').value))) &&
    (!$('#filter-employer').value || employerEligibility(j) === $('#filter-employer').value) &&
    (!$('#filter-eligibility').value || j.philippinesEligibility === $('#filter-eligibility').value) &&
    (!$('#filter-status').value || j.applicationStatus === $('#filter-status').value) &&
    (!$('#filter-match').value || j.qualification === $('#filter-match').value) &&
    (!$('#filter-priority').value || ($('#filter-priority').value === 'not-analyzed' ? !j.analysis : j.analysis?.priority === $('#filter-priority').value))
  );
  if ($('#sort-jobs').value === 'match') filtered.sort((a,b)=>(a.matchGrade==='Not a match')-(b.matchGrade==='Not a match')||b.score-a.score);
  if ($('#sort-jobs').value === 'priority') { const order = { 'HIGH PRIORITY': 0, REVIEW: 1, EXCLUDE: 3 }; filtered.sort((a,b) => (order[a.analysis?.priority] ?? 2) - (order[b.analysis?.priority] ?? 2) || (b.analysis?.suitability.score ?? -1) - (a.analysis?.suitability.score ?? -1)); }
  $('#results-count').textContent = `${filtered.length} of ${jobs.length} jobs`;
  $('#jobs-empty').classList.toggle('hidden', !!filtered.length);
  $('#job-cards').innerHTML=filtered.length?filtered.map(j=>`<article class="card job-card" data-job-card="${j.id}"><div class="card-heading"><div><span class="section-label">${esc(j.company)} </span><h2>${esc(j.title)}</h2></div>${gradeBadge(j)}</div><p>${esc(j.matchLabel)}${j.provisional?' · Needs checking':''}</p>${jobIntroduction(j)}<div class="job-key-details"><span>${esc(j.workArrangement)}</span><span>${j.monthlySalaryPhp===null?'Salary not confirmed':money(j.monthlySalaryPhp)+' / month'}</span><span>${j.philippinesEligibility==='Yes'?esc(settings.applicantCountry)+' eligible':j.philippinesEligibility==='No'?'Location not eligible':'Location needs checking'}</span></div>${j.reasons.length?`<p class="queue-warning">${esc(j.reasons.slice(0,2).join('. '))}</p>`:''}<label>Application stage<select data-card-job-status="${j.id}" aria-label="Application stage for ${esc(j.company)}">${statuses.map(s=>`<option ${s===j.applicationStatus?'selected':''}>${esc(s)}</option>`).join('')}</select></label><div class="job-actions"><button class="primary" data-queue-add="${j.id}" ${j.isDemo||!j.applicationLink||['Applied','Interview','Rejected','Offer'].includes(j.applicationStatus)?'disabled':''}>Add to queue</button><button class="secondary" data-match="${j.id}">Why this grade?</button><button class="text-button" data-card-analysis="${j.id}">Optional AI review</button><button class="text-button" data-card-edit="${j.id}">Edit details</button></div></article>`).join(''):'<div class="card empty"><h3>No jobs match these filters</h3><p>Change your filters or add a job to get started.</p></div>';
  $('#job-table').innerHTML = filtered.map(j => `<tr data-id="${j.id}">
    <td>${esc(j.company)} <span class="cell-sub">${esc(j.employerCategory)}</span></td><td>${esc(j.title)}</td><td>${esc(j.headquarters)}</td><td>${esc(j.employmentType)}</td><td>${esc(j.workArrangement)}</td><td>${esc(j.originalSalary || 'Unknown')}</td><td class="nowrap">${money(j.monthlySalaryPhp)}<span class="cell-sub">${j.monthlySalaryPhp === null ? 'Needs review' : 'gross / month'}</span></td><td>${badge(j.philippinesEligibility)}</td><td>${badge(j.directEmployerStatus)}<span class="cell-sub">${esc(employerEligibility(j))}</span></td><td>${gradeBadge(j)}<span class="score-label" title="${esc(j.reasons.join('; ') || 'Meets all required criteria based on recorded facts')}">${badge(j.qualification)}</span></td><td><select class="status-select" data-job-status="${j.id}" aria-label="Application status for ${esc(j.company)}">${statuses.map(s => `<option ${s === j.applicationStatus ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></td><td>${j.applicationLink ? `<a class="text-link" href="${esc(j.applicationLink)}" target="_blank" rel="noopener noreferrer">Open listing ↗</a>` : '<span class="subtle">Not provided</span>'}</td><td class="ai-cell">${j.analysis ? `${badge(j.analysis.priority)}<span class="cell-sub">${j.analysis.stale ? 'Outdated · analyse again' : j.analysis.suitability.score === null ? 'Experience not assessed' : `Suitability ${j.analysis.suitability.score}/100`}</span>` : '<span class="subtle">Not analysed</span>'}${j.analysisError ? '<span class="cell-sub">Last attempt failed</span>' : ''}<button class="table-button" data-analysis="${j.id}">${j.analysis ? 'View analysis' : 'Analyse Job'}</button></td><td><button class="table-button" data-edit="${j.id}">Edit</button><button class="table-button delete" data-delete="${j.id}" aria-label="Delete ${esc(j.company)}">Delete</button></td></tr>`).join('');
  updateRefreshStatus();
}
function jobIntroduction(j){
 const clip=text=>text.length>340?text.slice(0,337).replace(/\s+\S*$/,'')+'…':text;
 const text=(j.jobDescription||'').replace(/<[^>]*>/g,' ').replace(/RESEARCH SUMMARY[^\n]*\n/i,'').replace(/^RESEARCH SUMMARY\s*[—-]\s*checked[^.]*\.\s*/i,'').replace(/\s+/g,' ').trim();
 const sentences=text.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g)||[];
 const role=sentences.filter(s=>!/^\s*(Location evidence:|Consult the original|This is a sourcing|Checked |Salary not published)/i.test(s)).slice(0,2).join(' ').trim();
 const source=(j.employerSources||[]).find(s=>s.text&&(!j.applicationLink||s.url!==j.applicationLink)&&!/^(Current |Published vacancy:)/i.test(s.text));
 const company=source?clip(source.text.split(/Hiring-system ownership link checked/i)[0].trim()):'';
 const link=url=>/^https?:\/\//i.test(url||'')?`<a class="text-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Read the source ↗</a>`:'';
 return `<section class="job-introduction" aria-label="About the company and role"><div><h3>Meet the company</h3><p>${esc(company||'A company introduction hasn’t been saved yet. Visit the employer’s website to get to know them.')}</p>${source?`<small>${source.reviewed?'From a source marked reviewed':'Saved source · still needs checking'}</small>${link(source.url)}`:''}</div><div><h3>About the work</h3><p>${esc(clip(role)||'The duties haven’t been saved yet. Read the original job post before deciding whether to apply.')}</p><small>${/^RESEARCH SUMMARY/i.test(j.jobDescription||'')?'From the saved research notes, not the full job description':'Excerpt from the saved job description'}</small>${link(j.applicationLink)}</div></section>`;
}
function gradeBadge(j){return `<span class="match-grade ${j.matchGrade==='Not a match'?'grade-excluded':'grade-'+j.matchGrade.toLowerCase()}">${esc(j.matchGrade)}<small>${j.score}/100</small></span>`;}
function showMatch(id){
  const j=jobs.find(j=>j.id===id);if(!j)return;
  $('#match-title').textContent=j.title;
  $('#match-content').innerHTML=`<div class="match-summary">${gradeBadge(j)}<div><h3>${esc(j.matchLabel)}</h3><p>${j.provisional?'Some details are unconfirmed. This grade can change when you check them.':'Based on the job details you saved.'}</p></div></div><p>Graded against your saved roles, salary, applicant country and employer preferences. This is not a hiring prediction or a resume experience score.</p>${j.reasons.length?`<div class="notice info"><strong>Check before applying</strong><ul>${j.reasons.map(r=>`<li>${esc(r)}</li>`).join('')}</ul></div>`:''}<div class="match-checks">${j.matchBreakdown.map(c=>`<div><span>${esc(c.label)}<small>${esc(c.status)}</small></span><strong>${c.points}/${c.maximum}</strong></div>`).join('')}</div><p class="field-help">A: 85–100 · B: 70–84 · C: 50–69 · D: below 50. A confirmed requirement failure is labeled “Not a match” regardless of points. Missing facts earn no points and stay marked for checking.</p>`;
  $('#match-dialog').showModal();
}
$('#match-preferences').addEventListener('click',()=>$('#match-dialog').close());
function fillSettings() {
  const form = $('#settings-form');
  form.elements.minimumSalary.value = settings.minimumSalary;
  form.elements.applicantCountry.value = settings.applicantCountry;
  form.elements.preferredCountries.value = settings.preferredCountries.join('\n');
  form.elements.targetTitles.value = settings.targetTitles.join('\n');
  $('#excluded-categories').innerHTML = categories.filter(c => c !== 'Unknown').map(c => `<label><input type="checkbox" name="excludedCategories" value="${esc(c)}" ${settings.excludedCategories.includes(c) ? 'checked' : ''}>${esc(c)}</label>`).join('');
  $('#country-label').textContent = settings.applicantCountry + ' applicant';
  $('.avatar').textContent = settings.applicantCountry.split(/\s+/).map(v=>v[0]).join('').slice(0,2).toUpperCase();
  $('#eligibility-filter-label').textContent = settings.applicantCountry + ' eligibility';
  $('#eligibility-heading').textContent = settings.applicantCountry + ' eligibility';
  $('#editor-eligibility-label').textContent = settings.applicantCountry + ' eligibility';
}
function editJob(id = null) {
  editingId = id;
  const j = jobs.find(j => j.id === id), form = $('#job-form'); form.reset();
  $('#job-result').textContent = ''; $('#job-result').className = '';
  $('#job-dialog-title').textContent = j ? 'Edit job' : 'Add job';
  form.elements.applicationStatus.value = 'Discovered';
  if (j) for (const [key,value] of Object.entries(j)) if (form.elements.namedItem(key)) form.elements.namedItem(key).value = value ?? '';
  $('#employer-sources').replaceChildren(); (j?.employerSources || []).forEach(addEmployerSource);
  $('#job-dialog').showModal();
}
function confirmAction(title, message, action) { $('#confirm-title').textContent = title; $('#confirm-message').textContent = message; confirmation = action; $('#confirm-dialog').showModal(); }
window.addEventListener('hashchange', route);
document.querySelectorAll('[data-action="import"]').forEach(b => b.addEventListener('click', () => { $('#import-form').reset(); $('#import-result').textContent = ''; $('#import-result').className = ''; $('#import-dialog').showModal(); }));
document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => $('#' + b.dataset.close).close()));
document.querySelectorAll('.filters input,.filters select').forEach(e => e.addEventListener('input', renderTable));
$('#reset-filters').addEventListener('click', () => { document.querySelectorAll('.filters input,.filters select').forEach(e => e.value = e.id === 'sort-jobs' ? 'match' : ''); renderTable(); });
$('#add-job').addEventListener('click', () => editJob());
function jobAction(e) {
  const match=e.target.closest('[data-match]');if(match)return showMatch(Number(match.dataset.match));
  const queue=e.target.closest('[data-queue-add]');if(queue)return addToQueue(Number(queue.dataset.queueAdd));
  const cardAnalysis=e.target.closest('[data-card-analysis]');if(cardAnalysis)return showAnalysis(Number(cardAnalysis.dataset.cardAnalysis));
  const edit = e.target.closest('[data-edit], [data-card-edit]'), del = e.target.closest('[data-delete]'), analysis = e.target.closest('[data-analysis]');
  if (analysis) showAnalysis(Number(analysis.dataset.analysis));
  if (edit) editJob(Number(edit.dataset.edit || edit.dataset.cardEdit));
  if (del) { const j = jobs.find(j => j.id === Number(del.dataset.delete)); confirmAction('Delete this job?', `${j.company} — ${j.title} will be permanently removed from your private workspace.`, async () => { await api('/api/jobs/' + j.id, { method: 'DELETE' }); await refresh(); notify('Job deleted'); }); }
}
$('#job-table').addEventListener('click',jobAction);
$('#job-cards').addEventListener('click',jobAction);
async function changeJobStage(e) {
  const select = e.target.closest('[data-job-status], [data-card-job-status]'); if (!select) return;
  select.disabled = true;
  try { await api('/api/jobs/' + (select.dataset.jobStatus || select.dataset.cardJobStatus), { method: 'PATCH', body: JSON.stringify({ applicationStatus: select.value }) }); await refresh(); notify('Application status updated'); }
  catch (err) { notify(err.message); renderTable(); }
}
$('#job-table').addEventListener('change',changeJobStage);
$('#job-cards').addEventListener('change',changeJobStage);
$('#confirm-action').addEventListener('click', async e => { e.target.disabled = true; try { await confirmation(); $('#confirm-dialog').close(); } catch (err) { notify(err.message); } finally { e.target.disabled = false; } });
$('#job-form').addEventListener('submit', async e => {
  e.preventDefault(); const button = e.submitter; button.disabled = true;
  const input = Object.fromEntries(new FormData(e.target)); delete input.id; input.monthlySalaryPhp = input.monthlySalaryPhp === '' ? null : Number(input.monthlySalaryPhp);
  input.employerSources = Array.from(document.querySelectorAll('.employer-source')).map(row => ({ url: row.querySelector('[data-source-url]').value, text: row.querySelector('[data-source-text]').value, reviewed: row.querySelector('[data-source-reviewed]').checked }));
  try { await api(editingId ? '/api/jobs/' + editingId : '/api/jobs', { method: editingId ? 'PUT' : 'POST', body: JSON.stringify(input) }); await refresh(); $('#job-dialog').close(); notify('Job saved'); }
  catch (err) { error($('#job-result'), err.message); } finally { button.disabled = false; }
});
$('#import-form').addEventListener('submit', async e => {
  e.preventDefault(); const button = e.submitter; button.disabled = true;
  try {
    const file = $('#csv-file').files[0]; if (!file) throw new Error('Choose a CSV file'); if (file.size > 5 * 1024 * 1024) throw new Error('File exceeds 5 MB');
    const result = await api('/api/import', { method: 'POST', headers: { 'Content-Type': 'text/csv' }, body: await file.text() });
    $('#import-result').className = 'success-text'; $('#import-result').textContent = `${result.imported} jobs imported successfully.${result.warnings.length ? '\n' + result.warnings.join('\n') : ''}`;
    await refresh(); notify(`${result.imported} jobs imported`); $('#csv-file').value = '';
  } catch (err) { error($('#import-result'), [err.message, ...(err.details?.errors || []).slice(0,30), ...(err.details?.warnings || [])].join('\n')); } finally { button.disabled = false; }
});
$('#settings-form').addEventListener('submit', async e => {
  e.preventDefault(); const button = e.submitter; button.disabled = true;
  const form = e.target, lines = name => form.elements[name].value.split('\n').map(s => s.trim()).filter(Boolean);
  const next = { minimumSalary: Number(form.elements.minimumSalary.value), applicantCountry: form.elements.applicantCountry.value.trim(), preferredCountries: lines('preferredCountries'), targetTitles: lines('targetTitles'), excludedCategories: Array.from(form.querySelectorAll('[name="excludedCategories"]:checked')).map(x => x.value) };
  async function save() { settings = await api('/api/settings', { method: 'PUT', body: JSON.stringify(next) }); workspaceState=await api('/api/workspace');fillSettings(); await refresh(); $('#settings-result').textContent = 'Preferences saved'; notify('Your preferences are saved. Your matches are up to date.'); }
  try {
    if (canonical(next.applicantCountry) !== canonical(settings.applicantCountry)) {
      confirmAction('Change applicant country?', 'Existing Yes / No eligibility decisions will be reset to Unknown so they can be verified for your new applicant country.', save);
      $('#confirm-action').textContent = 'Save changes';
    } else { await save(); }
  } catch (err) { $('#settings-result').textContent = err.message; } finally { button.disabled = false; }
});
$('#confirm-dialog').addEventListener('close', () => $('#confirm-action').textContent = 'Delete');
function addEmployerSource(source = { url: '', text: '', reviewed: false }) {
  if ($('#employer-sources').children.length >= 5) return notify('At most 5 employer sources');
  const row = document.createElement('div'); row.className = 'employer-source';
  row.innerHTML = `<label>Official source URL<input data-source-url type="url" required maxlength="2000" placeholder="https://company.com/about" value="${esc(source.url)}"></label><label>Exact employer excerpt<textarea data-source-text rows="4" required maxlength="10000">${esc(source.text)}</textarea></label><label class="inline-check"><input data-source-reviewed type="checkbox" ${source.reviewed ? 'checked' : ''}>I checked the original URL and confirm this is official company evidence.</label><button type="button" class="text-button remove-source">Remove source</button>`;
  row.querySelector('.remove-source').addEventListener('click', () => row.remove()); $('#employer-sources').append(row);
}
$('#add-employer-source').addEventListener('click', () => addEmployerSource());
function addProfileFact(fact = { id: crypto.randomUUID(), category: 'Experience', statement: '', evidence: '', verified: false }, container = $('#profile-facts')) {
  if (container.children.length >= 60) return notify('At most 60 profile facts');
  const row = document.createElement('div'); row.className = 'profile-fact'; row.dataset.factId = fact.id;
  row.innerHTML = `<div class="form-grid"><label>Fact type<select data-fact-category>${['Skill','Experience','Qualification'].map(c => `<option ${fact.category === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label><label>Evidence / source note<input data-fact-evidence maxlength="1500" value="${esc(fact.evidence)}" placeholder="Resume, role and dates; certificate reference"></label></div><label>Your factual statement<textarea data-fact-statement required rows="2" maxlength="1500">${esc(fact.statement)}</textarea></label><div class="fact-footer"><label class="inline-check"><input data-fact-verified type="checkbox" ${fact.verified ? 'checked' : ''}>Verified by me against the source</label><button class="text-button remove-fact" type="button">Remove fact</button></div>`;
  row.querySelector('.remove-fact').addEventListener('click', () => row.remove()); container.append(row);
}
function renderSavedBackground() {
  $('#saved-background-count').textContent = `${profile.facts.length} saved details`;
  $('#saved-background').innerHTML = profile.facts.length ? ['Experience','Skill','Qualification'].map(category => {
    const facts = profile.facts.filter(f => f.category === category);
    if (!facts.length) return '';
    const title = {Experience:'Professional experience',Skill:'Skills',Qualification:'Education and qualifications'}[category];
    return `<section class="background-group"><h3>${title}</h3><div class="background-list">${facts.map(f => `<article class="background-item"><div><p>${esc(f.statement)}</p>${f.evidence ? `<small>${esc(f.evidence)}</small>` : ''}</div><span class="pill ${f.verified ? 'good' : 'review'}">${f.verified ? 'Reviewed' : 'Needs review'}</span></article>`).join('')}</div></section>`;
  }).join('') : '<div class="empty"><h3>Add your experience with a resume</h3><p>Upload your resume above. We will pull out your experience, skills and qualifications for you to review.</p></div>';
  $('#profile-editor summary').textContent = `Edit your saved experience (${profile.facts.length} details)`;
}
function renderIntelligence() {
  const providerName = intelligence.providerName || 'AI provider', keyVariable = intelligence.keyVariable || 'GEMINI_API_KEY';
  $('#ai-provider-label').textContent = providerName + ' connection';
  $('#ai-connection-title').textContent = intelligence.configured ? 'Ready to analyse' : 'Optional AI review is not connected';
  $('#ai-connection-badge').innerHTML = badge(intelligence.configured ? 'Configured' : 'Needs verification');
  $('#ai-connection-detail').textContent = intelligence.configured ? `${providerName} · Model: ${intelligence.model}. Add descriptions and reviewed sources, then choose Analyse Job in the job workspace.${intelligence.provider === 'gemini' ? ' Use your available free quota; keep Google billing disabled. No automatic fallback to paid OpenAI.' : ''}` : 'Your profile, preference grades and application board work without AI. Optional AI review needs a separate Supabase function deployment.';
  $('#ai-data-notice').textContent = `Analyse Job sends that job's description, supplied employer excerpts, and your verified profile statements/evidence to ${providerName}. Your API key stays on the server. Analysis never overwrites manually recorded job facts or application status.${intelligence.provider === 'gemini' ? ' Google may use free-tier inputs and outputs to improve its products; omit unnecessary personal details.' : ''}`;
  $('#profile-facts').replaceChildren(); profile.facts.forEach(f=>addProfileFact(f));
  renderSavedBackground();
}
$('#add-profile-fact').addEventListener('click', () => addProfileFact());
$('#profile-form').addEventListener('submit', async e => {
  e.preventDefault(); const button = e.submitter; button.disabled = true;
  const facts = readProfileFacts($('#profile-facts'));
  try { profile = await api('/api/profile', { method: 'PUT', body: JSON.stringify({ facts }) }); renderSavedBackground(); await refresh(); $('#profile-result').textContent = 'Profile saved. Existing analyses require a new run if facts changed.'; notify('Your experience is saved'); }
  catch (err) { $('#profile-result').textContent = err.message; } finally { button.disabled = false; }
});
function evidenceHtml(items, job) {
  return items.length ? items.map(e => { const index = /^employer:(\d+)$/.exec(e.source), source = index ? job.employerSources[Number(index[1])] : null; return `<blockquote><p>“${esc(e.quote)}”</p><cite>${source ? `<a class="text-link" href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">Employer source ${Number(index[1])+1} ↗</a> · ${source.reviewed ? 'User-reviewed official source' : 'Unreviewed source'}` : esc(e.source === 'description' ? 'Job description' : 'Original salary record')}</cite></blockquote>`; }).join('') : '<p class="field-help">No supporting evidence supplied.</p>';
}
function showAnalysis(id) {
  analysisId = id; renderAnalysis(); $('#analysis-dialog').showModal();
}
function renderAnalysis() {
  const j = jobs.find(j => j.id === analysisId); if (!j) return;
  $('#analysis-title').textContent = j.title;
  const a = j.analysis, content = $('#analysis-content'); $('#analysis-result').textContent = ''; $('#analysis-result').className = '';
  const button = $('#analyse-job'); button.disabled = j.analyzing || !intelligence.configured; button.textContent = j.analyzing ? 'Analysing…' : a ? 'Analyse again' : 'Analyse Job';
  if (!a) {
    content.innerHTML = `<p>${esc(j.company)}</p><div class="notice info">${!j.jobDescription.trim() ? 'Add a job description in Edit before analysing.' : `Ready to extract requirements, eligibility, employer evidence and salary. Analysis sends supplied job text and verified profile facts to ${esc(intelligence.providerName || 'the selected AI provider')}.`}</div>${!intelligence.configured ? `<div class="notice info">Optional AI review is not connected. Preference grades and your board are ready to use.</div>` : ''}<p class="field-help">${profile.facts.filter(f => f.verified).length} verified profile facts · ${j.employerSources.filter(s => s.reviewed).length} reviewed employer sources. No experience or employer facts will be invented.</p>`;
  } else {
    const e = a.extraction;
    content.innerHTML = `<p>${esc(j.company)} · Analysed ${esc(new Date(a.analyzedAt).toLocaleString())} · ${esc(a.model)}</p>${a.stale ? '<div class="notice info">Outdated analysis. Job facts, profile, preferences, model or exchange rate changed. Prior findings below are historical; analyse again before making decisions.</div>' : ''}<div class="analysis-summary"><div>${badge(a.priority)}<span class="cell-sub">AI recommendation</span></div><div><strong>${a.suitability.score === null ? 'Not assessed' : `${a.suitability.score}/100`}</strong><span class="cell-sub">Experience suitability${a.stale ? ' · historical' : ''}</span></div><div>${badge(e.eligibility.value)}<span class="cell-sub">Applicant eligibility</span></div></div><section class="analysis-section"><h3>Recommendation reasons</h3>${a.reasons.length ? `<ul>${a.reasons.map(r => `<li>${esc(r)}</li>`).join('')}</ul>` : '<p>All high-priority gates are supported by the supplied evidence. Review the originals before applying.</p>'}</section>
      <section class="analysis-section"><h3>Employer identity and verification</h3>${badge(a.employer.status)}<p>${esc(a.employer.reason)}</p>${[['Hiring company',e.hiringCompany],['Headquarters',e.headquarters],['Business category',e.employerCategory],['Direct hiring',e.directEmployer]].map(([name,c]) => `<h4>${name}: ${esc(c.value)}</h4>${evidenceHtml(c.evidence,j)}`).join('')}</section>
      <section class="analysis-section"><h3>Location, remote work and employment</h3>${[['Eligibility',e.eligibility],['Work arrangement',e.remote],['Employment type',e.employmentType]].map(([name,c]) => `<h4>${name}: ${esc(c.value)}</h4>${evidenceHtml(c.evidence,j)}`).join('')}${e.restrictions.map(r => `<h4>${esc(r.text)}</h4>${evidenceHtml(r.evidence,j)}`).join('')}</section>
      <section class="analysis-section"><h3>Salary assessment</h3>${badge(a.salary.status)}<p>${esc(a.salary.reason)}</p><div class="salary-breakdown"><strong>${money(a.salary.monthlyMinimumPhp)}${a.salary.monthlyMaximumPhp !== null && a.salary.monthlyMaximumPhp !== a.salary.monthlyMinimumPhp ? ' – ' + money(a.salary.monthlyMaximumPhp) : ''}</strong><span class="cell-sub">Monthly PHP · ${esc(e.salary.gross)} basis · minimum ${money(a.salary.threshold)}</span></div><p class="calculation">${esc(a.salary.calculation || 'No reliable conversion available.')}</p>${a.salary.exchange ? `<p class="field-help">${esc(a.salary.exchange.provider)} · rate date ${esc(a.salary.exchange.date)} · ${a.salary.exchange.rate} PHP/${esc(a.salary.exchange.currency)} ${a.salary.exchange.url ? `<a class="text-link" href="${esc(a.salary.exchange.url)}" target="_blank" rel="noopener noreferrer">Rate source ↗</a>` : ''}</p>` : ''}${evidenceHtml(e.salary.evidence,j)}<h4>Working hours: ${esc(e.hours.schedule)}</h4><p>${e.hours.weeklyMinimum === null ? 'Weekly hours unknown' : `${e.hours.weeklyMinimum}${e.hours.weeklyMaximum !== null && e.hours.weeklyMaximum !== e.hours.weeklyMinimum ? '–' + e.hours.weeklyMaximum : ''} hours/week`} · ${e.hours.guaranteed ? 'Guaranteed hours quoted' : 'Guaranteed hours not established'}</p>${evidenceHtml(e.hours.evidence,j)}</section>
      <section class="analysis-section"><h3>Required skills, experience and qualifications</h3><p class="field-help">Suitability = matched required items / all extracted required items. A match cites only a fact you marked verified. The AI's interpretation still needs your review.</p>${e.requirements.length ? e.requirements.map(r => `<div class="requirement"><h4>${esc(r.kind)} · ${esc(r.requirement)}</h4>${badge(r.matchedFactIds.length ? 'Matched to verified profile' : 'Not established in profile')}${evidenceHtml(r.evidence,j)}${a.suitability.strengths.filter(s => s.requirement === r.requirement).map(s => `<p class="profile-evidence"><strong>Your verified fact (${esc(s.factId)}):</strong> ${esc(s.statement)}<span class="cell-sub">Source: ${esc(s.evidence)}</span></p>`).join('')}</div>`).join('') : '<p>No required skills or qualifications could be extracted. Experience match needs verification.</p>'}<h4>Missing or unestablished qualifications</h4>${a.suitability.missing.length ? `<ul>${a.suitability.missing.map(m => `<li>${esc(m)}</li>`).join('')}</ul>` : '<p>No extracted requirement is unmatched. This is based on the supplied profile only.</p>'}</section>`;
  }
  if (j.analysisError) error($('#analysis-result'), 'Last attempt: ' + j.analysisError.message + (a ? ' Previous successful analysis was retained.' : ''));
}
$('#analyse-job').addEventListener('click', async () => {
  const button = $('#analyse-job'); button.disabled = true; button.textContent = 'Analysing…'; $('#analysis-result').className = 'success-text'; $('#analysis-result').textContent = 'Extracting evidence and comparing verified facts. This may take up to a minute.';
  try { await api('/api/jobs/' + analysisId + '/analyze', { method: 'POST', body: '{}' }); await refresh(); renderAnalysis(); notify('Job analysis saved'); }
  catch (err) { try { await refresh(); } catch {} error($('#analysis-result'), err.message); } finally { button.disabled = false; button.textContent = jobs.find(j => j.id === analysisId)?.analysis ? 'Analyse again' : 'Analyse Job'; }
});
(async () => {
  try {
    const data = await api('/api/bootstrap'); token = data.token; settings = data.settings; statuses = data.statuses; categories = data.categories; profile = data.profile; intelligence = data.intelligence;workspaceState=data.workspace||{};
    $('#filter-status').insertAdjacentHTML('beforeend', statuses.map(s => `<option>${esc(s)}</option>`).join(''));
    $('#job-form').elements.applicationStatus.innerHTML = statuses.map(s => `<option>${esc(s)}</option>`).join('');
    $('#job-form').elements.employerCategory.innerHTML = ['Unknown', ...categories.filter(c => c !== 'Unknown')].map(s => `<option>${esc(s)}</option>`).join('');
    fillSettings(); renderIntelligence(); await refresh(); route(); updateRefreshStatus(); await initAccount();
    setInterval(async()=>{if(document.hidden)return;try{const previous=workspaceState.lastFinished;workspaceState=await api('/api/workspace');if(workspaceState.lastFinished!==previous&&!workspaceState.busy){await refresh();if(location.hash==='#applications')await loadApplications();}updateRefreshStatus();}catch{}},30000);
  } catch (err) { const banner = $('#error-banner'); banner.textContent = 'Unable to load workspace: ' + err.message + '. Check your connection and refresh.'; banner.classList.remove('hidden'); }
})();

let applicationSnapshot = {queue:[],config:{answers:{}}};
async function loadApplications(fill=false) {
  applicationSnapshot=await api('/api/applications');
  const form=$('#contact-form');
  if(fill||!form.dataset.loaded){for(const key of ['fullName','email','phone','city','address','country','headline'])form.elements[key].value=typeof applicationSnapshot.config.answers[key]==='string'?applicationSnapshot.config.answers[key]:'';form.dataset.loaded='yes';}
  const path=applicationSnapshot.config.resumePath;
  $('#saved-resume-note').textContent=path?'Saved resume: '+path.split(/[\\/]/).pop():'No PDF or DOCX resume saved yet. Upload one in Your profile.';
  const queued=new Set(applicationSnapshot.queue.filter(row=>!['Cancelled','Skipped'].includes(row.status)).map(row=>row.jobId));
  const available=jobs.filter(j=>!j.isDemo&&!queued.has(j.id)&&!['Applied','Interview','Rejected','Offer'].includes(j.applicationStatus)&&j.applicationLink).sort((a,b)=>b.score-a.score);
  $('#queue-job').innerHTML='<option value="">Choose a saved job…</option>'+available.map(j=>`<option value="${j.id}">${esc(j.company)} — ${esc(j.title)} (${esc(j.matchGrade)})</option>`).join('');
  $('#queue-job-form button').disabled=!available.length;
  renderQueue();
  renderBoard();
  $('#application-events').innerHTML=applicationSnapshot.events.length?applicationSnapshot.events.slice(0,20).map(e=>`<p><strong>${esc(e.status)}</strong> · ${esc(e.message)}<span class="cell-sub">${esc(new Date(e.createdAt).toLocaleString())}</span></p>`).join(''):'<p>No application activity yet.</p>';
}
function renderQueue(){
  const mode=$('#queue-view').value;
  const completed=row=>row.status==='Submitted'||['Applied','Interview','Rejected','Offer'].includes(row.applicationStatus);
  const saved=row=>['Cancelled','Skipped'].includes(row.status);
  const rows=applicationSnapshot.queue.filter(row=>mode==='all'||mode==='completed'&&completed(row)||mode==='saved'&&saved(row)||mode==='active'&&!completed(row)&&!saved(row)).sort((a,b)=>(a.matchGrade==='Not a match')-(b.matchGrade==='Not a match')||b.score-a.score);
  $('#queue-count').textContent=`${rows.length} ${mode==='active'?'applications to work through':'saved applications'} · Best preference matches first`;
  $('#application-queue').innerHTML=rows.length?rows.map(row=>`<article class="card job-card" data-queue-id="${row.id}"><div class="card-heading"><div><span class="section-label">${esc(row.company)}</span><h2>${esc(row.title)}</h2></div>${gradeBadge(row)}</div><p>${esc(row.matchLabel)}${row.provisional?' · Details need checking':''}</p>${jobIntroduction(jobs.find(j=>j.id===row.jobId)||row)}<div>${badge(completed(row)?row.applicationStatus==='Applied'?'Applied':row.applicationStatus:row.status)}</div>${row.reasons.length?`<p class="queue-warning">${esc(row.reasons.slice(0,3).join('. '))}</p>`:''}${row.status==='Uncertain'?'<p class="queue-warning">An older submission may have been sent. Check your employer account or email before applying again.</p>':''}<div class="job-actions"><button class="secondary" data-match="${row.jobId}">Why this grade?</button>${!completed(row)&&!saved(row)?`<a class="primary" href="${esc(row.applicationLink)}" target="_blank" rel="noopener noreferrer" data-open-application="${row.id}">Open application ↗</a><button class="secondary" data-queue-status="Submitted" data-queue-id="${row.id}">Mark applied</button><button class="text-button" data-queue-status="Skipped" data-queue-id="${row.id}">Skip for now</button><button class="text-button" data-queue-status="Cancelled" data-queue-id="${row.id}">Remove</button>`:saved(row)?`<button class="secondary" data-queue-add="${row.jobId}">Add back to queue</button>`:'<a class="text-link" href="#jobs">Update application stage in Jobs</a>'}</div></article>`).join(''):`<div class="card empty"><h3>${mode==='active'?'Your queue is clear':'Nothing here yet'}</h3><p>${mode==='active'?'Add a job from your shortlist. You decide when and where to apply.':'Your application history will appear here.'}</p><a class="primary" href="#jobs">Browse your jobs</a></div>`;
}
async function addToQueue(id){
  try{await api('/api/applications/queue',{method:'POST',body:JSON.stringify({jobId:id})});await loadApplications();notify('Added to your application queue');}
  catch(err){notify(err.message);}
}
$('#queue-job-form').addEventListener('submit',async e=>{e.preventDefault();await addToQueue(Number($('#queue-job').value));});
$('#queue-view').addEventListener('change',renderQueue);
$('#queue-refresh').addEventListener('click',()=>loadApplications().catch(err=>error($('#automation-result'),err.message)));
$('#contact-form').addEventListener('submit',async e=>{e.preventDefault();const button=e.submitter;button.disabled=true;try{await api('/api/applications/contacts',{method:'PUT',body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});await loadApplications(true);notify('Contact details saved');}catch(err){error($('#automation-result'),err.message);}finally{button.disabled=false;}});
$('#application-queue').addEventListener('click',async e=>{
  const match=e.target.closest('[data-match]');if(match)return showMatch(Number(match.dataset.match));
  const add=e.target.closest('[data-queue-add]');if(add)return addToQueue(Number(add.dataset.queueAdd));
  const opened=e.target.closest('[data-open-application]');if(opened){try{await api('/api/applications/'+opened.dataset.openApplication+'/status',{method:'PATCH',body:JSON.stringify({status:'In progress'})});await loadApplications();}catch(err){notify(err.message);}return;}
  const button=e.target.closest('[data-queue-status]');if(!button)return;
  const action=async()=>{await api('/api/applications/'+button.dataset.queueId+'/status',{method:'PATCH',body:JSON.stringify({status:button.dataset.queueStatus})});await refresh();await loadApplications();notify(button.dataset.queueStatus==='Submitted'?'Application recorded as applied':'Queue updated');};
  if(button.dataset.queueStatus==='Submitted'){confirmAction('Did you submit this application?','Choose “Yes, I submitted it” only after you have completed the employer’s application. This records your progress; it does not submit anything.',action);$('#confirm-action').textContent='Yes, I submitted it';}
  else{try{await action();}catch(err){notify(err.message);}}
});

function readProfileFacts(container) {
  return Array.from(container.querySelectorAll('.profile-fact')).map(row=>({id:row.dataset.factId,category:row.querySelector('[data-fact-category]').value,statement:row.querySelector('[data-fact-statement]').value,evidence:row.querySelector('[data-fact-evidence]').value,verified:row.querySelector('[data-fact-verified]').checked}));
}
let resumeDraft = null;
$('#resume-upload-form').addEventListener('submit',async e=>{
  e.preventDefault();const button=e.submitter;button.disabled=true;resumeDraft=null;$('#resume-review-form').classList.add('hidden');
  try {
    const file=$('#resume-file').files[0];if(!file||file.size>3*1024*1024)throw new Error('Choose a PDF, DOCX or TXT file up to 3 MB');
    $('#resume-result').textContent='Reading your resume locally…';
    const encoded=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('Could not read the file'));reader.readAsDataURL(file);});
    resumeDraft=await api('/api/resume/preview',{method:'POST',body:JSON.stringify({filename:file.name,data:encoded})});
    $('#resume-contacts').innerHTML=Object.entries({fullName:'Full name',email:'Email',phone:'Phone',city:'City',address:'Street address',country:'Country where you live',headline:'Professional headline'}).map(([key,label])=>`<label>${label}<input data-resume-contact="${key}" ${key==='email'?'type="email"':''} maxlength="500" value="${esc(resumeDraft.contacts[key])}"></label>`).join('');
    $('#resume-facts').replaceChildren();resumeDraft.facts.forEach(f=>addProfileFact(f,$('#resume-facts')));
    $('#resume-text').textContent=resumeDraft.text;$('#resume-warnings').textContent=resumeDraft.warnings.join(' ');
    $('#resume-titles').value=resumeDraft.targetTitles.join('\n');
    for(const id of ['resume-confirm','resume-verify-all','resume-update-country','resume-update-titles'])$('#'+id).checked=false;
    $('#resume-mode').value=profile.facts.length?'append':'replace';
    $('#resume-review-form').classList.remove('hidden');$('#resume-result').textContent=`Draft ready: ${resumeDraft.facts.length} facts. Review before saving. No existing data has changed.${file.name.toLowerCase().endsWith('.txt')?' TXT can build your profile; upload PDF or DOCX for employer attachment.':''}`;
  } catch(err){error($('#resume-result'),err.message);} finally{button.disabled=false;}
});
$('#resume-verify-all').addEventListener('change',e=>$('#resume-facts').querySelectorAll('[data-fact-verified]').forEach(box=>box.checked=e.target.checked));
$('#resume-cancel').addEventListener('click',()=>{resumeDraft=null;$('#resume-review-form').classList.add('hidden');$('#resume-facts').replaceChildren();$('#resume-text').textContent='';$('#resume-result').textContent='Cancelled. Your saved profile is unchanged.';});
$('#resume-review-form').addEventListener('submit',async e=>{
  e.preventDefault();const button=e.submitter;button.disabled=true;
  try {
    if(!resumeDraft)throw new Error('Upload your resume first');
    const contacts=Object.fromEntries(Array.from($('#resume-contacts').querySelectorAll('input')).map(input=>[input.dataset.resumeContact,input.value.trim()]));
    const data=await api('/api/resume/apply',{method:'POST',body:JSON.stringify({draftId:resumeDraft.draftId,confirmed:$('#resume-confirm').checked,mode:$('#resume-mode').value,contacts,profile:{facts:readProfileFacts($('#resume-facts'))},updateCountry:$('#resume-update-country').checked,updateTitles:$('#resume-update-titles').checked,targetTitles:$('#resume-titles').value.split('\n').map(v=>v.trim()).filter(Boolean)})});
    profile=data.profile;settings=data.settings;fillSettings();renderIntelligence();await refresh();await loadApplications(true);
    resumeDraft=null;$('#resume-review-form').classList.add('hidden');$('#resume-facts').replaceChildren();$('#resume-text').textContent='';$('#resume-result').className='success-text';$('#resume-result').textContent='Resume saved. Your experience appears below and your application contact fields are filled.';$('#saved-background-title').scrollIntoView({block:'start'});notify('Resume profile saved');
  } catch(err){error($('#resume-result'),err.message);} finally{button.disabled=false;}
});

function renderSetup(){
 const complete=workspaceState.setupCompleted;$('#guided-setup').classList.toggle('hidden',Boolean(complete));
 const hasResume=profile.facts.length>0,preferences=workspaceState.preferencesReviewed;
 $('#setup-progress').textContent=hasResume?(preferences?'You are all set. Let us look at the jobs.':'Next, tell us what you are looking for'):'Let us start with your experience';
 $('#setup-guidance').textContent=hasResume?(preferences?'Look through the job details and grades, then save the roles you would like to apply for.':'Choose the location, roles and salary that suit you. Save them to update your job grades.'):'Upload and review your resume to fill your profile. You can also browse the jobs first.';
}
$('#finish-setup').addEventListener('click',async()=>{try{await api('/api/setup/complete',{method:'POST',body:'{}'});workspaceState.setupCompleted=true;renderSetup();notify('You are all set. Let us look at the jobs.');}catch(e){notify(e.message);}});
function updateRefreshStatus(){
 if(workspaceState.busy&&!refreshPoll){refreshPoll=setInterval(async()=>{try{workspaceState=await api('/api/workspace');if(!workspaceState.busy){clearInterval(refreshPoll);refreshPoll=null;await refresh();notify('Job availability updated');}updateRefreshStatus();}catch{clearInterval(refreshPoll);refreshPoll=null;}},2000);}
}
$('#link-preview-form').addEventListener('submit',async event=>{event.preventDefault();const button=event.submitter;button.disabled=true;linkDraft=null;$('#save-link-job').classList.add('hidden');$('#link-preview').classList.add('hidden');$('#link-result').textContent='Reading the employer vacancy…';try{linkDraft=await api('/api/jobs/from-link/preview',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(event.target)))});$('#link-preview').innerHTML=`<h3>${esc(linkDraft.job.title)}</h3><p>${esc(linkDraft.job.company)} · ${esc(linkDraft.location)}</p><p>${esc(linkDraft.job.jobDescription.slice(0,1200))}</p><div class="notice info">Salary, country eligibility and direct-employer status still need review. We do not infer them from the company name.</div>`;$('#link-preview').classList.remove('hidden');$('#save-link-job').classList.remove('hidden');$('#link-result').textContent='Review the extracted details, then save.';}catch(e){error($('#link-result'),e.message);}finally{button.disabled=false;}});
$('#save-link-job').addEventListener('click',async event=>{event.target.disabled=true;try{if(!linkDraft)throw Error('Read a job link first');await api('/api/jobs/from-link/save',{method:'POST',body:JSON.stringify({draftId:linkDraft.draftId,confirmed:true})});await refresh();$('#link-dialog').close();notify('Job added for review');}catch(e){error($('#link-result'),e.message);}finally{event.target.disabled=false;}});

function renderBoard(){
 const ids=new Set(applicationSnapshot.queue.filter(r=>!['Cancelled','Skipped'].includes(r.status)).map(r=>r.jobId));
 const tracked=jobs.filter(j=>ids.has(j.id)||['Applied','Interview','Offer','Rejected'].includes(j.applicationStatus));
 const stages=[['Saved','Discovered'],['To apply','Ready to Apply'],['Applied','Applied'],['Interview','Interview'],['Offer','Offer'],['Rejected','Rejected']];
 const stageFor=j=>['Discovered','Under Review'].includes(j.applicationStatus)?'Discovered':j.applicationStatus;
 $('#board-columns').innerHTML=stages.map(([label,status])=>{const list=tracked.filter(j=>stageFor(j)===status);return `<section class="board-column" data-drop-stage="${status}" aria-label="${label} applications"><h3>${label} <span>${list.length}</span></h3>${list.map(j=>`<article class="board-card" draggable="true" data-drag-job="${j.id}"><span>${esc(j.company)}</span><h4><span class="drag-grip" aria-hidden="true">⠿</span>${esc(j.title)}</h4><label>Stage<select data-board-stage="${j.id}">${stages.map(([name,value])=>`<option value="${value}" ${value===stageFor(j)?'selected':''}>${name}</option>`).join('')}</select></label><form data-reminder-form="${j.id}"><label>Follow up (UTC date)<input name="followUp" type="date" value="${esc(j.workspace?.followUp||'')}"></label><label>My notes<textarea name="notes" rows="2" maxlength="3000">${esc(j.workspace?.notes||'')}</textarea></label><button class="text-button" type="submit">Save reminder</button></form>${j.applicationLink?`<a class="text-link" target="_blank" rel="noopener noreferrer" href="${esc(j.applicationLink)}">Open employer listing ↗</a>`:''}</article>`).join('')||'<p class="field-help">No jobs in this stage</p>'}</section>`;}).join('');
 const today=new Date().toISOString().slice(0,10),due=tracked.filter(j=>j.workspace?.followUp&&j.workspace.followUp<=today&&!['Offer','Rejected'].includes(j.applicationStatus));
 $('#follow-up-summary').classList.toggle('hidden',!due.length);$('#follow-up-summary').textContent=due.length?`${due.length} follow-up${due.length===1?' is':'s are'} due: ${due.map(j=>j.company+' — '+j.title).join('; ')}`:'';
}
let boardMoving=false,draggedJob=null;
const boardStage=j=>['Discovered','Under Review'].includes(j.applicationStatus)?'Discovered':j.applicationStatus;
async function moveBoardJob(id,status){
 const job=jobs.find(j=>j.id===id);if(!job||boardMoving||boardStage(job)===status)return;
 if(!['Discovered','Ready to Apply','Applied','Interview','Offer','Rejected'].includes(status))return;
 const save=async()=>{if(boardMoving)return;boardMoving=true;$('#board-columns').classList.add('board-saving');$('#board-move-status').textContent='Saving your move…';try{await api('/api/jobs/'+id,{method:'PATCH',body:JSON.stringify({applicationStatus:status})});await refresh();await loadApplications();const message='Application moved to '+(status==='Discovered'?'Saved':status);$('#board-move-status').textContent=message;notify(message);}catch(e){renderBoard();$('#board-move-status').textContent='The move was not saved. '+e.message;notify(e.message);}finally{boardMoving=false;$('#board-columns').classList.remove('board-saving');}};
 if(status==='Applied'&&job.applicationStatus!=='Applied')confirmAction('Have you submitted this application?','This only records the application you submitted yourself on the employer website.',save);else await save();
}
$('#board-columns').addEventListener('change',async event=>{const select=event.target.closest('[data-board-stage]');if(!select)return;const job=jobs.find(j=>j.id===Number(select.dataset.boardStage)),status=select.value;if(job)select.value=boardStage(job);await moveBoardJob(Number(select.dataset.boardStage),status);});
function clearBoardDrag(){draggedJob=null;document.querySelectorAll('.board-drop-target,.board-dragging').forEach(e=>e.classList.remove('board-drop-target','board-dragging'));}
$('#board-columns').addEventListener('dragstart',event=>{const card=event.target.closest('[data-drag-job]');if(!card||boardMoving||event.target.closest('input,textarea,select,button,a')){event.preventDefault();return;}draggedJob=Number(card.dataset.dragJob);event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',String(draggedJob));card.classList.add('board-dragging');});
$('#board-columns').addEventListener('dragover',event=>{if(draggedJob===null)return;const column=event.target.closest('[data-drop-stage]');if(!column)return;event.preventDefault();event.dataTransfer.dropEffect='move';document.querySelectorAll('.board-drop-target').forEach(e=>e.classList.remove('board-drop-target'));column.classList.add('board-drop-target');const board=$('#board-columns'),rect=board.getBoundingClientRect();if(event.clientX>rect.right-65)board.scrollLeft+=18;else if(event.clientX<rect.left+65)board.scrollLeft-=18;});
$('#board-columns').addEventListener('drop',async event=>{const column=event.target.closest('[data-drop-stage]');if(!column||draggedJob===null)return;event.preventDefault();const id=draggedJob,status=column.dataset.dropStage;clearBoardDrag();await moveBoardJob(id,status);});
$('#board-columns').addEventListener('dragend',clearBoardDrag);
$('#board-columns').addEventListener('submit',async event=>{const form=event.target.closest('[data-reminder-form]');if(!form)return;event.preventDefault();const button=event.submitter;button.disabled=true;try{await api('/api/jobs/'+form.dataset.reminderForm+'/reminder',{method:'PUT',body:JSON.stringify(Object.fromEntries(new FormData(form)))});await refresh();renderBoard();notify('Follow-up reminder saved');}catch(e){notify(e.message);}finally{button.disabled=false;}});
async function authAction(path){ if(path==='logout')return signOut();throw Error('Account deletion requires a Supabase administrator. Contact Casa Rustia to remove your account.'); }
async function initAccount(){const account=await requireUser();$('#account-menu').classList.remove('hidden');$('#account-email').textContent=account.email;}
$('#account-menu').addEventListener('click',()=>$('#account-dialog').showModal());
$('#sign-out').addEventListener('click',async()=>{try{await authAction('logout');location.replace('./signin.html');}catch(e){error($('#account-result'),e.message);}});
$('#delete-account-form').addEventListener('submit',async event=>{event.preventDefault();const button=event.submitter;button.disabled=true;try{await authAction('delete',Object.fromEntries(new FormData(event.target)));location.assign('./signin.html');}catch(e){error($('#account-result'),e.message);}finally{button.disabled=false;}});
window.addEventListener('pageshow',async event=>{if(event.persisted)await requireUser();});
