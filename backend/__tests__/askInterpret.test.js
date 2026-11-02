const { interpret, interpretRules, validateTerms, stem, MAX_TERMS } = require('../lib/askInterpret');

describe('interpretRules', () => {
  test('drops question words and keeps the meaningful terms in order', () => {
    const { mode, terms } = interpretRules('Who do I know in healthcare who has led a design team?');
    expect(mode).toBe('rules');
    expect(terms).toEqual(['healthcare', 'led', 'design', 'team']);
  });

  test('keeps free words as written (Postgres stems them itself)', () => {
    expect(interpretRules('designers').terms).toEqual(['designers']);
    expect(interpretRules('a painter').terms).toEqual(['painter']);
    expect(interpretRules('anyone managing budgets').terms).toEqual(['managing', 'budgets']);
  });

  test('adds a synonym next to the word the user typed instead of replacing it', () => {
    expect(interpretRules('any doctors?')).toMatchObject({ terms: ['doctors'], synonyms: { doctors: ['healthcare'] } });
    expect(interpretRules('a lawyer')).toMatchObject({ terms: ['lawyer'], synonyms: { lawyer: ['legal'] } });
    expect(interpretRules('software')).toMatchObject({ terms: ['software'], synonyms: { software: ['engineer'] } });
    expect(interpretRules('design')).toMatchObject({ terms: ['design'], synonyms: {} });
  });

  test('keeps accented and non-Latin words whole instead of shredding them', () => {
    expect(interpretRules('médecin à Zürich').terms).toEqual(['médecin', 'zürich']);
    expect(interpretRules('日本の医者').terms).toEqual(['日本の医者']);
    expect(interpretRules('Müller, Ärztin').terms).toEqual(['müller', 'ärztin']);
  });

  test('de-duplicates, ignores short tokens and punctuation, and caps the term count', () => {
    expect(interpretRules('design Design DESIGN!!').terms).toEqual(['design']);
    expect(interpretRules('an ox at it').terms).toEqual([]);
    const many = interpretRules('alpha bravo charlie delta echo foxtrot golf hotel india').terms;
    expect(many).toHaveLength(MAX_TERMS);
  });

  test('handles empty and non-string input', () => {
    expect(interpretRules('').terms).toEqual([]);
    expect(interpretRules(undefined).terms).toEqual([]);
    expect(interpretRules(null).terms).toEqual([]);
  });
});

describe('stem', () => {
  test('is a light stemmer for matching', () => {
    expect(stem('designers')).toBe('design');
    expect(stem('managing')).toBe('manag');
    expect(stem('budgets')).toBe('budget');
    expect(stem('companies')).toBe('company');
    expect(stem('glass')).toBe('glass');
    expect(stem('led')).toBe('led');
  });
});

describe('validateTerms', () => {
  test('accepts short lowercase plain-letter terms, including accented letters', () => {
    expect(validateTerms(['Healthcare', 'design'])).toEqual(['healthcare', 'design']);
    expect(validateTerms(['médecin'])).toEqual(['médecin']);
  });

  test.each([
    ['non-array', 'healthcare'],
    ['empty', []],
    ['too many', ['aaa', 'bbb', 'ccc', 'ddd', 'eee', 'fff', 'ggg']],
    ['non-string member', ['design', 3]],
    ['digits or punctuation', ['design;drop']],
    ['too short', ['ab']],
    ['too long', ['a'.repeat(33)]],
  ])('rejects %s', (_label, value) => {
    expect(validateTerms(value)).toBeNull();
  });
});

describe('interpret', () => {
  const llmReply = (text) => ({ ok: true, json: async () => ({ content: [{ text }] }) });

  test('uses rules and never calls the network by default', async () => {
    const fetchImpl = jest.fn();
    const result = await interpret('healthcare design', { env: {}, fetchImpl });
    expect(result.mode).toBe('rules');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('does not call the model without a key even when ASK_LLM=1', async () => {
    const fetchImpl = jest.fn();
    const result = await interpret('healthcare', { env: { ASK_LLM: '1' }, fetchImpl });
    expect(result.mode).toBe('rules');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('does not call the model with a key unless ASK_LLM=1', async () => {
    const fetchImpl = jest.fn();
    await interpret('healthcare', { env: { ANTHROPIC_API_KEY: 'k' }, fetchImpl });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('uses validated model terms when enabled, sending only the question', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(llmReply('{"terms":["Healthcare","design"]}'));
    const result = await interpret('who knows about hospital design', {
      env: { ASK_LLM: '1', ANTHROPIC_API_KEY: 'secret' },
      fetchImpl,
    });
    expect(result).toEqual({ mode: 'llm', terms: ['healthcare', 'design'], synonyms: {} });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.headers['x-api-key']).toBe('secret');
    const body = JSON.parse(init.body);
    expect(body.messages).toEqual([{ role: 'user', content: 'who knows about hospital design' }]);
  });

  test('falls back to rules on invalid model output', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(llmReply('{"terms":["ok; DROP TABLE users"]}'));
    const result = await interpret('healthcare design', {
      env: { ASK_LLM: '1', ANTHROPIC_API_KEY: 'k' },
      fetchImpl,
    });
    expect(result).toEqual({ mode: 'rules', terms: ['healthcare', 'design'], synonyms: {} });
  });

  test('falls back to rules on unparsable output, HTTP errors and thrown errors', async () => {
    const env = { ASK_LLM: '1', ANTHROPIC_API_KEY: 'k' };
    const bad = [
      jest.fn().mockResolvedValue(llmReply('not json')),
      jest.fn().mockResolvedValue({ ok: false, json: async () => ({}) }),
      jest.fn().mockRejectedValue(new Error('network down')),
    ];
    for (const fetchImpl of bad) {
      // eslint-disable-next-line no-await-in-loop
      const result = await interpret('healthcare', { env, fetchImpl });
      expect(result).toEqual({ mode: 'rules', terms: ['healthcare'], synonyms: {} });
    }
  });
});
