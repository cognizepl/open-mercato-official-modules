import type { GusRequest } from '../lib/client'
import { createGusRegonHealthCheck } from '../lib/health'
import { LOGIN_EMPTY, LOGIN_OK, LOGOUT_OK } from './fixtures/bir'

function sequence(bodies: string[]): GusRequest {
  return async () => new Response(bodies.shift() ?? '', { status: 200 })
}

describe('gusRegonHealthCheck', () => {
  it('is healthy when login succeeds', async () => {
    const result = await createGusRegonHealthCheck(sequence([LOGIN_OK, LOGOUT_OK])).check({ environment: 'test' })
    expect(result.status).toBe('healthy')
    expect(result.details).toEqual({ environment: 'test' })
  })

  it('is unhealthy when the key is rejected', async () => {
    const result = await createGusRegonHealthCheck(sequence([LOGIN_EMPTY])).check({ environment: 'test', apiKey: 'wrong' })
    expect(result.status).toBe('unhealthy')
    expect(result.message).toMatch(/no session id/)
    expect(result.message).not.toContain('[internal]')
  })

  it('is unhealthy for production without a key, without calling GUS', async () => {
    const request = jest.fn()
    const result = await createGusRegonHealthCheck(request as unknown as GusRequest).check({ environment: 'production' })
    expect(result.status).toBe('unhealthy')
    expect(request).not.toHaveBeenCalled()
  })

  it('never includes the API key in the result', async () => {
    const result = await createGusRegonHealthCheck(sequence([LOGIN_EMPTY])).check({ environment: 'production', apiKey: 'secret-123' })
    expect(JSON.stringify(result)).not.toContain('secret-123')
  })
})
