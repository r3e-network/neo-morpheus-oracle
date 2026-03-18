import { describe, it, expect, beforeEach } from 'vitest';
import {
  getClientIp,
  isPrivateIp,
  ipKeyGenerator,
  rateLimit,
  resetRateLimitMap,
} from '../lib/rate-limit';

describe('rate-limit utilities', () => {
  beforeEach(() => {
    resetRateLimitMap();
  });

  describe('getClientIp', () => {
    it('should extract first IP from x-forwarded-for header', () => {
      const request = new Request('http://localhost', {
        headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' },
      });
      expect(getClientIp(request)).toBe('1.2.3.4');
    });

    it('should use x-real-ip header when x-forwarded-for is absent', () => {
      const request = new Request('http://localhost', {
        headers: { 'x-real-ip': '9.9.9.9' },
      });
      expect(getClientIp(request)).toBe('9.9.9.9');
    });

    it('should return unknown when no IP headers present', () => {
      const request = new Request('http://localhost');
      expect(getClientIp(request)).toBe('unknown');
    });
  });

  describe('isPrivateIp', () => {
    it('should identify private IP ranges', () => {
      expect(isPrivateIp('127.0.0.1')).toBe(true);
      expect(isPrivateIp('10.0.0.1')).toBe(true);
      expect(isPrivateIp('172.16.0.1')).toBe(true);
      expect(isPrivateIp('192.168.1.1')).toBe(true);
      expect(isPrivateIp('::1')).toBe(true);
    });

    it('should identify public IPs', () => {
      expect(isPrivateIp('1.2.3.4')).toBe(false);
      expect(isPrivateIp('8.8.8.8')).toBe(false);
      expect(isPrivateIp('93.184.216.34')).toBe(false);
    });

    it('should treat unknown as private', () => {
      expect(isPrivateIp('unknown')).toBe(true);
      expect(isPrivateIp('')).toBe(true);
    });
  });

  describe('ipKeyGenerator', () => {
    it('should return internal for private IPs', () => {
      const request = new Request('http://localhost', {
        headers: { 'x-forwarded-for': '192.168.1.1' },
      });
      expect(ipKeyGenerator(request)).toBe('internal');
    });

    it('should return the IP for public addresses', () => {
      const request = new Request('http://localhost', {
        headers: { 'x-forwarded-for': '1.2.3.4' },
      });
      expect(ipKeyGenerator(request)).toBe('1.2.3.4');
    });
  });

  describe('rateLimit', () => {
    it('should allow requests under the limit', async () => {
      const handler = rateLimit({ maxRequests: 5, windowMs: 60000 });
      const request = new Request('http://localhost', {
        headers: { 'x-forwarded-for': '5.5.5.5' },
      });

      let passCount = 0;
      for (let i = 0; i < 3; i++) {
        const response = await handler(request, async () => new Response('ok'));
        if (response.status === 200) passCount++;
      }
      expect(passCount).toBe(3);
    });

    it('should block requests over the limit', async () => {
      const handler = rateLimit({ maxRequests: 2, windowMs: 60000 });
      const request = new Request('http://localhost', {
        headers: { 'x-forwarded-for': '6.6.6.6' },
      });

      await handler(request, async () => new Response('ok'));
      await handler(request, async () => new Response('ok'));
      const blockedResponse = await handler(request, async () => new Response('ok'));

      expect(blockedResponse.status).toBe(429);
    });

    it('should include rate limit headers', async () => {
      const handler = rateLimit({ maxRequests: 10, windowMs: 60000 });
      const request = new Request('http://localhost', {
        headers: { 'x-forwarded-for': '7.7.7.7' },
      });

      const response = await handler(request, async () => new Response('ok'));
      expect(response.headers.get('X-RateLimit-Limit')).toBe('10');
      expect(response.headers.get('X-RateLimit-Remaining')).toBe('9');
    });
  });
});
