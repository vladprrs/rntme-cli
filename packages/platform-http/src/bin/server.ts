import { serve } from '@hono/node-server';
import { parseEnv } from '../config/env.js';
import { createApp } from '../app.js';
// Later tasks inject real deps below.

const env = parseEnv(process.env);
const app = createApp({ env });

const port = env.PORT;
serve({ fetch: app.fetch, port });
// eslint-disable-next-line no-console
console.log(JSON.stringify({ msg: 'platform-http listening', port, baseUrl: env.PLATFORM_BASE_URL }));
