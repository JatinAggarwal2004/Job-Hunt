import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
test('hero interactions, accessibility, responsive and reduced motion', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('http://127.0.0.1:4173')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Your next role.')
  await page.getByRole('tab', { name: /02.*Refine/ }).click()
  await page.getByRole('button', { name: 'Try this suggestion' }).click()
  await expect(page.getByText('Built a reusable component library', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Suggestion accepted · Undo' }).click()
  await page.getByRole('tab', { name: /03.*Prepare/ }).click()
  await expect(page.getByText('Review, then apply', { exact: true })).toBeVisible()
  await page.getByRole('tab', { name: /01.*Discover/ }).click()
  await page.getByRole('button', { name: 'Save sample Frontend Engineer', exact: true }).click()
  await expect(page.getByText('1 saved in demo')).toBeVisible()
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze()
    expect(
      results.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
    ).toEqual([])
  }
  await page.getByRole('button', { name: 'Switch to light mode' }).click()
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  const light = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
  expect(light.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) }))).toEqual(
    [],
  )
  await page.emulateMedia({ reducedMotion: 'reduce' })
  expect(
    await page.locator('.floating-note').evaluate((el) => getComputedStyle(el).animationName),
  ).toBe('none')
  await page.setViewportSize({ width: 375, height: 812 })
  await page.getByRole('button', { name: 'Open menu', exact: true }).click()
  await expect(page.getByRole('navigation', { name: 'Mobile navigation' })).toBeVisible()
  await page
    .getByRole('navigation', { name: 'Mobile navigation' })
    .getByRole('button', { name: 'Resume studio' })
    .click()
  await expect(page.getByRole('tab', { name: /02.*Refine/ })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(page.getByRole('heading', { name: 'Make the story stronger.' })).toBeVisible()
  await page.screenshot({ path: 'hero-mobile.png', fullPage: true })
  expect(errors).toEqual([])
})
test('blocked local storage remains usable', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new Error('blocked')
    }
  })
  await page.goto('http://127.0.0.1:4173')
  await page.getByRole('button', { name: 'Switch to light mode' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.getByRole('button', { name: 'Find my next chapter' }).click()
  await expect(page.getByRole('button', { name: 'Create workspace', exact: true })).toBeVisible()
})
