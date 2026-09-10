import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import { settingsPage } from '../../settings/registry'
import SystemRevertPage from './systemRevertPage'

describe('SystemRevertPage', () => {
  it('heads itself with the label the breadcrumb and the search result read', () => {
    render(<SystemRevertPage />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(settingsPage('revert')!.label)
  })
})
