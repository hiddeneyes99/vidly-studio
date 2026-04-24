// Vercel serverless function entry. The handler is the bundled Express app
// produced by `pnpm --filter @workspace/api-server run build`.
// Run `pnpm run build:vercel` from the repo root before deploying.
export { default } from "../artifacts/api-server/dist/handler.mjs";
