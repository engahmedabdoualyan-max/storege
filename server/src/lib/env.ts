import 'dotenv/config'

const bool = (v: string | undefined, fallback = false) =>
  v === undefined ? fallback : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT || 4000),
  host: process.env.HOST || '0.0.0.0',
  jwtSecret: process.env.JWT_SECRET || 'storege-dev-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  appUrl: process.env.APP_URL || 'http://localhost:4000',
  timezone: process.env.COMPANY_TIMEZONE || 'Asia/Riyadh',
  trustProxy: bool(process.env.TRUST_PROXY),
}
