import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { FileDropzone } from './FileDropzone'
import { FileList } from './FileList'

describe('portable file components', () => {
  it('passes selected files to the controlled dropzone callback', () => {
    const onFilesChange = vi.fn()
    const file = new File(['image'], 'cover.png', { type: 'image/png' })
    render(<FileDropzone label="Upload images" onFilesChange={onFilesChange} accept="image/*" />)

    fireEvent.change(screen.getByLabelText('Upload images'), { target: { files: [file] } })

    expect(onFilesChange).toHaveBeenCalledWith([file])
  })

  it('opens the native file chooser from its keyboard-accessible trigger', async () => {
    const user = userEvent.setup()
    render(<FileDropzone label="Upload assets" onFilesChange={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Choose files' }))
    expect(screen.getByLabelText('Upload assets')).toBeInTheDocument()
  })

  it('lists file metadata and exposes controlled removal', async () => {
    const user = userEvent.setup()
    const onRemove = vi.fn()
    render(<FileList files={[new File(['data'], 'hero.webp', { type: 'image/webp' })]} onRemove={onRemove} />)

    expect(screen.getByText('hero.webp')).toBeInTheDocument()
    expect(screen.getByText('4 B')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Remove hero.webp' }))
    expect(onRemove).toHaveBeenCalledWith(0)
  })
})
