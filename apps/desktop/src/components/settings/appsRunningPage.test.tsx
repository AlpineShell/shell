import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

import { settingsPage } from '../../settings/registry'
import { stubAppsBridge } from './appsTestBridge'
import AppsRunningPage from './appsRunningPage'

describe('AppsRunningPage', () => {
  beforeEach(() => {
    stubAppsBridge()
  })

  it('heads itself with the label the breadcrumb and the search result read', () => {
    render(<AppsRunningPage />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(settingsPage('apps-running')!.label)
  })
})
