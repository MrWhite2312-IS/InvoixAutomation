// Smoke tests for Invoix (Invoice Builder).
// Several tests are EXPECTED to fail today: they reproduce the defects in the Bug Reports.
// Each test is tagged with its Bug ID. Run `npm run test:xfail` to mark known bugs as expected failures.
const { test, expect } = require('@playwright/test');

/* ---------------------------------------------------------------------------
 * SELECTORS: the only place to adjust if the page markup differs.
 * Generate the exact locators with:  npx playwright codegen <URL>
 * ------------------------------------------------------------------------- */
const sel = {
  fromCompany: (page) => page.getByPlaceholder('Your Company'),
  fromEmail: (page) => page.getByPlaceholder('billing@yourcompany.com'),
  toName: (page) => page.getByPlaceholder('Client name'),
  toCompany: (page) => page.getByPlaceholder('Client company'),
  toEmail: (page) => page.getByPlaceholder('client@company.com'),
  issueDate: (page) => page.locator('input[type="date"]').nth(0),
  dueDate: (page) => page.locator('input[type="date"]').nth(1),
  // Number inputs in DOM order: [qty0, price0, qty1, price1, ..., tax]
  numberInputs: (page) => page.locator('input[type="number"]'),
  addItem: (page) => page.getByRole('button', { name: /add item/i }),
  removeItem: (page, i) => page.locator('button', { hasText: '\u00d7' }).nth(i),
  sendInvoice: (page) => page.getByRole('button', { name: /send invoice/i }),
};
const qty = (page, i) => sel.numberInputs(page).nth(2 * i);
const price = (page, i) => sel.numberInputs(page).nth(2 * i + 1);
const tax = (page) => sel.numberInputs(page).last();

/* ---------------------------------------------------------------------------
 * HELPERS
 * ------------------------------------------------------------------------- */
// Marks a test with the bug it reproduces. With XFAIL=1 it becomes an expected failure.
function knownBug(...ids) {
  test.info().annotations.push({ type: 'bug', description: ids.join(', ') });
  if (process.env.XFAIL === '1') test.fail();
}

// Reads Subtotal, Tax, and Total from the visible page text.
async function readTotals(page) {
  const text = await page.locator('body').innerText();
  const num = (re) => {
    const m = text.match(re);
    return m ? Number(m[1].replace(/,/g, '')) : NaN;
  };
  return {
    subtotal: num(/Subtotal\s*\$(-?[\d,.]+)/),
    tax: num(/Tax[\s%]*\$(-?[\d,.]+)/),
    total: num(/(?:^|\n)Total\s*\$(-?[\d,.]+)/),
  };
}

async function fillItem(page, i, q, p) {
  await qty(page, i).fill(String(q));
  await price(page, i).fill(String(p));
}

async function addItemRow(page) {
  await sel.addItem(page).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(sel.sendInvoice(page)).toBeVisible();
});

/* ---------------------------------------------------------------------------
 * TESTS
 * ------------------------------------------------------------------------- */

test('TC-033 main flow: one item, default 10% tax gives correct totals [B-014, B-015]', async ({ page }) => {
  knownBug('B-014', 'B-015');
  await sel.fromCompany(page).fill('Acme S.A.');
  await sel.fromEmail(page).fill('billing@acme.com');
  await sel.toName(page).fill('Maria Perez');
  await sel.toCompany(page).fill('Globex');
  await sel.toEmail(page).fill('maria@globex.com');
  await fillItem(page, 0, 2, 50);

  const t = await readTotals(page);
  expect.soft(t.subtotal, 'Subtotal').toBe(100);
  expect.soft(t.tax, 'Tax (10%)').toBe(10);
  expect.soft(t.total, 'Total').toBe(110);
});

test('TC-023 subtotal sums multiple items [B-014]', async ({ page }) => {
  knownBug('B-014');
  await fillItem(page, 0, 2, 10);
  await addItemRow(page);
  await fillItem(page, 1, 1, 25.5);
  await addItemRow(page);
  await fillItem(page, 2, 3, 4);

  const t = await readTotals(page);
  expect(t.subtotal).toBe(57.5); // 20 + 25.50 + 12
});

test('TC-016 removing an item recalculates the subtotal [B-010, B-014]', async ({ page }) => {
  knownBug('B-010', 'B-014');
  await fillItem(page, 0, 1, 20);
  await addItemRow(page);
  await fillItem(page, 1, 1, 30);
  await sel.removeItem(page, 0).click();

  const t = await readTotals(page);
  expect(t.subtotal).toBe(30);
});

test('TC-001 Due Date defaults to Issue Date + 30 days (Net 30) [B-001]', async ({ page }) => {
  knownBug('B-001');
  const issue = new Date(await sel.issueDate(page).inputValue() + 'T00:00:00Z');
  issue.setUTCDate(issue.getUTCDate() + 30);
  const expectedDue = issue.toISOString().slice(0, 10);

  await expect(sel.dueDate(page)).toHaveValue(expectedDue);
});

test('TC-002 Due Date follows Issue Date + 30 days when Issue Date changes [B-001]', async ({ page }) => {
  knownBug('B-001');
  await sel.issueDate(page).fill('2026-11-01');
  await expect(sel.dueDate(page)).toHaveValue('2026-12-01');
});

test('TC-025 Tax % above 100 is rejected [B-016]', async ({ page }) => {
  knownBug('B-016');
  await tax(page).fill('150');
  const value = Number(await tax(page).inputValue());
  expect(value).toBeLessThanOrEqual(100);
});

/* ---------------------------------------------------------------------------
 * WORKAROUND TESTS (expected to PASS)
 * Adding a blank line item forces the totals to refresh (see B-014 workaround).
 * These confirm the calculation logic is right once the totals are refreshed, which
 * isolates the defect to the refresh behavior. Tax is NOT asserted here because it
 * is still wrong after the workaround (B-015).
 * ------------------------------------------------------------------------- */
test.describe('With the workaround (add a blank item to refresh totals)', () => {
  test('TC-033 workaround: one item subtotal is correct after adding a blank item', async ({ page }) => {
    await fillItem(page, 0, 2, 50);
    await addItemRow(page); // workaround: blank row (Qty 1, Price 0)

    const t = await readTotals(page);
    expect(t.subtotal).toBe(100);
  });

  test('TC-023 workaround: subtotal sums multiple items after adding a blank item', async ({ page }) => {
    await fillItem(page, 0, 2, 10);
    await addItemRow(page);
    await fillItem(page, 1, 1, 25.5);
    await addItemRow(page);
    await fillItem(page, 2, 3, 4);
    await addItemRow(page); // workaround: blank row

    const t = await readTotals(page);
    expect(t.subtotal).toBe(57.5);
  });

  test('TC-016 workaround: removing an item recalculates after adding a blank item', async ({ page }) => {
    await fillItem(page, 0, 1, 20);
    await addItemRow(page);
    await fillItem(page, 1, 1, 30);
    await sel.removeItem(page, 0).click();
    await addItemRow(page); // workaround: blank row

    const t = await readTotals(page);
    expect(t.subtotal).toBe(30);
  });
});
