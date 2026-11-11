#!/usr/bin/env node
/**
 * Creates server/.env from server/.env.example when it does not exist yet.
 * Safe to run repeatedly; never overwrites an existing environment file.
 */
import { copyFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const envPath = path.join(root, 'server', '.env')
const examplePath = path.join(root, 'server', '.env.example')

if (existsSync(envPath)) {
  console.log('• server/.env already exists')
} else if (existsSync(examplePath)) {
  copyFileSync(examplePath, envPath)
  console.log('✔ Created server/.env from .env.example')
  console.log('  ⚠ Change JWT_SECRET before using this in production.')
} else {
  console.warn('⚠ server/.env.example is missing and server/.env does not exist')
}
