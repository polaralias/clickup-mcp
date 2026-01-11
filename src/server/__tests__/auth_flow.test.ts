import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AuthService } from '../../application/services/AuthService.js'
import { createHash } from 'node:crypto'

describe('AuthService', () => {
    let authService: AuthService
    let mockAuthCodeRepo: any
    let mockSessionManager: any

    beforeEach(() => {
        mockAuthCodeRepo = {
            create: vi.fn(),
            get: vi.fn(),
            delete: vi.fn()
        }
        mockSessionManager = {
            createSession: vi.fn()
        }
        authService = new AuthService(mockAuthCodeRepo, mockSessionManager)
    })

    it('should generate a code', async () => {
        const connectionId = 'conn-1'
        const redirectUri = 'http://example.com/cb'
        const code = await authService.generateCode(connectionId, redirectUri)
        const codeHash = createHash('sha256').update(code).digest('hex')

        expect(code).toBeTruthy()
        expect(mockAuthCodeRepo.create).toHaveBeenCalledWith(expect.objectContaining({
            code: codeHash,
            connectionId,
            redirectUri
        }))
    })

    it('should exchange code successfully with matching redirectUri', async () => {
        const code = 'valid-code'
        const codeHash = createHash('sha256').update(code).digest('hex')
        const redirectUri = 'http://example.com/cb'
        const connectionId = 'conn-1'

        mockAuthCodeRepo.get.mockResolvedValue({
            code: codeHash,
            connectionId,
            expiresAt: new Date(Date.now() + 10000),
            redirectUri
        })
        mockSessionManager.createSession.mockResolvedValue({ accessToken: 'token-123' })

        const token = await authService.exchangeCode(code, redirectUri)

        expect(token).toBe('token-123')
        expect(mockAuthCodeRepo.delete).toHaveBeenCalledWith(codeHash)
    })

    it('should fail exchange if code not found', async () => {
        mockAuthCodeRepo.get.mockResolvedValue(null)
        await expect(authService.exchangeCode('invalid', 'uri')).rejects.toThrow('Invalid authorization code')
    })

    it('should fail exchange if code expired', async () => {
        mockAuthCodeRepo.get.mockResolvedValue({
            expiresAt: new Date(Date.now() - 10000)
        })
        await expect(authService.exchangeCode('expired', 'uri')).rejects.toThrow('Authorization code expired')
    })

    it('should fail exchange if redirectUri is missing when one was stored', async () => {
        mockAuthCodeRepo.get.mockResolvedValue({
            code: 'valid',
            connectionId: 'conn-1',
            expiresAt: new Date(Date.now() + 10000),
            redirectUri: 'http://example.com/cb'
        })
        await expect(authService.exchangeCode('valid', undefined)).rejects.toThrow('Missing redirect_uri')
    })

    it('should fail exchange if redirectUri does not match', async () => {
        mockAuthCodeRepo.get.mockResolvedValue({
            code: 'valid',
            connectionId: 'conn-1',
            expiresAt: new Date(Date.now() + 10000),
            redirectUri: 'http://example.com/cb'
        })
        await expect(authService.exchangeCode('valid', 'http://attacker.com')).rejects.toThrow('Invalid redirect_uri')
    })

    it('should exchange successfully if no redirectUri was stored', async () => {
        mockAuthCodeRepo.get.mockResolvedValue({
            code: 'valid',
            connectionId: 'conn-1',
            expiresAt: new Date(Date.now() + 10000),
            redirectUri: undefined
        })
        mockSessionManager.createSession.mockResolvedValue({ accessToken: 'token-123' })

        const token = await authService.exchangeCode('valid', 'http://any.com') // Even if passed, ignored if not stored? Or should it enforce?
        // Current logic: only checks if stored has one.

        expect(token).toBe('token-123')
    })
})
