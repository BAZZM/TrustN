const { shapeInner, shapeSecondary, pickPrimaryVia } = require('../lib/graphPayload');

const secondaryRow = (over = {}) => ({
  res_peer_id: 35,
  res_peer_phone: '+1000000027',
  res_peer_name: 'Adam Adams',
  res_peer_job_role: 'Engineering Manager',
  res_peer_industry: 'Technology',
  res_peer_experience: 'secret bio',
  res_source_edge: false,
  res_via_inner_peer_ids: [],
  res_search_rank: null,
  ...over,
});

describe('pickPrimaryVia', () => {
  const strength = new Map([
    [14, 2],
    [15, 4],
    [16, 4],
  ]);

  test('prefers the strongest inner peer', () => {
    expect(pickPrimaryVia([14, 15], strength)).toBe(15);
  });

  test('breaks strength ties by lowest id', () => {
    expect(pickPrimaryVia([16, 15], strength)).toBe(15);
  });

  test('is null with no introducers', () => {
    expect(pickPrimaryVia([], strength)).toBeNull();
    expect(pickPrimaryVia(undefined, strength)).toBeNull();
  });

  test('treats unknown strength as 0 and still picks deterministically', () => {
    expect(pickPrimaryVia([9, 3], new Map())).toBe(3);
  });
});

describe('shapeSecondary', () => {
  test('exposes direct and via independently', () => {
    const [edgeOnly, discoveryOnly, both] = shapeSecondary(
      [
        secondaryRow({ res_peer_id: 1, res_source_edge: true, res_via_inner_peer_ids: [] }),
        secondaryRow({ res_peer_id: 2, res_source_edge: false, res_via_inner_peer_ids: [14] }),
        secondaryRow({ res_peer_id: 3, res_source_edge: true, res_via_inner_peer_ids: [14, 15] }),
      ],
      new Map([[14, 1], [15, 3]])
    );
    expect(edgeOnly).toMatchObject({ direct: true, via: [], primary_via: null });
    expect(discoveryOnly).toMatchObject({ direct: false, via: [14], primary_via: 14 });
    expect(both).toMatchObject({ direct: true, via: [14, 15], primary_via: 15 });
  });

  test('de-duplicates and sorts via, and drops nulls', () => {
    const [row] = shapeSecondary([secondaryRow({ res_via_inner_peer_ids: [16, null, 14, 16, '15'] })], new Map());
    expect(row.via).toEqual([14, 15, 16]);
  });

  test('never carries phone or bio text', () => {
    const [row] = shapeSecondary([secondaryRow()], new Map());
    const keys = Object.keys(row);
    expect(keys).not.toContain('phone');
    expect(keys).not.toContain('peer_phone');
    expect(keys).not.toContain('experience');
    expect(JSON.stringify(row)).not.toContain('secret bio');
    expect(JSON.stringify(row)).not.toContain('+1000000027');
  });
});

describe('shapeInner', () => {
  const rows = [
    {
      circle_type: 'inner',
      peer_id: 9,
      peer_name: 'Alice',
      peer_job_role: 'Engineer',
      peer_industry: 'Tech',
      peer_phone: '+1000000001',
      peer_experience: 'secret bio',
      strength: 2,
      peer_introduced: true,
      created_at: '2026-05-17T00:00:00.000Z',
    },
    { circle_type: 'secondary', peer_id: 40, peer_name: 'Direct Secondary', strength: 1 },
  ];

  test('keeps only inner rows and maps introduced', () => {
    const inner = shapeInner(rows);
    expect(inner).toHaveLength(1);
    expect(inner[0]).toMatchObject({ id: 9, name: 'Alice', strength: 2, introduced: true });
  });

  test('never carries phone or bio text', () => {
    const json = JSON.stringify(shapeInner(rows));
    expect(json).not.toContain('+1000000001');
    expect(json).not.toContain('secret bio');
  });
});
