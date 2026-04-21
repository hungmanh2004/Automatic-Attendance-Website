import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  captureGuestFrame,
  createGuestFrameFormData,
  fetchGuestCheckinTask,
  waitGuestCheckinTaskResult,
} from './guestApi'

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

  it('fetches guest check-in task status', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'processing', task_state: 'STARTED' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchGuestCheckinTask('task-123')).resolves.toEqual({
      status: 'processing',
      task_state: 'STARTED',
    })
    expect(fetchMock).toHaveBeenCalledWith('/api/guest/checkin-kpts/tasks/task-123', expect.objectContaining({
      method: 'GET',
    }))
  })

  it('waits until a guest check-in task is completed', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'processing', task_state: 'STARTED' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'completed', result: { status: 'recognized', employee_id: 7 } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    vi.stubGlobal('fetch', fetchMock)

    await expect(waitGuestCheckinTaskResult('task-123', { timeoutMs: 1000, intervalMs: 1 })).resolves.toEqual({
      status: 'recognized',
      employee_id: 7,
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('fails when a guest check-in task times out', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ status: 'processing', task_state: 'STARTED' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )

    await expect(waitGuestCheckinTaskResult('task-123', { timeoutMs: 1, intervalMs: 1 })).rejects.toMatchObject({
      status: 408,
      payload: { status: 'processing_timeout', task_id: 'task-123' },
    })
  })
})
