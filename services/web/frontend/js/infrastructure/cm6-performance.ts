import { Transaction } from '@codemirror/state'
import { EditorView } from '@codemirror/view'

const TIMER_START_NAME = 'CM6-BeforeUpdate'
const TIMER_END_NAME = 'CM6-AfterUpdate'
const TIMER_MEASURE_NAME = 'CM6-Update'

let latestDocLength = 0

let performanceMeasureOptionsSupport = false

// Check that performance.measure accepts an options object
try {
  const testMeasureName = 'featureTest'
  performance.measure(testMeasureName, { start: performance.now() })
  performance.clearMeasures(testMeasureName)
  performanceMeasureOptionsSupport = true
} catch (e) {}

function isInputOrDelete(userEventType: string | undefined) {
  return (
    !!userEventType && ['input', 'delete'].includes(userEventType.split('.')[0])
  )
}

export function timedDispatch() {
  let userEventsSinceDomUpdateCount = 0

  return (
    view: EditorView,
    tr: Transaction,
    dispatchFn: (tr: Transaction) => void
  ) => {
    if (!performanceMeasureOptionsSupport) {
      dispatchFn(tr)
      return
    }

    performance.mark(TIMER_START_NAME)

    dispatchFn(tr)

    performance.mark(TIMER_END_NAME)

    const userEventType = tr.annotation(Transaction.userEvent)

    if (isInputOrDelete(userEventType)) {
      ++userEventsSinceDomUpdateCount

      performance.measure(TIMER_MEASURE_NAME, {
        start: TIMER_START_NAME,
        end: TIMER_END_NAME,
        detail: { userEventType, userEventsSinceDomUpdateCount },
      })

      // The `key` property ensures that the measurement task is only run once
      // per measure phase
      view.requestMeasure({
        key: 'inputEventCounter',
        read() {
          userEventsSinceDomUpdateCount = 0
        },
      })
    }

    latestDocLength = tr.state.doc.length
  }
}

function calculateMean(durations: number[]) {
  if (durations.length === 0) return 0

  const sum = durations.reduce((acc, entry) => acc + entry, 0)
  return sum / durations.length
}

function calculateMedian(sortedDurations: number[]) {
  if (sortedDurations.length === 0) return 0

  const middle = Math.floor(sortedDurations.length / 2)

  if (sortedDurations.length % 2 === 0) {
    return (sortedDurations[middle - 1] + sortedDurations[middle]) / 2
  }
  return sortedDurations[middle]
}

function calculate95thPercentile(sortedDurations: number[]) {
  if (sortedDurations.length === 0) return 0

  const index = Math.round((sortedDurations.length - 1) * 0.95)
  return sortedDurations[index]
}

function calculateMax(numbers: number[]) {
  return numbers.reduce((a, b) => Math.max(a, b), 0)
}

export function reportCM6Perf() {
  // Get entries triggered by keystrokes
  const cm6Entries = performance.getEntriesByName(
    TIMER_MEASURE_NAME,
    'measure'
  ) as PerformanceMeasure[]

  const inputEvents = cm6Entries.filter(({ detail }) =>
    isInputOrDelete(detail.userEventType)
  )

  const inputDurations = inputEvents
    .map(({ duration }) => duration)
    .sort((a, b) => a - b)

  const max = calculateMax(inputDurations)
  const mean = calculateMean(inputDurations)
  const median = calculateMedian(inputDurations)
  const ninetyFifthPercentile = calculate95thPercentile(inputDurations)
  const maxUserEventsBetweenDomUpdates = calculateMax(
    inputEvents.map(e => e.detail.userEventsSinceDomUpdateCount)
  )

  performance.clearMeasures(TIMER_MEASURE_NAME)

  return {
    max,
    mean,
    median,
    ninetyFifthPercentile,
    maxUserEventsBetweenDomUpdates,
    docLength: latestDocLength,
    numberOfEntries: inputDurations.length,
  }
}

window._reportCM6Perf = () => {
  console.log(reportCM6Perf())
}
