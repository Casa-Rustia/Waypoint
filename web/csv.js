import { validateJob } from './model.js';
export const csvHeaders = ['Company Name', 'Job Title', 'Company Headquarters', 'Employment Type', 'Work Arrangement', 'Original Salary', 'Monthly Salary in PHP', 'Philippines Eligibility', 'Direct Employer Status', 'Employer Category', 'Application Status', 'Application Link', 'Evidence', 'Job Description', 'Employer Sources'];
const fields = ['company', 'title', 'headquarters', 'employmentType', 'workArrangement', 'originalSalary', 'monthlySalaryPhp', 'philippinesEligibility', 'directEmployerStatus', 'employerCategory', 'applicationStatus', 'applicationLink', 'evidence', 'jobDescription', 'employerSources'];
const normalize = (v) => v.replace(/[\s_-]/g, '').toLowerCase();
export function parseCsv(source) {
    const rows = [];
    let row = [], field = '', quoted = false, closed = false;
    source = source.replace(/^\uFEFF/, '');
    for (let i = 0; i < source.length; i++) {
        const c = source[i];
        if (quoted) {
            if (c === '"') {
                if (source[i + 1] === '"') {
                    field += '"';
                    i++;
                }
                else {
                    quoted = false;
                    closed = true;
                }
            }
            else
                field += c;
        }
        else if (c === '"') {
            if (field || closed)
                throw new Error('Invalid quote in CSV field');
            quoted = true;
        }
        else if (c === ',') {
            row.push(field);
            field = '';
            closed = false;
        }
        else if (c === '\n' || c === '\r') {
            if (c === '\r' && source[i + 1] === '\n')
                i++;
            row.push(field);
            if (row.some(v => v.trim()))
                rows.push(row);
            row = [];
            field = '';
            closed = false;
        }
        else {
            if (closed) {
                if (c === ' ' || c === '\t')
                    continue;
                throw new Error('Unexpected text after quoted CSV field');
            }
            field += c;
        }
    }
    if (quoted)
        throw new Error('Unclosed quoted CSV field');
    row.push(field);
    if (row.some(v => v.trim()))
        rows.push(row);
    return rows;
}
export function importRows(source) {
    const rows = parseCsv(source);
    if (rows.length < 2)
        throw new Error('CSV must contain a header and at least one job');
    if (rows.length > 5001)
        throw new Error('Import at most 5,000 jobs at a time');
    const header = rows.shift();
    const mapped = header.map(h => { const n = normalize(h); const i = csvHeaders.findIndex((x, i) => normalize(x) === n || normalize(fields[i]) === n); return i < 0 ? null : fields[i]; });
    if (!mapped.includes('company') || !mapped.includes('title'))
        throw new Error('Required CSV columns: Company Name and Job Title');
    const used = mapped.filter(Boolean);
    if (new Set(used).size !== used.length)
        throw new Error('Duplicate CSV column names');
    const jobs = [], errors = [];
    rows.forEach((r, i) => {
        try {
            if (r.length !== header.length)
                throw new Error(`Expected ${header.length} columns, received ${r.length}`);
            const input = {};
            mapped.forEach((key, c) => { if (key)
                input[key] = r[c].trim(); });
            jobs.push(validateJob(input));
        }
        catch (e) {
            errors.push(`Record ${i + 2}: ${e.message}`);
        }
    });
    return { jobs, errors, warnings: header.filter((_, i) => !mapped[i]).map(h => `Ignored column: ${h}`) };
}
