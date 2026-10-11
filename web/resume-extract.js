export function extractResume(text, filename) {
    const lines = text.split('\n').map(v => v.replace(/[ \t]+/g, ' ').trim()).filter(v => v && !/^--?\s*\d+\s*(?:of|\/)\s*\d+\s*--?$/i.test(v));
    const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || '';
    const phone = lines.slice(0, 15).join('\n').match(/(?:\+\d{1,3}[ .()-]*)?(?:\(?\d{2,4}\)?[ .-]*){2,4}\d{3,4}/)?.[0]?.trim() || '';
    const labeled = (label) => lines.find(v => new RegExp('^' + label + '\\s*:', 'i').test(v))?.replace(/^[^:]+:\s*/, '') || '';
    const nameCandidate = labeled('(?:full )?name') || lines[0] || '';
    const fullName = nameCandidate.length <= 100 && !/[@\d]|resume|curriculum|professional summary|experience/i.test(nameCandidate) ? nameCandidate : '';
    const headline = labeled('headline') || (lines[1] && !/[@\d]|address|summary|education|skills/i.test(lines[1]) ? lines[1].slice(0, 300) : '');
    const contacts = { fullName, email, phone, city: labeled('city'), address: labeled('address'), country: labeled('country'), headline };
    const facts = [], titles = [];
    let category = 'Experience', section = 'Resume', context = '';
    let omitted = 0;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i], heading = line.toLowerCase().replace(/[^a-z ]/g, '').trim();
        if (/^(?:core |technical |professional |key |digital )?skills$|^tools(?: and | )[a-z ]*$|^competencies$/.test(heading)) {
            category = 'Skill';
            section = line;
            context = '';
            continue;
        }
        if (/^(?:professional |work |employment )?experience(?: continued)?$|^employment history$|^career history$/.test(heading)) {
            category = 'Experience';
            section = line;
            context = '';
            continue;
        }
        if (/^education$|^certifications(?: and training)?$|^qualifications$|^training$/.test(heading)) {
            category = 'Qualification';
            section = line;
            context = '';
            continue;
        }
        if (/^(?:professional |career )?summary$|^profile$|^about me$/.test(heading)) {
            category = 'Experience';
            section = line;
            context = '';
            continue;
        }
        if (i < 2 || line.includes('@') || line === phone || /^(?:name|email|phone|mobile|address|city|country|headline)\s*:/i.test(line))
            continue;
        if (i < 8 && /(?:https?:\/\/|github\.com|linkedin\.com)|(?:\+\d|\b\d{7,}\b)/i.test(line))
            continue;
        const roleLine = category === 'Experience' && !/^[•*\-]/.test(line) && line.length < 150 && /\b(manager|coordinator|assistant|specialist|executive|receptionist|director|analyst|engineer|developer|designer|teacher|consultant|officer|guide|support|lead)\b/i.test(line) && !/[.!?]$/.test(line);
        if (roleLine) {
            context = line;
            if (!titles.includes(line) && titles.length < 12)
                titles.push(line);
        }
        const statement = (context && !roleLine ? `${context}: ${line}` : line).replace(/^[•*\-]\s*/, '');
        if (facts.length >= 60 || statement.length > 1500) {
            omitted++;
            continue;
        }
        facts.push({ id: crypto.randomUUID(), category, statement, evidence: `${filename} — ${section}${context ? ' / ' + context : ''}`.slice(0, 1500), verified: false });
    }
    return { contacts, facts, targetTitles: titles, warnings: [
            'Extraction is a local text-based draft. Review contact details, role context and every fact before confirming. No fact is independently verified.',
            'Country is filled only from a labeled Country field. Confirm where you live, not where an employer is located.',
            ...(omitted ? [`${omitted} long or excess lines were omitted. Compare the extracted text and add missing facts manually.`] : [])
        ], text };
}
