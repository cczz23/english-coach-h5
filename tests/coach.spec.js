const { test, expect } = require('@playwright/test');

async function boot(page, init) {
  if (init) await page.addInitScript(init);
  await page.goto('/');
  await expect(page.getByTestId('term')).toBeVisible();
}

test('Stage A to B, mark, and next card', async ({ page }) => {
  await boot(page);
  await expect(page.getByTestId('stage')).toHaveText('STAGE A');
  await expect(page.getByTestId('gloss')).toHaveCount(0);
  await page.getByTestId('reveal').click();
  await expect(page.getByTestId('stage')).toHaveText('STAGE B');
  await expect(page.getByTestId('gloss')).toBeVisible();
  await page.getByTestId('weak').click();
  await expect(page.getByTestId('n-weak')).not.toHaveText('0');
  await expect(page.getByTestId('stage')).toHaveText('STAGE A');
  await expect(page.getByTestId('card-a')).toBeVisible();
});

test('undo restores the marked card', async ({ page }) => {
  await boot(page);
  const term = (await page.getByTestId('term').innerText()).replace('★', '').trim();
  await page.getByTestId('reveal').click();
  await page.getByTestId('drop').click();
  await expect(page.getByTestId('stage')).toHaveText('STAGE A');
  await page.getByTestId('undo').click();
  await expect(page.getByTestId('stage')).toHaveText('STAGE A');
  await expect(page.getByTestId('term')).toContainText(term);
  await expect(page.getByTestId('n-dropped')).toHaveText('0');
});

test('needed flag toggles the star and the counter', async ({ page }) => {
  await boot(page);
  await page.getByTestId('reveal').click();
  await page.getByTestId('needed').click();
  await expect(page.getByTestId('needed')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('needed-dot')).toBeVisible();
  await expect(page.getByTestId('n-needed')).toHaveText('1');
  await page.getByTestId('needed').click();
  await expect(page.getByTestId('needed')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('needed-dot')).toHaveCount(0);
  await expect(page.getByTestId('n-needed')).toHaveText('0');
});

test('review mode is empty until a weak or reinforce mark, then returns to 全部', async ({ page }) => {
  await boot(page);
  await page.getByTestId('mode-review').click();
  await expect(page.getByTestId('empty-review')).toBeVisible();
  await page.getByTestId('back-all').click();
  await expect(page.getByTestId('term')).toBeVisible();
  await page.getByTestId('reveal').click();
  await page.getByTestId('reinforce').click();
  await page.getByTestId('mode-review').click();
  await expect(page.getByTestId('term')).toBeVisible();
  const mode = await page.evaluate(() => window.__ec.mode);
  expect(mode).toBe('review');
  const id = await page.getByTestId('term').getAttribute('data-id');
  const status = await page.evaluate(wordId => window.__ec.state().items[wordId].status, id);
  expect(status).toBe('reinforce');
});

test('settings save CloudBase keys and do not echo the publishable key', async ({ page }) => {
  await page.route('https://chris-env.api.tcloudbasegateway.com/**', route => route.fulfill({
    status: 401, contentType: 'application/json', body: '{"code":"UNAUTHENTICATED"}'
  }));
  await boot(page);
  await page.getByTestId('settings-open').click();
  await expect(page.getByTestId('sync-hint')).toContainText('不用 VPN');
  await expect(page.getByTestId('sync-hint')).toContainText('ec_state');
  await expect(page.getByTestId('sync-hint')).toContainText('静态托管');
  await expect(page.getByTestId('sync-app-id')).toHaveCount(0);
  await page.getByTestId('sync-env').fill('chris-env');
  await page.getByTestId('sync-publishable').fill('secret-key');
  await page.getByTestId('sync-doc-id').fill('doc1');
  await page.getByTestId('sync-save').click();
  await expect(page.getByTestId('settings')).toBeHidden();
  const cfg = await page.evaluate(() => JSON.parse(localStorage.getItem('ec_tcb_v1')));
  expect(cfg).toEqual({ envId: 'chris-env', publishableKey: 'secret-key', docId: 'doc1' });
  await expect(page.locator('body')).not.toContainText('secret-key');
  await page.reload();
  await expect(page.getByTestId('term')).toBeVisible();
  await page.getByTestId('settings-open').click();
  await expect(page.getByTestId('sync-env')).toHaveValue('chris-env');
  await expect(page.getByTestId('sync-doc-id')).toHaveValue('doc1');
  await expect(page.getByTestId('sync-publishable')).toHaveValue('');
});

test('sync is skipped when unset', async ({ page }) => {
  let hits = 0;
  await page.route('https://**/**', route => {
    const url = route.request().url();
    if (/leancloud|lc-cn-n1|tcloudbasegateway|api\.github\.com/i.test(url)) hits += 1;
    return route.continue();
  });
  await boot(page);
  await page.getByTestId('reveal').click();
  await page.waitForTimeout(900);
  expect(hits).toBe(0);
});

test('mocked CloudBase GET merges weak count and a later mark PATCHes', async ({ page }) => {
  const remote = {
    v: 4,
    mode: 'all',
    items: { w001: { status: 'weak', seen: 3, needed: false, updated: 10 } },
    recent: [],
    log: [{ id: 'w001', term: 'circle back', action: 'weak', ts: 10, seen: 3 }],
    undo: []
  };
  const puts = [];
  await page.route('https://chris-env.api.tcloudbasegateway.com/**', async route => {
    const req = route.request();
    if (req.method() === 'PATCH') {
      puts.push(req.postData() || '');
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"data":{"updated":1}}' });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { _id: 'doc1', state: remote } })
    });
  });
  await page.addInitScript(() => {
    localStorage.setItem('ec_tcb_v1', JSON.stringify({
      envId: 'chris-env', publishableKey: 'secret-key', docId: 'doc1'
    }));
  });
  await page.goto('/');
  await expect(page.getByTestId('n-weak')).toHaveText('1');
  await expect(page.getByTestId('sync-status')).toHaveText('已同步', { timeout: 8000 });
  const before = puts.length;
  await page.getByTestId('mode-review').click();
  await expect.poll(() => puts.length, { timeout: 5000 }).toBeGreaterThan(before);
  const body = puts[puts.length - 1];
  expect(body).toContain('"mode":"review"');
  expect(body).toContain('"mix":1');
  expect(body).not.toContain('secret-key');
  await expect(page.getByTestId('sync-status')).toHaveText('已同步');
});

test('CloudBase GET Extended JSON still merges remote seen counts', async ({ page }) => {
  const remote = {
    v: { $numberInt: '4' },
    mode: 'all',
    items: {
      w001: {
        status: 'weak',
        seen: { $numberInt: '1' },
        needed: false,
        updated: { $numberLong: '10' }
      }
    },
    recent: [],
    log: [{ id: 'w001', term: 'circle back', action: 'weak', ts: { $numberLong: '10' }, seen: { $numberInt: '1' } }],
    undo: []
  };
  await page.route('https://chris-env.api.tcloudbasegateway.com/**', async route => {
    if (route.request().method() === 'PATCH') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"data":{"updated":1}}' });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { _id: 'doc1', state: remote } })
    });
  });
  await page.addInitScript(() => {
    localStorage.setItem('ec_tcb_v1', JSON.stringify({
      envId: 'chris-env', publishableKey: 'secret-key', docId: 'doc1'
    }));
  });
  await page.goto('/');
  await expect(page.getByTestId('n-weak')).toHaveText('1');
  await expect(page.getByTestId('sync-status')).toHaveText('已同步', { timeout: 8000 });
});

test('a real word shows one Stage A line and five Stage B scenes', async ({ page }) => {
  await boot(page);
  await expect(page.getByTestId('usage')).toHaveText(/^(说|读写)$/);
  await expect(page.getByTestId('examples-a').locator('li')).toHaveCount(1);
  await page.getByTestId('reveal').click();
  await expect(page.getByTestId('usage')).toHaveText(/^(说|读写)$/);
  await expect(page.getByTestId('examples-b').locator('li')).toHaveCount(5);
  const marked = await page.getByTestId('examples-b').locator('mark').count();
  expect(marked).toBeGreaterThan(0);
});

test('Stage A to B to marks still works when the word has contrast', async ({ page }) => {
  const word = {
    id: 'w206', term: 'pragmatic', pos: 'adj.', ipa: '/præɡˈmætɪk/',
    gloss_zh: '务实的', domain: 'both', track: 'advanced',
    examples_stage_a: ['Let\'s take a [[pragmatic]] approach.'],
    examples_stage_b: [
      'A [[pragmatic]] fix now beats a perfect one next year.',
      'She\'s idealistic but also very [[pragmatic]].'
    ],
    contrast: [
      { vs: 'practical', note_zh: '中文都像「务实」：practical 偏这办法用得上、好操作；pragmatic 偏不纠结理想，按现实约束选能落地的那条' },
      { vs: 'realistic', note_zh: 'realistic 偏看法是否贴近现实；pragmatic 偏行动' }
    ]
  };
  await page.route('**/words.json', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify([word])
  }));
  await page.goto('/');
  await expect(page.getByTestId('term')).toHaveText('pragmatic');
  await expect(page.getByTestId('stage')).toHaveText('STAGE A');
  await expect(page.getByTestId('contrast')).toHaveCount(0);
  await page.getByTestId('reveal').click();
  await expect(page.getByTestId('stage')).toHaveText('STAGE B');
  await expect(page.getByTestId('gloss')).toBeVisible();
  await expect(page.getByTestId('contrast')).toBeVisible();
  await expect(page.getByTestId('contrast')).toContainText('易混对比');
  await expect(page.getByTestId('contrast-list')).toContainText('vs practical');
  await expect(page.getByTestId('contrast-list')).toContainText('务实');
  await page.getByTestId('weak').click();
  await expect(page.getByTestId('n-weak')).toHaveText('1');
  await expect(page.getByTestId('stage')).toHaveText('STAGE A');
  await expect(page.getByTestId('card-a')).toBeVisible();
  await expect(page.getByTestId('contrast')).toHaveCount(0);
});

test('usage badge is on both stages; 想说时用 only for rw with alternatives', async ({ page }) => {
  const base = {
    pos: 'adj.', ipa: '/test/', gloss_zh: '释义', domain: 'both', track: 'advanced',
    examples_stage_a: ['A [[sample]] line.'],
    examples_stage_b: ['B [[sample]] line.']
  };
  await page.route('**/words.json', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify([
      { ...base, id: 'rw1', term: 'precarious', usage: 'rw', sayInstead: ['unstable', 'shaky'], contrast: [{ vs: 'dangerous', note_zh: '危险是会出事' }] },
      { ...base, id: 'sp1', term: 'pragmatic', usage: 'speak' }
    ])
  }));
  await page.goto('/');
  await expect(page.getByTestId('term')).toBeVisible();
  const term = (await page.getByTestId('term').innerText()).trim();
  if (term === 'precarious') {
    await expect(page.getByTestId('usage')).toHaveText('读写');
    await expect(page.getByTestId('say-instead')).toHaveCount(0);
    await page.getByTestId('reveal').click();
    await expect(page.getByTestId('usage')).toHaveText('读写');
    await expect(page.getByTestId('say-instead')).toHaveText('想说时用：unstable / shaky');
    await expect(page.getByTestId('contrast')).toBeVisible();
    await page.getByTestId('drop').click();
    await expect(page.getByTestId('term')).toHaveText('pragmatic');
    await expect(page.getByTestId('usage')).toHaveText('说');
    await page.getByTestId('reveal').click();
    await expect(page.getByTestId('say-instead')).toHaveCount(0);
  } else {
    await expect(page.getByTestId('term')).toHaveText('pragmatic');
    await expect(page.getByTestId('usage')).toHaveText('说');
    await expect(page.getByTestId('say-instead')).toHaveCount(0);
    await page.getByTestId('reveal').click();
    await expect(page.getByTestId('say-instead')).toHaveCount(0);
    await page.getByTestId('drop').click();
    await expect(page.getByTestId('term')).toHaveText('precarious');
    await expect(page.getByTestId('usage')).toHaveText('读写');
    await page.getByTestId('reveal').click();
    await expect(page.getByTestId('say-instead')).toHaveText('想说时用：unstable / shaky');
    await expect(page.getByTestId('contrast')).toContainText('vs dangerous');
  }
});

test('读写 with an empty sayInstead shows the badge and hides the line', async ({ page }) => {
  await page.route('**/words.json', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify([{
      id: 'rwempty', term: 'tenuous', pos: 'adj.', ipa: '/x/', gloss_zh: '微弱',
      domain: 'both', track: 'advanced', usage: 'rw', sayInstead: [],
      examples_stage_a: ['A [[tenuous]] line.'],
      examples_stage_b: ['B [[tenuous]] line.']
    }])
  }));
  await page.goto('/');
  await expect(page.getByTestId('usage')).toHaveText('读写');
  await page.getByTestId('reveal').click();
  await expect(page.getByTestId('usage')).toHaveText('读写');
  await expect(page.getByTestId('say-instead')).toHaveCount(0);
  await expect(page.getByTestId('gloss')).toHaveText('微弱');
});

test('contrast block is hidden when the field is missing or empty', async ({ page }) => {
  const base = {
    pos: 'n.', ipa: '/kæp/', gloss_zh: '上限', domain: 'life', track: 'life',
    examples_stage_a: ['One [[cap]] line.'],
    examples_stage_b: ['Stage B [[cap]] line.']
  };
  await page.route('**/words.json', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify([{ ...base, id: 'wnone', term: 'no contrast' }])
  }));
  await page.goto('/');
  await page.getByTestId('reveal').click();
  await expect(page.getByTestId('gloss')).toBeVisible();
  await expect(page.getByTestId('contrast')).toHaveCount(0);

  await page.unroute('**/words.json');
  await page.route('**/words.json', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify([{ ...base, id: 'wempty', term: 'empty contrast', contrast: [] }])
  }));
  await page.goto('/');
  await page.getByTestId('reveal').click();
  await expect(page.getByTestId('contrast')).toHaveCount(0);
});

test('stage B shows at most 5 examples and keeps a shorter list intact', async ({ page }) => {
  const base = {
    pos: 'n.', ipa: '/kæp/', gloss_zh: '上限', domain: 'life', track: 'life',
    examples_stage_a: ['One [[cap check]] line.', 'Second stage A [[cap check]] line.']
  };
  const long = {
    ...base, id: 'wlong', term: 'cap check',
    examples_stage_b: [1, 2, 3, 4, 5, 6].map(n => `Example ${n} for [[cap check]].`)
  };
  await page.route('**/words.json', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify([long])
  }));
  await page.goto('/');
  await expect(page.getByTestId('examples-a').locator('li')).toHaveCount(2);
  await page.getByTestId('reveal').click();
  await expect(page.getByTestId('examples-b').locator('li')).toHaveCount(5);
  await expect(page.getByTestId('examples-b')).toContainText('Example 5');
  await expect(page.getByTestId('examples-b')).not.toContainText('Example 6');

  const short = {
    ...base, id: 'wshort', term: 'short check',
    examples_stage_b: [1, 2, 3].map(n => `Short ${n} for [[short check]].`)
  };
  await page.unroute('**/words.json');
  await page.route('**/words.json', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify([short])
  }));
  await page.goto('/');
  await page.getByTestId('reveal').click();
  await expect(page.getByTestId('examples-b').locator('li')).toHaveCount(3);
  await expect(page.getByTestId('examples-b')).toContainText('Short 3');
});

test('failed create names the HTTP status and keeps the publishable key', async ({ page }) => {
  await page.route('https://chris-env.api.tcloudbasegateway.com/**', route => route.fulfill({
    status: 401,
    contentType: 'application/json',
    body: '{"code":"UNAUTHENTICATED"}'
  }));
  await boot(page);
  await page.getByTestId('settings-open').click();
  await page.getByTestId('sync-env').fill('chris-env');
  await page.getByTestId('sync-publishable').fill('secret-key');
  await page.getByTestId('sync-create').click();
  await expect(page.getByTestId('sync-status')).toHaveText('同步失败 · 401');
  await expect(page.getByTestId('sync-status-panel')).toHaveText('同步失败 · 401');
  await expect(page.getByTestId('settings')).toBeVisible();
  await expect(page.getByTestId('sync-publishable')).toHaveValue('secret-key');
  await expect(page.getByTestId('sync-doc-id')).toHaveValue('');
  await expect(page.getByTestId('sync-create')).toBeEnabled();
  await expect(page.getByTestId('sync-create')).toHaveText('创建或绑定');
});

test('create with empty keys asks for them', async ({ page }) => {
  await boot(page);
  await page.getByTestId('settings-open').click();
  await page.getByTestId('sync-create').click();
  await expect(page.getByTestId('sync-status')).toHaveText('请先填写环境 ID 和 Publishable Key');
  await expect(page.getByTestId('settings')).toBeVisible();
});

test('create cloud record stores the returned doc id', async ({ page }) => {
  await page.route('https://chris-env.api.tcloudbasegateway.com/**', async route => {
    const body = JSON.parse(route.request().postData() || '{}');
    expect(body.data[0].state.v).toBe(4);
    expect(route.request().method()).toBe('POST');
    expect(route.request().headers()['authorization']).toBe('Bearer secret-key');
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ data: { insertedIds: ['created99'] } })
    });
  });
  await boot(page);
  await page.getByTestId('settings-open').click();
  await page.getByTestId('sync-env').fill('chris-env');
  await page.getByTestId('sync-publishable').fill('secret-key');
  await page.getByTestId('sync-create').click();
  await expect(page.getByTestId('sync-doc-id')).toHaveValue('created99');
  await expect(page.getByTestId('sync-status')).toHaveText('已同步');
  const cfg = await page.evaluate(() => JSON.parse(localStorage.getItem('ec_tcb_v1')));
  expect(cfg.docId).toBe('created99');
  expect(cfg.publishableKey).toBe('secret-key');
  expect(await page.locator('body').innerText()).not.toContain('secret-key');
});

async function setMixPct(page, pct) {
  await page.getByTestId('mix').evaluate((el, v) => {
    el.value = String(v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, pct);
}

test('mix slider persists on ec_state_v4 and snaps 新词 / 复习', async ({ page }) => {
  await boot(page);
  await expect(page.getByTestId('mix')).toHaveValue('50');
  await setMixPct(page, 0);
  await expect(page.getByTestId('mode-new')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('mix-label')).toContainText('新词 100%');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('ec_state_v4')));
  expect(stored.mix).toBe(0);
  expect(stored.mode).toBe('all');
  await page.reload();
  await expect(page.getByTestId('term')).toBeVisible();
  await expect(page.getByTestId('mix')).toHaveValue('0');
  await page.getByTestId('mode-review').click();
  await expect(page.getByTestId('empty-review')).toBeVisible();
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('ec_state_v4')));
  expect(after.mix).toBe(1);
  expect(after.mode).toBe('review');
});

test('stubbed RNG follows slider mix: 0 is new-only, 1 is review-only', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('ec_state_v4', JSON.stringify({
      v: 4, mode: 'all', mix: 0.5,
      items: {
        w001: { status: 'weak', seen: 2, needed: false, updated: 1 },
        w003: { status: 'reinforce', seen: 1, needed: false, updated: 1 }
      },
      recent: [], log: [], undo: []
    }));
  });
  await page.goto('/');
  await expect(page.getByTestId('n-weak')).toHaveText('1');
  const draws = await page.evaluate(() => {
    const s = window.__ec.state();
    const sample = mix => {
      s.mix = mix;
      s.mode = mix >= 1 ? 'review' : 'all';
      window.__ec.rng = () => 0.99;
      const out = [];
      for (let i = 0; i < 12; i++) {
        const w = window.__ec.pickNext();
        out.push(w ? ((s.items[w.id] || {}).status ?? null) : null);
      }
      return out;
    };
    return { fresh: sample(0), review: sample(1) };
  });
  expect(draws.fresh.every(st => st == null)).toBe(true);
  expect(draws.review.every(st => st === 'weak' || st === 'reinforce')).toBe(true);
});

test('生疏列表 is empty, then groups 还不熟 / 再巩固 and opens that card', async ({ page }) => {
  await boot(page);
  await page.getByTestId('weak-list-open').click();
  await expect(page.getByTestId('weak-list')).toBeVisible();
  await expect(page.getByTestId('weak-list-empty')).toBeVisible();
  await page.getByTestId('weak-list-close').click();
  await expect(page.getByTestId('weak-list')).toBeHidden();

  await page.addInitScript(() => {
    localStorage.setItem('ec_state_v4', JSON.stringify({
      v: 4, mode: 'all', mix: 0.5,
      items: {
        w001: { status: 'weak', seen: 2, needed: true, updated: 1 },
        w003: { status: 'reinforce', seen: 1, needed: false, updated: 1 },
        w004: { status: 'dropped', seen: 1, needed: true, updated: 1 }
      },
      recent: [], log: [], undo: []
    }));
  });
  await page.goto('/');
  await expect(page.getByTestId('n-weak')).toHaveText('1');
  await expect(page.getByTestId('n-reinforce')).toHaveText('1');
  await page.getByTestId('weak-list-open').click();
  await expect(page.getByTestId('weak-group-weak')).toHaveText('还不熟');
  await expect(page.getByTestId('weak-group-reinforce')).toHaveText('再巩固');
  await expect(page.getByTestId('weak-row')).toHaveCount(2);
  await expect(page.getByTestId('weak-list')).toContainText('circle back');
  await expect(page.getByTestId('weak-list')).toContainText('take it offline');
  await expect(page.getByTestId('weak-list')).toContainText('回头');
  await expect(page.locator('[data-testid=weak-row][data-id=w001]')).toContainText('★');
  await expect(page.locator('[data-testid=weak-row][data-id=w001] [data-testid=weak-usage]')).toHaveText('说');
  await expect(page.locator('[data-testid=weak-row][data-id=w003] [data-testid=weak-usage]')).toHaveText('说');
  await expect(page.getByTestId('weak-list')).not.toContainText('push back');
  await page.locator('[data-testid=weak-row][data-id=w001]').click();
  await expect(page.getByTestId('weak-list')).toBeHidden();
  await expect(page.getByTestId('term')).toContainText('circle back');
  await expect(page.getByTestId('stage')).toHaveText('STAGE A');
  await expect(page.getByTestId('card-a')).toBeVisible();
});

function seedSleepingList() {
  return () => {
    localStorage.setItem('ec_state_v4', JSON.stringify({
      v: 4, mode: 'all', mix: 0.5,
      items: {
        w293: { status: 'dropped', seen: 3, needed: true, updated: 1 },
        w338: { status: 'dropped', seen: 3, needed: false, updated: 1 },
        w208: { status: 'dropped', seen: 3, needed: false, updated: 1 },
        w209: { status: 'dropped', seen: 2, needed: true, updated: 1 },
        w226: { status: 'dropped', seen: 2, needed: true, updated: 1 },
        w235: { status: 'dropped', seen: 1, needed: true, updated: 1 }
      },
      recent: [],
      log: [
        { id: 'w293', term: 'secular', action: 'reinforce', ts: 1, seen: 1 },
        { id: 'w293', term: 'secular', action: 'reinforce', ts: 2, seen: 2 },
        { id: 'w293', term: 'secular', action: 'drop', ts: 3, seen: 3 },
        { id: 'w338', term: 'directional', action: 'reinforce', ts: 1, seen: 2 },
        { id: 'w338', term: 'directional', action: 'drop', ts: 2, seen: 3 },
        { id: 'w208', term: 'tenuous', action: 'reinforce', ts: 1, seen: 2 },
        { id: 'w208', term: 'tenuous', action: 'drop', ts: 2, seen: 3 },
        { id: 'w209', term: 'inherent', action: 'reinforce', ts: 1, seen: 1 },
        { id: 'w209', term: 'inherent', action: 'drop', ts: 2, seen: 2 },
        { id: 'w226', term: 'unprecedented', action: 'needed_on', ts: 1, seen: 2 },
        { id: 'w226', term: 'unprecedented', action: 'drop', ts: 2, seen: 2 },
        { id: 'w235', term: 'advocate', action: 'needed_on', ts: 1, seen: 1 },
        { id: 'w235', term: 'advocate', action: 'drop', ts: 2, seen: 1 }
      ],
      undo: []
    }));
  };
}

test('沉睡清单 is empty until a struggled word is dropped', async ({ page }) => {
  await boot(page);
  await expect(page.getByTestId('sleep-list-open')).toBeVisible();
  await expect(page.getByTestId('sleep-list-open')).toHaveText('沉睡清单');
  await page.getByTestId('sleep-list-open').click();
  await expect(page.getByTestId('sleep-list')).toBeVisible();
  await expect(page.getByTestId('sleep-list-hint')).toHaveText('看过多次后再放掉的词，偶尔拿出来复习。');
  await expect(page.getByTestId('sleep-list-empty')).toBeVisible();
  await page.getByTestId('sleep-list-close').click();
  await expect(page.getByTestId('sleep-list')).toBeHidden();
});

test('沉睡清单 shows struggled-then-dropped words and opens that card', async ({ page }) => {
  await page.addInitScript(seedSleepingList());
  await page.goto('/');
  await expect(page.getByTestId('term')).toBeVisible();
  await page.getByTestId('mode-review').click();
  await expect(page.getByTestId('empty-review')).toBeVisible();
  await page.getByTestId('back-all').click();
  await expect(page.getByTestId('term')).toBeVisible();

  await page.getByTestId('sleep-list-open').click();
  await expect(page.getByTestId('sleep-list')).toBeVisible();
  await expect(page.getByTestId('sleep-row')).toHaveCount(4);
  const ids = await page.getByTestId('sleep-row').evaluateAll(rows => rows.map(r => r.getAttribute('data-id')));
  expect(ids).toEqual(['w338', 'w209', 'w293', 'w208']);
  await expect(page.getByTestId('sleep-list')).toContainText('directional');
  await expect(page.getByTestId('sleep-list')).toContainText('inherent');
  await expect(page.getByTestId('sleep-list')).toContainText('secular');
  await expect(page.getByTestId('sleep-list')).toContainText('tenuous');
  await expect(page.getByTestId('sleep-list')).not.toContainText('unprecedented');
  await expect(page.getByTestId('sleep-list')).not.toContainText('advocate');
  await expect(page.locator('[data-testid=sleep-row][data-id=w293]')).toContainText('★');
  await expect(page.locator('[data-testid=sleep-row][data-id=w209]')).toContainText('★');
  await expect(page.locator('[data-testid=sleep-row][data-id=w338]')).not.toContainText('★');
  await expect(page.locator('[data-testid=sleep-row][data-id=w293] [data-testid=sleep-usage]')).toHaveText('说');
  await expect(page.locator('[data-testid=sleep-row][data-id=w208] [data-testid=sleep-usage]')).toHaveText('读写');
  await expect(page.locator('[data-testid=sleep-row][data-id=w209] [data-testid=sleep-usage]')).toHaveText('读写');

  await page.locator('[data-testid=sleep-row][data-id=w293]').click();
  await expect(page.getByTestId('sleep-list')).toBeHidden();
  await expect(page.getByTestId('term')).toContainText('secular');
  await expect(page.getByTestId('stage')).toHaveText('STAGE A');
  await expect(page.getByTestId('needed-dot')).toBeVisible();
  await expect(page.getByTestId('card-a')).toBeVisible();
});

test('还不熟 leaves 沉睡清单 for 生疏列表; 先放掉 stays; undo restores', async ({ page }) => {
  await page.addInitScript(seedSleepingList());
  await page.goto('/');
  await expect(page.getByTestId('term')).toBeVisible();
  await page.getByTestId('sleep-list-open').click();
  await page.locator('[data-testid=sleep-row][data-id=w293]').click();
  await page.getByTestId('reveal').click();
  await expect(page.getByTestId('stage')).toHaveText('STAGE B');
  await page.getByTestId('weak').click();
  await expect(page.getByTestId('n-weak')).toHaveText('1');

  await page.getByTestId('sleep-list-open').click();
  await expect(page.getByTestId('sleep-row')).toHaveCount(3);
  await expect(page.getByTestId('sleep-list')).not.toContainText('secular');
  await page.getByTestId('sleep-list-close').click();

  await page.getByTestId('weak-list-open').click();
  await expect(page.locator('[data-testid=weak-row][data-id=w293]')).toContainText('secular');
  await expect(page.locator('[data-testid=weak-row][data-id=w293]')).toContainText('★');
  await page.getByTestId('weak-list-close').click();

  await page.getByTestId('undo').click();
  await expect(page.getByTestId('term')).toContainText('secular');
  await expect(page.getByTestId('n-weak')).toHaveText('0');
  await expect(page.getByTestId('needed-dot')).toBeVisible();
  await page.getByTestId('sleep-list-open').click();
  await expect(page.getByTestId('sleep-row')).toHaveCount(4);
  await expect(page.locator('[data-testid=sleep-row][data-id=w293]')).toBeVisible();
  await page.getByTestId('sleep-list-close').click();
  await page.getByTestId('weak-list-open').click();
  await expect(page.getByTestId('weak-list-empty')).toBeVisible();
  await page.getByTestId('weak-list-close').click();

  await page.getByTestId('sleep-list-open').click();
  await page.locator('[data-testid=sleep-row][data-id=w208]').click();
  await expect(page.getByTestId('term')).toContainText('tenuous');
  await page.getByTestId('reveal').click();
  await expect(page.getByTestId('say-instead')).toContainText('weak / thin');
  await expect(page.getByTestId('contrast')).toBeVisible();
  await page.getByTestId('drop').click();
  await page.getByTestId('sleep-list-open').click();
  await expect(page.getByTestId('sleep-row')).toHaveCount(4);
  await expect(page.locator('[data-testid=sleep-row][data-id=w208]')).toContainText('tenuous');
  await expect(page.locator('[data-testid=sleep-row][data-id=w208] [data-testid=sleep-usage]')).toHaveText('读写');
});

