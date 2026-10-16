import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createApp } from './app.js';
import { createStore } from './store.js';
import { selectProvider } from './providers.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const store = createStore(process.env.NYONI_DATA_DIR ?? join(root, '.private-data'));
await store.init();
setInterval(() => store.sweep(), 10 * 60_000).unref();
const port = Number(process.env.PORT ?? 4310);
createApp({ store, provider: selectProvider(), publicDir: join(root, 'public') })
  .listen(port, () => console.log(`NYONI Personal Preview Lab on http://localhost:${port}`));
