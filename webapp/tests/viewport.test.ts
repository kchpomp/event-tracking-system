import { expect, test } from 'bun:test'

import { visibleArea } from '../src/platform/viewport'

test('the middle of the visible area follows the viewport offset and height', () => {
  expect(visibleArea({ height: 800, offsetTop: 0 })).toEqual({ centerY: 400, height: 800 })
  // The address bar slid away: the visible area starts lower than the top of the layout viewport.
  expect(visibleArea({ height: 700.5, offsetTop: 100 })).toEqual({ centerY: 450, height: 701 })
})
