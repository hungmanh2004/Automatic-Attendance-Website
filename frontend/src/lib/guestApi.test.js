import { afterEach, describe, expect, it, vi } from 'vitest'
import { captureGuestFrame, createGuestFrameFormData } from './guestApi'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('guestApi', () => {
  it('creates guest check-in form data with a frame field', () => {
    const file = new File(['guest'], 'guest-frame.jpg', { type: 'image/jpeg' })
    const formData = createGuestFrameFormData(file)

    expect(formData.get('frame').name).toBe('guest-frame.jpg')
  })

  it('mirrors the captured guest frame before exporting it', async () => {
    const translate = vi.fn()
    const scale = vi.fn()
    const drawImage = vi.fn()
    const fakeBlob = new Blob(['guest'], { type: 'image/jpeg' })
    const originalCreateElement = document.createElement.bind(document)
    const fakeCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({
        drawImage,
        scale,
        translate,
      })),
      toBlob: vi.fn((callback) => callback(fakeBlob)),
    }

    vi.spyOn(document, 'createElement').mockImplementation((tagName) => (
      tagName === 'canvas' ? fakeCanvas : originalCreateElement(tagName)
    ))

    const file = await captureGuestFrame({
      videoHeight: 480,
      videoWidth: 640,
    })

    expect(translate).toHaveBeenCalledWith(640, 0)
    expect(scale).toHaveBeenCalledWith(-1, 1)
    expect(drawImage).toHaveBeenCalledWith(
      expect.objectContaining({ videoHeight: 480, videoWidth: 640 }),
      0,
      0,
      640,
      480,
    )
    expect(file).toBeInstanceOf(File)
    expect(file.name).toBe('guest-frame.jpg')
  })
})
