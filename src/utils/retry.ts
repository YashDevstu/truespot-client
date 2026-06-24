const DNS_ERROR_CODES = ['ENOTFOUND', 'ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED']

function isDnsOrNetworkError(err: unknown): boolean {
  if (err instanceof Error) {
    return DNS_ERROR_CODES.some((code) => err.message.includes(code))
  }
  return false
}

export async function withRetry<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (isDnsOrNetworkError(err) && attempt < retries) {
        await new Promise((res) => setTimeout(res, 800 * (attempt + 1)))
        continue
      }
      throw err
    }
  }
  throw new Error('Unreachable')
}
