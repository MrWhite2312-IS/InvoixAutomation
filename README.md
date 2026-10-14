# Invoix: Playwright smoke tests

Automated smoke tests for the Invoix invoice builder, written as a bonus to the manual
Test Plan, Test Execution, and Bug Reports of the QA assessment.

**App under test:** https://sprightly-squirrel-6be581.netlify.app/

## Scope
Six tests cover the highest-risk flows: totals and tax (B-014, B-015), adding and removing
items (B-010), Net 30 due dates (B-001), and tax limits (B-016). All other testing is manual.

Three more tests use the documented workaround (adding a blank item to refresh totals) and are
expected to PASS. They prove the calculation is correct once the totals refresh, which isolates
the defect to the refresh behavior. Tax is not asserted there because it is still wrong (B-015).

## Setup
```bash
npm install
npx playwright install chromium
```

## Run
```bash
npm test              # plain run
npm run test:xfail    # known bugs are marked as expected failures
npm run report        # open the HTML report
```

## Expected results
The six defect tests are expected to FAIL against the current app, because they reproduce the
defects reported in the Bug Reports. Each test title and annotation carries its Bug ID.
When a bug is fixed, its test should pass; with `test:xfail`, a fixed bug shows up as an
unexpected pass, which is the signal to remove the `knownBug(...)` line.

## Adjusting selectors
All locators live in the `sel` object at the top of `tests/invoix.spec.js`. If a locator
does not match, regenerate it with `npx playwright codegen https://sprightly-squirrel-6be581.netlify.app/`.
Labels are not associated with the form fields (B-023), so locators use placeholders and field order.
