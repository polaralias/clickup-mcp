import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHash } from 'node:crypto'
import { AuthService } from '../AuthService.js'
import { AuthCodeRepository } from '../../../infrastructure/repositories/AuthCodeRepository.js'
import { SessionManager } from '../SessionManager.js'

describe('AuthService', () => {
  let authService: AuthService
  let authCodeRepo: AuthCodeRepository
  let sessionManager: SessionManager

  beforeEach(() => {
    authCodeRepo = {
      create: vi.fn(),
      get: vi.fn(),
      delete: vi.fn(),
    } as unknown as AuthCodeRepository

    sessionManager = {
      createSession: vi.fn(),
    } as unknown as SessionManager

    authService = new AuthService(authCodeRepo, sessionManager)
  })

  it('generates a code and stores it hashed', async () => {
    const code = await authService.generateCode('conn-1')
    const codeHash = createHash('sha256').update(code).digest('hex')
    expect(code).toBeTruthy()
    expect(authCodeRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      code: codeHash,
      connectionId: 'conn-1'
    }))
  })

  it('generates a 32-character hex code', async () => {
    const code = await authService.generateCode('conn-1')
    expect(code).toHaveLength(32)
    expect(/^[0-9a-f]+$/.test(code)).toBe(true)
  })

  it('exchanges a valid code for a token', async () => {
    const code = 'valid-code'
    const codeHash = createHash('sha256').update(code).digest('hex')
    const expiresAt = new Date(Date.now() + 10000)

    vi.mocked(authCodeRepo.get).mockResolvedValue({
      code: codeHash,
      connectionId: 'conn-1',
      expiresAt
    })

    vi.mocked(sessionManager.createSession).mockResolvedValue({
        session: {} as any,
        accessToken: 'token-123'
    })

    const token = await authService.exchangeCode(code)

    expect(token).toBe('token-123')
    expect(authCodeRepo.delete).toHaveBeenCalledWith(codeHash)
    expect(sessionManager.createSession).toHaveBeenCalledWith('conn-1')
  })

  it('rejects expired codes', async () => {
    const code = 'expired-code'
    const codeHash = createHash('sha256').update(code).digest('hex')
    const expiresAt = new Date(Date.now() - 10000)

    vi.mocked(authCodeRepo.get).mockResolvedValue({
      code: codeHash,
      connectionId: 'conn-1',
      expiresAt
    })

    await expect(authService.exchangeCode(code)).rejects.toThrow('Authorization code expired')
    expect(authCodeRepo.delete).toHaveBeenCalledWith(codeHash)
    expect(sessionManager.createSession).not.toHaveBeenCalled()
  })

  it('rejects invalid codes', async () => {
    vi.mocked(authCodeRepo.get).mockResolvedValue(null)

    await expect(authService.exchangeCode('invalid')).rejects.toThrow('Invalid authorization code')
  })

  it('generates a code with PKCE params and stores hashed code', async () => {
    const code = await authService.generateCode('conn-1', undefined, 'challenge', 'S256')
    const codeHash = createHash('sha256').update(code).digest('hex')
    expect(authCodeRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      code: codeHash,
      connectionId: 'conn-1',
      codeChallenge: 'challenge',
      codeChallengeMethod: 'S256'
    }))
  })

  it('exchanges code with valid S256 verifier', async () => {
    const code = 'pkce-code'
    const codeHash = createHash('sha256').update(code).digest('hex')
    const verifier = 'my-verifier'
    const challenge = createHash('sha256').update(verifier).digest('base64url')
    const expiresAt = new Date(Date.now() + 10000)

    vi.mocked(authCodeRepo.get).mockResolvedValue({
      code: codeHash,
      connectionId: 'conn-1',
      expiresAt,
      codeChallenge: challenge,
      codeChallengeMethod: 'S256'
    })

    vi.mocked(sessionManager.createSession).mockResolvedValue({
        session: {} as any,
        accessToken: 'token-pkce'
    })

    const token = await authService.exchangeCode(code, undefined, verifier)
    expect(token).toBe('token-pkce')
  })

  it('rejects exchange with invalid S256 verifier', async () => {
    const code = 'pkce-code'
    const codeHash = createHash('sha256').update(code).digest('hex')
    const verifier = 'my-verifier'
    const challenge = createHash('sha256').update(verifier).digest('base64url')
    const expiresAt = new Date(Date.now() + 10000)

    vi.mocked(authCodeRepo.get).mockResolvedValue({
      code: codeHash,
      connectionId: 'conn-1',
      expiresAt,
      codeChallenge: challenge,
      codeChallengeMethod: 'S256'
    })

    await expect(authService.exchangeCode(code, undefined, 'wrong-verifier')).rejects.toThrow('Invalid code_verifier')
  })
})
