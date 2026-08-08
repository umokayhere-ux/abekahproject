/**
 * Environment for the self-contained unit tests. No database is involved, so
 * only the values the pure modules read are set.
 */
process.env.JWT_SECRET = "test-secret-that-is-long-enough-to-be-accepted!!";
process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
process.env.PLATFORM_COMMISSION_PERCENT = "10";
