export const emptyProfile = { facts: [] };
export function validateProfile(input) {
    if (!input || typeof input !== 'object' || !Array.isArray(input.facts) || input.facts.length > 60)
        throw new Error('Profile must contain at most 60 facts');
    const ids = new Set();
    const facts = input.facts.map(f => {
        if (!f || typeof f !== 'object' || typeof f.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(f.id) || ids.has(f.id))
            throw new Error('Profile fact IDs must be unique');
        ids.add(f.id);
        if (!['Skill', 'Experience', 'Qualification'].includes(f.category) || typeof f.statement !== 'string' || !f.statement.trim() || f.statement.length > 1500 || typeof f.evidence !== 'string' || f.evidence.length > 1500 || typeof f.verified !== 'boolean')
            throw new Error('Each profile fact requires category, statement, evidence and verified status');
        if (f.verified && !f.evidence.trim())
            throw new Error('Verified facts require a source or evidence note');
        return { id: f.id, category: f.category, statement: f.statement.trim(), evidence: f.evidence.trim(), verified: f.verified };
    });
    return { facts };
}
