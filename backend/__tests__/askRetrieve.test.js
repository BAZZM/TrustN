const { planLookups, buildCandidates, MAX_SEARCH_WORDS } = require('../lib/askRetrieve');

describe('planLookups', () => {
  test('looks up every term, then its synonyms, and maps each searched word back to its term', () => {
    const { words, groupOf } = planLookups(['software', 'design'], { software: ['engineer'] });
    expect(words).toEqual(['software', 'design', 'engineer']);
    expect(groupOf.get('engineer')).toBe('software');
    expect(groupOf.get('design')).toBe('design');
  });

  test('puts terms before synonyms and caps the number of lookups', () => {
    const terms = ['aaa', 'bbb', 'ccc', 'ddd', 'eee', 'fff'];
    const { words } = planLookups(terms, { aaa: ['zzz'] });
    expect(words).toHaveLength(MAX_SEARCH_WORDS);
    expect(words).toEqual(terms.slice(0, MAX_SEARCH_WORDS));
    expect(words).not.toContain('zzz');
  });

  test('does not look the same word up twice', () => {
    const { words } = planLookups(['design', 'legal'], { design: ['legal'] });
    expect(words).toEqual(['design', 'legal']);
  });

  test('handles no terms', () => {
    expect(planLookups([], {}).words).toEqual([]);
  });
});

describe('buildCandidates', () => {
  const connectionRows = [
    { circle_type: 'inner', peer_id: 10, peer_name: 'Henry Harris', peer_job_role: 'Accountant', peer_industry: 'Finance', peer_experience: 'bio h', strength: 3 },
    { circle_type: 'inner', peer_id: 11, peer_name: 'Bob Brown', peer_job_role: 'PM', peer_industry: 'Tech', peer_experience: 'bio b', strength: 1 },
    { circle_type: 'secondary', peer_id: 40, peer_name: 'Direct Secondary', strength: 1 },
  ];
  const row = (id, over = {}) => ({
    res_peer_id: id,
    res_peer_name: `P${id}`,
    res_peer_job_role: 'Role',
    res_peer_industry: 'Ind',
    res_peer_experience: 'bio',
    res_source_edge: false,
    res_via_inner_peer_ids: [],
    ...over,
  });

  test('turns inner connections into inner candidates and ignores stored secondary rows there', () => {
    const { candidates, innerNameById } = buildCandidates({
      viewerId: 1,
      connectionRows,
      secondaryByWord: [],
      groupOf: new Map(),
    });
    expect(candidates.map((c) => [c.id, c.kind])).toEqual([[10, 'inner'], [11, 'inner']]);
    expect(innerNameById.get(10)).toBe('Henry Harris');
  });

  test('merges a person found by several words, recording which terms hit', () => {
    const { candidates } = buildCandidates({
      viewerId: 1,
      connectionRows,
      secondaryByWord: [
        { word: 'software', rows: [row(50, { res_via_inner_peer_ids: [11, 10] })] },
        { word: 'engineer', rows: [row(50, { res_via_inner_peer_ids: [11, 10] }), row(51)] },
        { word: 'design', rows: [row(50, { res_via_inner_peer_ids: [10, 11] })] },
      ],
      groupOf: new Map([['software', 'software'], ['engineer', 'software'], ['design', 'design']]),
    });
    const p50 = candidates.find((c) => c.id === 50);
    expect(p50.kind).toBe('secondary');
    expect(p50.via).toEqual([10, 11]);
    expect(p50.primary_via).toBe(10); // strongest inner peer (strength 3)
    expect(p50.ftsTerms.sort()).toEqual(['design', 'software']); // synonym hit counted once for its term
    expect(candidates.find((c) => c.id === 51).ftsTerms).toEqual(['software']);
  });

  test('never lists the viewer or an inner peer as a secondary', () => {
    const { candidates } = buildCandidates({
      viewerId: 1,
      connectionRows,
      secondaryByWord: [{ word: 'x', rows: [row(1), row(10), row(52)] }],
      groupOf: new Map([['x', 'x']]),
    });
    expect(candidates.filter((c) => c.kind === 'secondary').map((c) => c.id)).toEqual([52]);
    expect(candidates.filter((c) => c.id === 10)).toHaveLength(1);
  });

  test('records a direct edge with no introducer', () => {
    const { candidates } = buildCandidates({
      viewerId: 1,
      connectionRows,
      secondaryByWord: [{ word: 'x', rows: [row(53, { res_source_edge: true })] }],
      groupOf: new Map([['x', 'x']]),
    });
    expect(candidates.find((c) => c.id === 53)).toMatchObject({ direct: true, via: [], primary_via: null });
  });
});
