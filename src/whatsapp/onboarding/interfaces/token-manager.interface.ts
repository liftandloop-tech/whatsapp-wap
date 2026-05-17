export interface TokenManager {
  /**
   * Returns a valid token for the given WABA account.
   * Logic: Returns cached token or refreshes it if needed.
   */
  getValidToken(wabaAccountId: string): Promise<string>;

  /**
   * Forcefully refreshes the token for the given WABA account.
   */
  refreshToken(wabaAccountId: string): Promise<void>;

  /**
   * Invalidates the token (e.g., when Meta returns error 190).
   */
  invalidateToken(wabaAccountId: string): Promise<void>;

  /**
   * Idempotency check: Set a result if key doesn't exist, or return existing.
   */
  getOrSetIdempotentResponse<T>(
    key: string,
    ttlSec: number,
    fetcher: () => Promise<T>,
  ): Promise<T>;
}
