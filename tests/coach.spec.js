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

test('settings save LeanCloud keys and do not echo the app key', async ({ page }) => {
  await page.route('https://lc.test/**', route => route.fulfill({
    status: 401, contentType: 'application/json', body: '{"code":401,"error":"bad"}'
  }));
  await boot(page);
  await page.getByTestId('settings-open').click();
  await expect(page.getByTestId('sync-hint')).toContainText('不用 VPN');
  await expect(page.getByTestId('sync-hint')).toContainText('ECState');
  await page.getByTestId('sync-app-id').fill('abcdefgh');
  await page.getByTestId('sync-app-key').fill('secret-key');
  await page.getByTestId('sync-server').fill('https://lc.test');
  await page.getByTestId('sync-object-id').fill('obj1');
  await page.getByTestId('sync-save').click();
  await expect(page.getByTestId('settings')).toBeHidden();
  const cfg = await page.evaluate(() => JSON.parse(localStorage.getItem('ec_lc_v1')));
  expect(cfg).toEqual({ appId: 'abcdefgh', appKey: 'secret-key', serverURL: 'https://lc.test', objectId: 'obj1' });
  await expect(page.locator('body')).not.toContainText('secret-key');
  await page.reload();
  await expect(page.getByTestId('term')).toBeVisible();
  await page.getByTestId('settings-open').click();
  await expect(page.getByTestId('sync-app-id')).toHaveValue('abcdefgh');
  await expect(page.getByTestId('sync-object-id')).toHaveValue('obj1');
  await expect(page.getByTestId('sync-app-key')).toHaveValue('');
});

test('sync is skipped when unset', async ({ page }) => {
  let hits = 0;
  await page.route('https://**/**', route => {
    const url = route.request().url();
    if (/leancloud|lc-cn-n1|lc\.test|api\.github\.com/i.test(url)) hits += 1;
    return route.continue();
  });
  await boot(page);
  await page.getByTestId('reveal').click();
  await page.waitForTimeout(900);
  expect(hits).toBe(0);
});

test('mocked LeanCloud GET merges weak count and a later mark PUTs', async ({ page }) => {
  const remote = {
    v: 4,
    mode: 'all',
    items: { w001: { status: 'weak', seen: 3, needed: false, updated: 10 } },
    recent: [],
    log: [{ id: 'w001', term: 'circle back', action: 'weak', ts: 10, seen: 3 }],
    undo: []
  };
  const puts = [];
  await page.route('https://lc.test/**', async route => {
    const req = route.request();
    if (req.method() === 'PUT') {
      puts.push(req.postData() || '');
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ objectId: 'obj1', state: remote })
    });
  });
  await page.addInitScript(() => {
    localStorage.setItem('ec_lc_v1', JSON.stringify({
      appId: 'abcdefgh', appKey: 'secret-key', serverURL: 'https://lc.test', objectId: 'obj1'
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
  expect(body).not.toContain('secret-key');
  await expect(page.getByTestId('sync-status')).toHaveText('已同步');
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

test('failed create names the HTTP status and keeps the app key', async ({ page }) => {
  await page.route('https://lc.test/**', route => route.fulfill({
    status: 401,
    contentType: 'application/json',
    body: '{"code":401,"error":"Unauthorized."}'
  }));
  await boot(page);
  await page.getByTestId('settings-open').click();
  await page.getByTestId('sync-app-id').fill('abcdefgh');
  await page.getByTestId('sync-app-key').fill('secret-key');
  await page.getByTestId('sync-server').fill('https://lc.test');
  await page.getByTestId('sync-create').click();
  await expect(page.getByTestId('sync-status')).toHaveText('同步失败 · 401');
  await expect(page.getByTestId('sync-status-panel')).toHaveText('同步失败 · 401');
  await expect(page.getByTestId('settings')).toBeVisible();
  await expect(page.getByTestId('sync-app-key')).toHaveValue('secret-key');
  await expect(page.getByTestId('sync-object-id')).toHaveValue('');
  await expect(page.getByTestId('sync-create')).toBeEnabled();
  await expect(page.getByTestId('sync-create')).toHaveText('创建云端记录');
});

test('create with empty keys asks for them', async ({ page }) => {
  await boot(page);
  await page.getByTestId('settings-open').click();
  await page.getByTestId('sync-create').click();
  await expect(page.getByTestId('sync-status')).toHaveText('请先填写 App ID 和 App Key');
  await expect(page.getByTestId('settings')).toBeVisible();
});

test('create cloud record stores the returned objectId', async ({ page }) => {
  await page.route('https://lc.test/**', async route => {
    const body = JSON.parse(route.request().postData() || '{}');
    expect(body.state.v).toBe(4);
    expect(route.request().method()).toBe('POST');
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ objectId: 'created99' }) });
  });
  await boot(page);
  await page.getByTestId('settings-open').click();
  await page.getByTestId('sync-app-id').fill('abcdefgh');
  await page.getByTestId('sync-app-key').fill('secret-key');
  await page.getByTestId('sync-server').fill('https://lc.test');
  await page.getByTestId('sync-create').click();
  await expect(page.getByTestId('sync-object-id')).toHaveValue('created99');
  await expect(page.getByTestId('sync-status')).toHaveText('已同步');
  const cfg = await page.evaluate(() => JSON.parse(localStorage.getItem('ec_lc_v1')));
  expect(cfg.objectId).toBe('created99');
  expect(cfg.appKey).toBe('secret-key');
  expect(await page.locator('body').innerText()).not.toContain('secret-key');
});
