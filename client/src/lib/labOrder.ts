import type { LabTestItem } from '@/types/labOrder'
import type { LabResult } from '@/types/labResult'

// Pairs each test slot on an order with its matching result. This handles
// the case where the same test name appears more than once on one order,
// which the backend allows (see labResult.service.ts's createLabResult,
// which fills in the first pending slot that matches a given test name).
// Simply matching by test name with `.find()` would always match the same
// first result to every slot with that name. Instead, this pairs same-named
// tests to same-named results by their position: the 1st result with a
// given name goes with the 1st pending slot with that name, the 2nd with
// the 2nd, and so on. This works because `results` already arrives sorted
// from earliest to latest by resultedAt (see labOrder.service.ts's
// getLabOrderById), which is the same order the backend filled in each
// test slot.
export function matchTestsToResults(tests: LabTestItem[], results: LabResult[]) {
  const resultsByTestName = new Map<string, LabResult[]>()
  for (const result of results) {
    const list = resultsByTestName.get(result.testName)
    if (list) list.push(result)
    else resultsByTestName.set(result.testName, [result])
  }

  const seenCount = new Map<string, number>()
  return tests.map((test, index) => {
    const occurrence = seenCount.get(test.testName) ?? 0
    seenCount.set(test.testName, occurrence + 1)
    const result = resultsByTestName.get(test.testName)?.[occurrence]
    return { test, result, index }
  })
}
