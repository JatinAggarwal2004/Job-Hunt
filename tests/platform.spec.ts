import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { readFileSync } from 'node:fs'
const base = 'http://127.0.0.1:3002'
const credentials = {
  name: 'Preview Reviewer',
  email: 'preview@example.test',
  password: 'Local QA passphrase 637281',
}
test('connected platform: account, profile, live discovery, resume, tracker, admin and mobile', async ({
  page,
}) => {
  test.setTimeout(120000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(base + '/app')
  await page.getByLabel('Your name', { exact: true }).fill(credentials.name)
  await page.getByLabel('Email address', { exact: true }).fill(credentials.email)
  await page.getByLabel('Password', { exact: false }).fill(credentials.password)
  await page.getByRole('button', { name: 'Create workspace', exact: true }).click()
  await expect(page.locator('.ws-main h1, .ws-auth-form .ws-error').first()).toBeVisible()
  if (
    await page
      .getByText('An account with this email already exists')
      .isVisible()
      .catch(() => false)
  ) {
    await page.getByRole('button', { name: 'Already have an account? Sign in' }).click()
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  }
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Let’s find')
  await page
    .getByRole('navigation', { name: 'Workspace', exact: true })
    .getByRole('button', { name: 'Search & profile' })
    .click()
  await page.getByLabel('Roles you’re interested in', { exact: false }).fill('')
  await page
    .getByLabel('Skills you can demonstrate', { exact: false })
    .fill('React, TypeScript, SQL')
  await page.getByLabel('Preferred job locations', { exact: false }).fill('')
  await page.getByLabel('Current location', { exact: true }).fill('India')
  await page.getByLabel('Search connected sources daily', { exact: true }).check()
  await page.getByLabel('Time zone', { exact: true }).fill('Asia/Kolkata')
  await page.getByRole('button', { name: 'Save my direction' }).click()
  await expect(page.getByText('Your direction is saved.', { exact: false })).toBeVisible()
  await page
    .getByRole('navigation', { name: 'Workspace', exact: true })
    .getByRole('button', { name: 'Discover roles' })
    .click()
  await page.getByRole('button', { name: 'Discover new roles', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Discover new roles', exact: true })).toBeEnabled({
    timeout: 60000,
  })
  await expect(page.locator('.ws-job-card').first()).toBeVisible({ timeout: 15000 })
  const first = page.locator('.ws-job-card').first()
  await first.getByRole('button', { name: /View role/ }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(
    page.getByRole('dialog').getByText('This is a preference match, not a hiring prediction.'),
  ).toBeVisible()
  if (
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Save opportunity', exact: true })
      .isVisible()
  )
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Save opportunity', exact: true })
      .click()
  await page.getByRole('button', { name: 'Close job details', exact: true }).click()
  await page
    .getByRole('navigation', { name: 'Workspace', exact: true })
    .getByRole('button', { name: 'Applications', exact: true })
    .click()
  await expect(page.locator('.ws-application-card').first()).toBeVisible()
  const card = page.locator('.ws-application-card').first()
  await card.getByLabel('Application stage').selectOption('preparing')
  await card.getByText('Application notes & preparation', { exact: true }).click()
  await card
    .getByRole('textbox')
    .fill(`Review requirements and confirm location before applying. Check ${Date.now()}.`)
  await card.getByRole('button', { name: 'Save notes', exact: true }).click()
  await expect(page.getByText('Notes saved.', { exact: true })).toBeVisible()
  await page
    .getByRole('navigation', { name: 'Workspace', exact: true })
    .getByRole('button', { name: 'Resume studio' })
    .click()
  await page.getByLabel('Upload resume', { exact: true }).setInputFiles('tests/fixtures/resume.txt')
  await expect(page.getByLabel('Resume text', { exact: false })).toHaveValue(/accessible React/)
  await page.getByRole('button', { name: 'Review this resume', exact: true }).click()
  await expect(page.locator('.ws-score')).toBeVisible()
  await expect(
    page.getByText('A transparent writing checklist, not an ATS score', { exact: false }),
  ).toBeVisible()
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: 'platform-resume.png', fullPage: true })
  await page
    .getByRole('navigation', { name: 'Workspace', exact: true })
    .getByRole('button', { name: 'Admin studio' })
    .click()
  await page.getByLabel('Platform name', { exact: true }).fill('Job-Hunter')
  await page.getByRole('button', { name: 'Save workspace settings', exact: false }).click()
  await expect(page.getByText('Workspace settings saved.', { exact: true })).toBeVisible()
  await page
    .getByRole('navigation', { name: 'Workspace', exact: true })
    .getByRole('button', { name: 'Settings', exact: true })
    .click()
  await page.getByRole('button', { name: 'Create connection token', exact: true }).click()
  await expect(page.getByLabel('Connection token', { exact: false })).toHaveValue(/[a-f0-9]{64}/)
  await page.getByRole('button', { name: 'Revoke token', exact: true }).click()
  await expect(page.getByText('Application assistant disconnected.', { exact: true })).toBeVisible()
  await page
    .getByRole('navigation', { name: 'Workspace', exact: true })
    .getByRole('button', { name: 'Your overview' })
    .click()
  for (const width of [1440, 820, 375]) {
    await page.setViewportSize({ width, height: 1000 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze()
    expect(
      results.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
    ).toEqual([])
  }
  await page.screenshot({ path: 'platform-mobile.png', fullPage: true })
  await page.getByRole('button', { name: 'Toggle navigation', exact: true }).click()
  await page
    .getByRole('navigation', { name: 'Workspace', exact: true })
    .getByRole('button', { name: 'Your overview' })
    .click()
  await expect(page.locator('.ws-sidebar')).not.toHaveClass(/is-open/)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.screenshot({ path: 'platform-overview.png', fullPage: true })
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Create workspace', exact: true })).toBeVisible()
  expect(errors).toEqual([])
})
test('application assistant fills only recognized empty contact fields and never submits', async ({
  page,
}) => {
  await page.setContent(
    '<form id="application"><label>Full name<input name="full_name"></label><label>Email address<input type="email" value="existing@example.test"></label><label>Phone number<input type="tel"></label><label>Salary expectations<input name="salary"></label><label>Disability status<input></label><label>Website<input type="url"></label><label>LinkedIn profile<input type="url" disabled></label><input type="hidden" name="secret"><button type="submit">Submit application</button></form>',
  )
  await page.addScriptTag({
    content: readFileSync('extension/autofill.js', 'utf8').replace(
      'export function fillContactFields',
      'window.fillContactFields = function',
    ),
  })
  const result = await page.evaluate(() => {
    let submitted = false
    document.querySelector('form')!.addEventListener('submit', (e) => {
      e.preventDefault()
      submitted = true
    })
    const fill = (window as any).fillContactFields
    const result = fill({
      name: 'Alex Example',
      email: 'profile@example.test',
      phone: '+91 9876543210',
      website: 'https://example.test',
      linkedin: 'https://example.test/linkedin',
    })
    return { ...result, submitted }
  })
  expect(result.filled).toBe(3)
  expect(result.submitted).toBe(false)
  await expect(page.getByLabel('Full name', { exact: true })).toHaveValue('Alex Example')
  await expect(page.getByLabel('Email address', { exact: true })).toHaveValue(
    'existing@example.test',
  )
  await expect(page.getByLabel('Salary expectations', { exact: true })).toHaveValue('')
  await expect(page.getByLabel('Disability status', { exact: true })).toHaveValue('')
})

test('workspace screens stay usable on mobile in both themes', async ({ page }) => {
  test.setTimeout(120000)
  const login = await page.request.post(base + '/api/auth/login', {
    data: { email: credentials.email, password: credentials.password },
  })
  expect(login.ok()).toBe(true)
  await page.goto(base + '/app')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Let’s find')
  await page.setViewportSize({ width: 375, height: 1000 })
  for (const light of [false, true]) {
    if (light)
      await page.getByRole('button', { name: 'Switch to light theme', exact: true }).click()
    for (const label of [
      'Discover roles',
      'Resume studio',
      'Applications',
      'Search & profile',
      'Settings',
      'Membership',
      'Admin studio',
    ]) {
      await page.getByRole('button', { name: 'Toggle navigation', exact: true }).click()
      await page
        .getByRole('navigation', { name: 'Workspace', exact: true })
        .getByRole('button', { name: label, exact: true })
        .click()
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
      const result = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
      expect(
        result.violations.map((v) => ({
          page: label,
          id: v.id,
          nodes: v.nodes.map((n) => n.target),
        })),
      ).toEqual([])
    }
  }
})

test('membership and admin pricing, complimentary access, blocking and global free work together', async ({
  page,
  browser,
}) => {
  test.setTimeout(90000)
  page.setDefaultTimeout(10000)
  await page.request.post(base + '/api/auth/login', { data: credentials })
  const account = await browser.newContext()
  const member = await account.newPage()
  const email = `membership-${Date.now()}@example.test`
  const registered = await account.request.post(base + '/api/auth/register', {
    data: { name: 'Membership Reviewer', email, password: 'Membership QA passphrase 927136' },
  })
  expect(registered.ok()).toBe(true)
  const original = await (await page.request.get(base + '/api/admin/monetization')).json()
  try {
    await page.request.patch(base + '/api/admin/monetization', {
      data: { mode: 'paid', monthlyPriceInr: 299 },
    })
    await member.goto(base + '/app')
    await member
      .getByRole('navigation', { name: 'Workspace', exact: true })
      .getByRole('button', { name: 'Membership', exact: true })
      .click()
    await expect(member.getByRole('heading', { name: 'Free plan', exact: true })).toBeVisible()
    await expect(member.getByRole('meter')).toHaveAttribute('aria-valuenow', '5')
    await expect(member.getByRole('button', { name: 'Checkout coming soon' })).toBeDisabled()
    await page.goto(base + '/app')
    await page
      .getByRole('navigation', { name: 'Workspace', exact: true })
      .getByRole('button', { name: 'Admin studio' })
      .click()
    await page.getByLabel('Pro monthly price in ₹').fill('349')
    await page.getByRole('button', { name: 'Review pricing changes' }).click()
    await expect(page.getByRole('dialog')).toContainText('₹349 per month')
    await page.getByRole('button', { name: 'Save pricing settings' }).click()
    await expect(page.getByText('Pricing settings updated.', { exact: true })).toBeVisible()
    await page.getByLabel('Find an account').fill(email)
    let card = page.locator('.billing-user').filter({ hasText: email })
    await card.getByRole('checkbox', { name: /^Complimentary access Unlock/ }).check()
    await card.getByRole('button', { name: 'Review access changes' }).click()
    await page.getByRole('button', { name: 'Save account access' }).click()
    await expect(card.getByText('Complimentary Pro', { exact: true })).toBeVisible()
    await member.reload()
    await expect(member.locator('.ws-plan-strip')).toContainText('Complimentary Pro')
    await card.getByLabel('Block account', { exact: false }).check()
    await card.getByLabel('Reason shown to the account owner').fill('QA access review')
    await card.getByRole('button', { name: 'Review access changes' }).click()
    await page.getByRole('button', { name: 'Save account access' }).click()
    await expect(card.getByText('Account blocked', { exact: true })).toBeVisible()
    await member.reload()
    await expect(
      member.getByRole('heading', { name: 'Account access is restricted.', exact: true }),
    ).toBeVisible()
    await card.getByLabel('Block account', { exact: false }).uncheck()
    await card.getByRole('checkbox', { name: /^Complimentary access Unlock/ }).uncheck()
    await card.getByRole('button', { name: 'Review access changes' }).click()
    await page.getByRole('button', { name: 'Save account access' }).click()
    await expect(card.getByText('Free plan', { exact: true })).toBeVisible()
    await expect(card.getByRole('button', { name: 'Review access changes' })).toBeDisabled()
    await expect(page.getByRole('combobox', { name: 'Access mode', exact: true })).toBeEnabled()
    await page.getByRole('combobox', { name: 'Access mode', exact: true }).selectOption('free')
    await expect(page.getByRole('combobox', { name: 'Access mode', exact: true })).toHaveValue(
      'free',
    )
    await page.getByRole('button', { name: 'Review pricing changes' }).click()
    await page.getByRole('button', { name: 'Save pricing settings' }).click()
    await expect(page.getByText('Pricing settings updated.', { exact: true })).toBeVisible()
    await member.reload()
    await expect(member.locator('.ws-plan-strip')).toContainText('Free for everyone')
    await page.screenshot({ path: 'platform-admin-billing.png', fullPage: true })
  } finally {
    await page.request.patch(base + '/api/admin/monetization', {
      timeout: 5000,
      data: { mode: original.settings.mode, monthlyPriceInr: original.settings.monthlyPriceInr },
    })
    await account.close()
  }
})

test('assistant requests only the chosen HTTPS workspace permission and rejects credential-bearing origins', async ({
  page,
}) => {
  await page.setContent(
    readFileSync('extension/popup.html', 'utf8').replace(
      /<script[^>]*src="popup.js"[^>]*><\/script>/,
      '',
    ),
  )
  await page.evaluate(() => {
    const state = { permissions: [] as string[], requests: [] as string[] }
    Object.assign(window, {
      extensionTest: state,
      chrome: {
        storage: {
          session: { get: async () => ({}), set: async () => {}, remove: async () => {} },
        },
        permissions: {
          request: async ({ origins }: { origins: string[] }) => {
            state.permissions.push(...origins)
            return true
          },
        },
      },
    })
    window.fetch = async (input) => {
      state.requests.push(String(input))
      return new Response(JSON.stringify({ profile: { name: 'QA profile' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  })
  await page.addScriptTag({
    type: 'module',
    content: readFileSync('extension/popup.js', 'utf8').replace(
      "import { fillContactFields } from './autofill.js'",
      '',
    ),
  })
  await page.getByLabel('Workspace origin').fill('https://workspace.example.test')
  await page.getByLabel('Connection token').fill('a'.repeat(64))
  await page.getByRole('button', { name: 'Connect profile' }).click()
  await expect(page.getByText('Connected as QA profile')).toBeVisible()
  expect(await page.evaluate(() => (window as any).extensionTest)).toEqual({
    permissions: ['https://workspace.example.test/*'],
    requests: ['https://workspace.example.test/api/extension/profile'],
  })
  await page.getByLabel('Workspace origin').fill('https://secret@untrusted.example.test')
  await page.getByRole('button', { name: 'Connect profile' }).click()
  await expect(page.getByRole('status')).toContainText('Use an HTTPS workspace origin')
  expect(await page.evaluate(() => (window as any).extensionTest.requests.length)).toBe(1)
})

test('first-party activity pixel, admin per-user run history, idle detection and tracking controls', async ({
  page,
  browser,
}) => {
  test.setTimeout(90000)
  await page.request.post(base + '/api/auth/login', { data: credentials })
  const original = (await (await page.request.get(base + '/api/admin/activity')).json()).settings
  await page.request.patch(base + '/api/admin/activity/settings', {
    data: { ...original, enabled: true },
  })
  const context = await browser.newContext()
  const member = await context.newPage()
  const email = `activity-${Date.now()}@example.test`
  const registered = await context.request.post(base + '/api/auth/register', {
    data: { name: 'Activity Reviewer', email, password: 'Activity QA passphrase 923618' },
  })
  expect(registered.ok()).toBe(true)
  try {
    // A unique account prevents the previous tests' closed-tab grace windows affecting idle assertions.
    await member.clock.install()
    await member.goto(base + '/app')
    await member
      .getByRole('navigation', { name: 'Workspace', exact: true })
      .getByRole('button', { name: 'Discover roles', exact: true })
      .click()
    await member.getByRole('button', { name: 'Discover new roles', exact: true }).click()
    await expect(
      member.getByRole('button', { name: 'Discover new roles', exact: true }),
    ).toBeEnabled({ timeout: 60000 })
    await member
      .getByRole('navigation', { name: 'Workspace', exact: true })
      .getByRole('button', { name: 'Your overview', exact: true })
      .click()
    await expect(member.getByRole('heading', { level: 1 })).toContainText('Let’s find')
    await page.goto(base + '/app')
    await page
      .getByRole('navigation', { name: 'Workspace', exact: true })
      .getByRole('button', { name: 'Admin studio' })
      .click()
    await page.getByLabel('Find activity account', { exact: true }).fill(email)
    const account = page.locator('.activity-account').filter({ hasText: email })
    await expect(account).toBeVisible()
    const active = async () => {
      const data = await (
        await page.request.get(base + '/api/admin/activity?q=' + encodeURIComponent(email))
      ).json()
      return data.users[0]?.active
    }
    await expect.poll(active).toBe(true)
    await expect(account.getByText('Active now', { exact: true })).toBeVisible()
    await expect(account.locator('dd').first()).toHaveText('1')
    await account.getByRole('button', { name: 'View activity for Activity Reviewer' }).click()
    const history = page.getByRole('region', { name: 'Account activity detail' })
    await expect(history).toContainText('workspace page view')
    await expect(history).toContainText('Browser observation')
    await history.getByRole('button', { name: 'Discovery run history', exact: true }).click()
    await expect(history).toContainText('completed')
    await expect(history).toContainText('manual')
    await expect(history).toContainText('Request:')
    await member.clock.fastForward(6 * 60000)
    await member.clock.runFor(1000)
    await expect.poll(active).toBe(false)
    await page.getByRole('checkbox', { name: 'Collect workspace presence & page views' }).uncheck()
    await page.getByLabel('Activity retention in days', { exact: false }).fill('30')
    await page.getByRole('button', { name: 'Save activity settings', exact: true }).click()
    await expect(page.getByText('Activity settings saved.', { exact: true })).toBeVisible()
    const paused = await (await page.request.get(base + '/api/admin/activity')).json()
    expect(paused.settings).toEqual({ enabled: false, retentionDays: 30 })
    expect(paused.activeUsers).toBe(0)
    await expect(page.locator('.activity-metrics')).toContainText('Presence paused')
    await expect(history).toContainText('Activity is retained for 30 days')
    expect(paused.totalRuns).toBeGreaterThan(0)
    await page.locator('.activity-admin').screenshot({ path: 'platform-activity.png' })
  } finally {
    await page.request.patch(base + '/api/admin/activity/settings', {
      data: original,
      timeout: 5000,
    })
    await context.close()
  }
})
