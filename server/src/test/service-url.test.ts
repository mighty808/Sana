import { withScheme } from '../utils/serviceUrl.js'

describe('withScheme', () => {
  test("adds http:// to Render's bare host:port, the form that broke every AI call", () => {
    expect(withScheme('sana-ai-service:10000')).toBe('http://sana-ai-service:10000')
  })

  test('leaves a full https URL alone', () => {
    expect(withScheme('https://sana-ai-service.onrender.com')).toBe('https://sana-ai-service.onrender.com')
  })

  test('leaves a full http URL alone', () => {
    expect(withScheme('http://localhost:8000')).toBe('http://localhost:8000')
  })

  test('drops a trailing slash so the request path is not doubled', () => {
    expect(withScheme('https://sana-ai-service.onrender.com/')).toBe('https://sana-ai-service.onrender.com')
    expect(withScheme('sana-ai-service:10000//')).toBe('http://sana-ai-service:10000')
  })

  test('ignores surrounding whitespace and the scheme\'s letter case', () => {
    expect(withScheme('  HTTPS://Example.com  ')).toBe('HTTPS://Example.com')
  })
})
