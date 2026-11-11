export default async function handler(req: any, res: any) {
  const original = req.headers['x-vercel-original-path'] || req.headers['x-invoke-path'] || req.url
  req.url = original
  const { buildApp } = await import('../server/src/app.js')
  const g = globalThis as any
  if (!g.__storegeApp) g.__storegeApp = buildApp()
  const app = await g.__storegeApp
  await app.ready()
  app.server.emit('request' as any, req, res)
}
