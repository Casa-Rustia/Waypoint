export const statuses = ['Discovered', 'Under Review', 'Ready to Apply', 'Applied', 'Interview', 'Rejected', 'Offer'];
export const categories = ['Direct company', 'VA agency', 'Recruitment agency', 'Staffing agency', 'BPO', 'Outsourcing intermediary', 'Unknown'];
export const countries = ['USA', 'Australia', 'UK', 'Canada', 'Austria', 'Belgium', 'Bulgaria', 'Croatia', 'Cyprus', 'Czechia', 'Denmark', 'Estonia', 'Finland', 'France', 'Germany', 'Greece', 'Hungary', 'Iceland', 'Ireland', 'Italy', 'Latvia', 'Lithuania', 'Luxembourg', 'Malta', 'Netherlands', 'Norway', 'Poland', 'Portugal', 'Romania', 'Slovakia', 'Slovenia', 'Spain', 'Sweden', 'Switzerland'];
export const defaults = {
    minimumSalary: 70000, applicantCountry: 'Philippines', preferredCountries: countries,
    excludedCategories: categories.slice(1, 6),
    targetTitles: ['Operations Manager', 'Operations Coordinator', 'Project Coordinator', 'Business Operations Specialist', 'Executive Assistant', 'Customer Success Specialist', 'Account Manager', 'Client Services Manager']
};
export function canonicalCountry(value) {
    const v = value.trim().toLowerCase();
    if (['us', 'usa', 'united states', 'united states of america'].includes(v))
        return 'usa';
    if (['uk', 'united kingdom', 'great britain'].includes(v))
        return 'uk';
    if (['ph', 'phl', 'philippines', 'the philippines'].includes(v))
        return 'philippines';
    return v;
}
export function evaluate(job, settings) {
    const reasons = [], unknowns = [];
    let score = 0;
    const unknown = (v) => !v.trim() || v.toLowerCase() === 'unknown';
    const same = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();
    const titleMatches = settings.targetTitles.some(t => job.title.toLowerCase().includes(t.toLowerCase()));
    if (titleMatches)
        score += 20;
    else
        reasons.push('Job title is outside your target roles');
    if (unknown(job.headquarters))
        unknowns.push('Headquarters needs verification');
    else if (canonicalCountry(job.headquarters) === canonicalCountry(settings.applicantCountry))
        reasons.push('Employer is headquartered in applicant country');
    else {
        score += 10;
        if (settings.preferredCountries.some(c => canonicalCountry(c) === canonicalCountry(job.headquarters)))
            score += 5;
    }
    if (unknown(job.employerCategory))
        unknowns.push('Employer category needs verification');
    else if (settings.excludedCategories.some(c => same(c, job.employerCategory)))
        reasons.push('Excluded employer category');
    else
        score += 5;
    if (job.directEmployerStatus === 'Yes')
        score += 15;
    else if (job.directEmployerStatus === 'No')
        reasons.push('Not a direct employer');
    else
        unknowns.push('Direct employer status needs verification');
    if (job.workArrangement === '100% Remote')
        score += 15;
    else if (unknown(job.workArrangement))
        unknowns.push('Work arrangement needs verification');
    else
        reasons.push('Position is not 100% remote');
    if (job.philippinesEligibility === 'Yes')
        score += 15;
    else if (job.philippinesEligibility === 'No')
        reasons.push('Applicant country is not eligible');
    else
        unknowns.push('Applicant country eligibility needs verification');
    if (job.monthlySalaryPhp === null)
        unknowns.push('Monthly PHP salary needs verification');
    else if (job.monthlySalaryPhp >= settings.minimumSalary)
        score += 10;
    else
        reasons.push('Salary is below the minimum');
    if (['Full-time', 'Contract'].includes(job.employmentType))
        score += 5;
    else if (unknown(job.employmentType))
        unknowns.push('Employment type needs verification');
    else
        reasons.push('Employment type is outside full-time or contract');
    const matchGrade = reasons.length ? 'Not a match' : score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 50 ? 'C' : 'D';
    const matchLabel = reasons.length ? 'Outside your preferences' : { A: 'Excellent preference match', B: 'Good preference match', C: 'Partial preference match', D: 'Limited confirmed match' }[matchGrade];
    const check = (label, value, maximum) => ({ label, points: value === true ? maximum : 0, maximum, status: value === null ? 'Needs checking' : value ? 'Matches' : 'Does not match' });
    const foreign = unknown(job.headquarters) ? null : canonicalCountry(job.headquarters) !== canonicalCountry(settings.applicantCountry);
    const matchBreakdown = [
        check('One of your target job titles', titleMatches, 20),
        check('Employer headquartered abroad', foreign, 10),
        check('One of your preferred employer countries', foreign === null ? null : foreign && settings.preferredCountries.some(c => canonicalCountry(c) === canonicalCountry(job.headquarters)), 5),
        check('Employer category you allow', unknown(job.employerCategory) ? null : !settings.excludedCategories.some(c => same(c, job.employerCategory)), 5),
        check('Direct employer', job.directEmployerStatus === 'Unknown' ? null : job.directEmployerStatus === 'Yes', 15),
        check('Fully remote work', unknown(job.workArrangement) ? null : job.workArrangement === '100% Remote', 15),
        check(`Accepts applicants from ${settings.applicantCountry}`, job.philippinesEligibility === 'Unknown' ? null : job.philippinesEligibility === 'Yes', 15),
        check(`Gross salary at least PHP ${settings.minimumSalary.toLocaleString('en-US')} monthly`, job.monthlySalaryPhp === null ? null : job.monthlySalaryPhp >= settings.minimumSalary, 10),
        check('Full-time or contract employment', unknown(job.employmentType) ? null : ['Full-time', 'Contract'].includes(job.employmentType), 5)
    ];
    return { score, matchGrade, matchLabel, matchBreakdown, provisional: unknowns.length > 0, qualification: reasons.length ? 'Not qualified' : unknowns.length ? 'Needs review' : 'Qualified', reasons: [...reasons, ...unknowns] };
}
export function validateSettings(input) {
    if (!input || typeof input !== 'object')
        throw new Error('Settings must be an object');
    const s = input;
    if (typeof s.minimumSalary !== 'number' || !Number.isFinite(s.minimumSalary) || s.minimumSalary < 0)
        throw new Error('Minimum salary must be a non-negative number');
    if (typeof s.applicantCountry !== 'string' || !s.applicantCountry.trim() || s.applicantCountry.length > 100)
        throw new Error('Applicant country is required');
    for (const key of ['preferredCountries', 'excludedCategories', 'targetTitles']) {
        if (!Array.isArray(s[key]) || s[key].length > 100 || !s[key].every(v => typeof v === 'string' && v.trim() && v.length <= 150))
            throw new Error(`${key} must be a list of non-empty values`);
    }
    if (!s.targetTitles.length)
        throw new Error('At least one target title is required');
    if (!s.excludedCategories.every(v => categories.includes(v) && v !== 'Unknown'))
        throw new Error('Invalid excluded category');
    return { minimumSalary: s.minimumSalary, applicantCountry: s.applicantCountry.trim(), preferredCountries: s.preferredCountries.map(v => v.trim()), excludedCategories: s.excludedCategories, targetTitles: s.targetTitles.map(v => v.trim()) };
}
export function validateJob(input, allowDemo = false) {
    if (!input || typeof input !== 'object')
        throw new Error('Job must be an object');
    const j = input;
    const str = (key, fallback = '') => {
        const v = j[key] ?? fallback;
        if (typeof v !== 'string' || v.length > (key === 'jobDescription' ? 40000 : key === 'evidence' ? 5000 : 2000))
            throw new Error(`Invalid ${key}`);
        return v.trim();
    };
    const choice = (key, values, fallback) => {
        const v = str(key, fallback) || fallback;
        const match = values.find(x => x.toLowerCase() === v.toLowerCase());
        if (!match)
            throw new Error(`${key} must be one of: ${values.join(', ')}`);
        return match;
    };
    const company = str('company'), title = str('title');
    if (!company || !title)
        throw new Error('Company and job title are required');
    const raw = j.monthlySalaryPhp;
    const salary = raw === undefined || raw === null || raw === '' ? null : typeof raw === 'number' ? raw : typeof raw === 'string' && /^\d+(\.\d{1,2})?$/.test(raw.trim()) ? Number(raw) : NaN;
    if (salary !== null && (!Number.isFinite(salary) || salary < 0 || salary > 1e10))
        throw new Error('Monthly salary in PHP must be a non-negative number (no currency symbols)');
    const link = str('applicationLink');
    if (link) {
        try {
            if (!['http:', 'https:'].includes(new URL(link).protocol))
                throw new Error();
        }
        catch {
            throw new Error('Application link must be an http or https URL');
        }
    }
    let sources = j.employerSources ?? [];
    if (typeof sources === 'string') {
        try {
            sources = sources.trim() ? JSON.parse(sources) : [];
        }
        catch {
            throw new Error('Employer Sources must be a JSON array');
        }
    }
    if (!Array.isArray(sources) || sources.length > 5)
        throw new Error('At most 5 employer sources are allowed');
    const employerSources = sources.map(s => {
        if (!s || typeof s !== 'object' || typeof s.url !== 'string' || s.url.length > 2000 || typeof s.text !== 'string' || !s.text.trim() || s.text.length > 10000 || typeof s.reviewed !== 'boolean')
            throw new Error('Employer source requires url, text and reviewed');
        try {
            const url = new URL(s.url);
            if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password)
                throw new Error();
        }
        catch {
            throw new Error('Employer source URL must use http or https without credentials');
        }
        return { url: s.url.trim(), text: s.text.trim(), reviewed: s.reviewed };
    });
    return { company, title, headquarters: str('headquarters', 'Unknown') || 'Unknown', employmentType: choice('employmentType', ['Full-time', 'Contract', 'Part-time', 'Unknown'], 'Unknown'), workArrangement: choice('workArrangement', ['100% Remote', 'Hybrid', 'On-site', 'Unknown'], 'Unknown'), originalSalary: str('originalSalary'), monthlySalaryPhp: salary, philippinesEligibility: choice('philippinesEligibility', ['Yes', 'No', 'Unknown'], 'Unknown'), directEmployerStatus: choice('directEmployerStatus', ['Yes', 'No', 'Unknown'], 'Unknown'), employerCategory: choice('employerCategory', categories, 'Unknown'), applicationStatus: choice('applicationStatus', statuses, 'Discovered'), applicationLink: link, evidence: str('evidence'), isDemo: allowDemo && j.isDemo === true, jobDescription: str('jobDescription'), employerSources };
}
