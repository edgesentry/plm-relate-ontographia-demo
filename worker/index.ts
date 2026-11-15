// Worker entry point.
//
// Only `/api/*` runs this script first (`assets.run_worker_first`). Everything
// else is served by the static assets binding exactly as before; the assets
// fallback below is for requests that still reach the script (for example an
// unknown path under a future route) and forwards them unchanged.
//
// Findings are compiled into the bundle at build time. This script never reads
// findings from a request and never runs WASM.
import bundleJson from './generated/notify-bundle.json';
import {
  handleNotifyRequest,
  runScheduled,
  type NotifyBundle,
  type NotifyEnv,
} from './notify.ts';

const bundle = bundleJson as NotifyBundle;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith('/api/')) {
      return handleNotifyRequest(request, env as unknown as NotifyEnv, bundle, new Date());
    }
    return env.ASSETS.fetch(request);
  },

  async scheduled(
    _controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    ctx.waitUntil(runScheduled(env as unknown as NotifyEnv, bundle, new Date()));
  },
} satisfies ExportedHandler<Env>;
