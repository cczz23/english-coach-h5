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

test('settings save the token and gist id, and echo neither into the page', async ({ page }) => {
  await page.route('https://api.github.com/**', route => route.fulfill({
    status: 401, contentType: 'application/json', body: '{"message":"bad"}'
  }));
  await boot(page);
  await page.getByTestId('settings-open').click();
  await expect(page.getByTestId('sync-hint')).toContainText('token 只勾 gist；不要用账号密码；仅自己设备用。');
  await expect(page.getByTestId('sync-hint')).toContainText('english-coach-state.json');
  await page.getByTestId('sync-token').fill('ghp_example');
  await page.getByTestId('sync-gist').fill('gist123');
  await page.getByTestId('sync-save').click();
  await expect(page.getByTestId('settings')).toBeHidden();
  const cfg = await page.evaluate(() => JSON.parse(localStorage.getItem('ec_sync_v1')));
  expect(cfg).toEqual({ token: 'ghp_example', gistId: 'gist123' });
  await expect(page.locator('body')).not.toContainText('ghp_example');
  await page.reload();
  await expect(page.getByTestId('term')).toBeVisible();
  await page.getByTestId('settings-open').click();
  await expect(page.getByTestId('sync-gist')).toHaveValue('gist123');
  await expect(page.getByTestId('sync-token')).toHaveValue('');
});

test('sync is skipped when unset', async ({ page }) => {
  let hits = 0;
  await page.route('https://api.github.com/**', () => { hits += 1; });
  await boot(page);
  await page.getByTestId('reveal').click();
  await page.waitForTimeout(900);
  expect(hits).toBe(0);
});

test('mocked gist GET merges weak count and a later mark PATCHes', async ({ page }) => {
  const remote = {
    v: 4,
    mode: 'all',
    items: { w001: { status: 'weak', seen: 3, needed: false, updated: 10 } },
    recent: [],
    log: [{ id: 'w001', term: 'circle back', action: 'weak', ts: 10, seen: 3 }],
    undo: []
  };
  const patches = [];
  await page.route('https://api.github.com/**', async route => {
    const req = route.request();
    if (req.method() === 'PATCH') {
      patches.push(req.postData() || '');
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ files: { 'english-coach-state.json': { content: JSON.stringify(remote) } } })
    });
  });
  await page.addInitScript(() => {
    localStorage.setItem('ec_sync_v1', JSON.stringify({ token: 'ghp_example', gistId: 'gist123' }));
  });
  await page.goto('/');
  await expect(page.getByTestId('n-weak')).toHaveText('1');
  await expect(page.getByTestId('sync-status')).toHaveText('已同步', { timeout: 8000 });
  const before = patches.length;
  await page.getByTestId('mode-review').click();
  await expect.poll(() => patches.length, { timeout: 5000 }).toBeGreaterThan(before);
  const body = patches[patches.length - 1];
  expect(body).toContain('english-coach-state.json');
  expect(body).toContain('review');
  expect(body).not.toContain('ghp_example');
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

test('failed create names the HTTP status and keeps the token', async ({ page }) => {
  await page.route('https://api.github.com/gists', route => route.fulfill({
    status: 401,
    contentType: 'application/json',
    body: '{"message":"Bad credentials"}'
  }));
  await boot(page);
  await page.getByTestId('settings-open').click();
  await page.getByTestId('sync-token').fill('ghp_example');
  await page.getByTestId('sync-create').click();
  await expect(page.getByTestId('sync-status')).toHaveText('同步失败 · 401');
  await expect(page.getByTestId('sync-status-panel')).toHaveText('同步失败 · 401');
  await expect(page.getByTestId('settings')).toBeVisible();
  await expect(page.getByTestId('sync-token')).toHaveValue('ghp_example');
  await expect(page.getByTestId('sync-gist')).toHaveValue('');
  await expect(page.getByTestId('sync-create')).toBeEnabled();
  await expect(page.getByTestId('sync-create')).toHaveText('创建 private gist');
});

test('create with an empty token asks for the token', async ({ page }) => {
  await boot(page);
  await page.getByTestId('settings-open').click();
  await page.getByTestId('sync-create').click();
  await expect(page.getByTestId('sync-status')).toHaveText('请先填写 Token');
  await expect(page.getByTestId('settings')).toBeVisible();
});

test('create private gist stores the returned id', async ({ page }) => {
  await page.route('https://api.github.com/gists', async route => {
    const body = JSON.parse(route.request().postData() || '{}');
    expect(body.public).toBe(false);
    expect(body.files['english-coach-state.json']).toBeTruthy();
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: 'created99' }) });
  });
  await boot(page);
  await page.getByTestId('settings-open').click();
  await page.getByTestId('sync-token').fill('ghp_example');
  await page.getByTestId('sync-create').click();
  await expect(page.getByTestId('sync-gist')).toHaveValue('created99');
  await expect(page.getByTestId('sync-status')).toHaveText('已同步');
  const cfg = await page.evaluate(() => JSON.parse(localStorage.getItem('ec_sync_v1')));
  expect(cfg).toEqual({ token: 'ghp_example', gistId: 'created99' });
  expect(await page.locator('body').innerText()).not.toContain('ghp_example');
});
