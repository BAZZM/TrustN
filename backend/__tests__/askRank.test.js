const { rankCandidates, scoreCandidate, patternCacheSize, MAX_PATTERN_CACHE } = require('../lib/askRank');

const innerNames = new Map([
  [10, 'Henry Harris'],
  [11, 'Bob Brown'],
]);

const cand = (over) => ({
  id: 1,
  name: 'Person',
  job_role: '',
  industry: '',
  experience: '',
  kind: 'secondary',
  strength: 0,
  direct: false,
  via: [],
  primary_via: null,
  ...over,
});

describe('scoreCandidate', () => {
  test('returns null when no term matches', () => {
    expect(scoreCandidate(cand({ job_role: 'Plumber' }), ['design'])).toBeNull();
    expect(scoreCandidate(cand({ job_role: 'Designer' }), [])).toBeNull();
  });

  test('a role match is worth more than a bio or name match', () => {
    const role = scoreCandidate(cand({ job_role: 'Designer' }), ['design']);
    const bio = scoreCandidate(cand({ experience: 'did some design work' }), ['design']);
    const name = scoreCandidate(cand({ name: 'Design Dan' }), ['design']);
    expect(role.score).toBeGreaterThan(bio.score);
    expect(bio.score).toBeGreaterThan(name.score);
  });

  test('a full-text hit that is not a word-start match still counts, as a "profile" match', () => {
    const r = scoreCandidate(cand({ job_role: 'Builder', ftsTerms: ['design'] }), ['design']);
    expect(r).not.toBeNull();
    expect(r.matchedFields).toEqual(['profile']);
  });

  test('matches on the stem, so "designers" finds "Design Lead" and "engineering" finds "Software Engineer"', () => {
    expect(scoreCandidate(cand({ job_role: 'Design Lead' }), ['designers'])).not.toBeNull();
    expect(scoreCandidate(cand({ job_role: 'Software Engineer' }), ['engineering'])).not.toBeNull();
  });

  test('matches whole words by their start, not raw substrings', () => {
    expect(scoreCandidate(cand({ job_role: 'Smart Cities Lead' }), ['art'])).toBeNull();
    expect(scoreCandidate(cand({ industry: 'Partnerships' }), ['art'])).toBeNull();
    expect(scoreCandidate(cand({ job_role: 'Art Director' }), ['art'])).not.toBeNull();
    expect(scoreCandidate(cand({ job_role: 'Outlaw Tours Guide' }), ['law'])).toBeNull();
  });

  test('does not let a short stem match unrelated words ("water" must not match "watch")', () => {
    expect(scoreCandidate(cand({ job_role: 'Watch Repairer' }), ['water'])).toBeNull();
    expect(scoreCandidate(cand({ job_role: 'Water Engineer' }), ['water'])).not.toBeNull();
    expect(scoreCandidate(cand({ experience: 'a papa of three' }), ['paper'])).toBeNull();
  });

  test('a synonym counts as a hit for its term, alongside the word as typed', () => {
    const synonyms = { software: ['engineer'] };
    // matches by synonym
    expect(scoreCandidate(cand({ job_role: 'Backend Engineer' }), ['software'], synonyms)).not.toBeNull();
    // matches by the literal word the user typed (the old behavior would have lost this)
    expect(scoreCandidate(cand({ job_role: 'Manager', industry: 'Software' }), ['software'], synonyms)).not.toBeNull();
    expect(scoreCandidate(cand({ job_role: 'Plumber' }), ['software'], synonyms)).toBeNull();
  });

  test('matches accented and non-Latin text', () => {
    expect(scoreCandidate(cand({ job_role: 'Médecin généraliste' }), ['médecin'])).not.toBeNull();
    expect(scoreCandidate(cand({ industry: 'Zürich Finance' }), ['zürich'])).not.toBeNull();
  });

  test('is case-insensitive', () => {
    expect(scoreCandidate(cand({ industry: 'HEALTHCARE' }), ['healthcare'])).not.toBeNull();
  });
});

describe('pattern cache', () => {
  test('stays bounded however many distinct words are asked about', () => {
    const c = cand({ job_role: 'Designer' });
    for (let i = 0; i < MAX_PATTERN_CACHE * 3; i += 1) scoreCandidate(c, [`unique${i}word`]);
    expect(patternCacheSize()).toBeLessThanOrEqual(MAX_PATTERN_CACHE);
    // and matching still works after the cache has been cleared
    expect(scoreCandidate(c, ['design'])).not.toBeNull();
  });
});

describe('rankCandidates', () => {
  const terms = ['healthcare', 'design'];

  test('covering more of the question beats being in the inner circle', () => {
    const innerPartial = cand({ id: 1, name: 'Inner Partial', kind: 'inner', job_role: 'Designer', industry: 'Retail', strength: 4 });
    const secondaryFull = cand({
      id: 2,
      name: 'Secondary Full',
      job_role: 'Design Lead',
      industry: 'Healthcare',
      via: [10],
      primary_via: 10,
    });
    const ranked = rankCandidates([innerPartial, secondaryFull], terms, innerNames);
    expect(ranked.map((r) => r.id)).toEqual([2, 1]);
  });

  test('between equal matches an inner peer, then one with an introducer, comes first', () => {
    const base = { job_role: 'Design Lead', industry: 'Healthcare' };
    const edgeOnly = cand({ id: 1, name: 'Edge', ...base, direct: true });
    const viaOne = cand({ id: 2, name: 'Via', ...base, via: [10], primary_via: 10 });
    const inner = cand({ id: 3, name: 'Inner', ...base, kind: 'inner' });
    expect(rankCandidates([edgeOnly, viaOne, inner], terms, innerNames).map((r) => r.id)).toEqual([3, 2, 1]);
  });

  test('breaks exact ties by name then id, deterministically', () => {
    const a = cand({ id: 5, name: 'Zed', job_role: 'Designer' });
    const b = cand({ id: 4, name: 'Amy', job_role: 'Designer' });
    const c = cand({ id: 3, name: 'Amy', job_role: 'Designer' });
    expect(rankCandidates([a, b, c], ['design'], innerNames).map((r) => r.id)).toEqual([3, 4, 5]);
  });

  test('describes the path and the reason', () => {
    const [viaInner, inner, edge] = rankCandidates(
      [
        cand({ id: 1, name: 'A Via', job_role: 'Designer', via: [10, 11], primary_via: 10 }),
        cand({ id: 2, name: 'B Inner', job_role: 'Designer', kind: 'inner' }),
        cand({ id: 3, name: 'C Edge', job_role: 'Designer', direct: true }),
      ],
      ['design'],
      innerNames
    ).sort((x, y) => x.id - y.id);

    expect(viaInner.path).toEqual({ kind: 'via_inner', via: { id: 10, name: 'Henry Harris' } });
    expect(viaInner.reason).toBe('Matches design. Introduced through Henry Harris.');
    expect(inner.path).toEqual({ kind: 'direct_inner', via: null });
    expect(inner.reason).toBe('Matches design. In your inner circle.');
    expect(edge.path).toEqual({ kind: 'direct_edge_only', via: null });
    expect(edge.reason).toBe('Matches design. You have a direct link but no introducer.');
  });

  test('excludes non-matches, applies the limit option, and never returns bio text', () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      cand({ id: i + 1, name: `P${String(i).padStart(2, '0')}`, job_role: 'Designer', experience: 'SECRET BIO design' })
    );
    const ranked = rankCandidates([...many, cand({ id: 99, job_role: 'Plumber' })], ['design'], innerNames, { limit: 5 });
    expect(ranked).toHaveLength(5);
    expect(ranked.find((r) => r.id === 99)).toBeUndefined();
    const json = JSON.stringify(ranked);
    expect(json).not.toContain('SECRET BIO');
    expect(Object.keys(ranked[0])).not.toContain('experience');
  });
});
