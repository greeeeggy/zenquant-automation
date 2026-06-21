/**
 * Zenquant Auto-Inject — Cloudflare Worker
 *
 * Runs on a cron trigger every 5 minutes.
 * Reads `next_run.txt` from the GitHub repo to find out when the next
 * injection run is allowed, and fires a workflow_dispatch if the time has passed.
 *
 * Environment variables (set in Cloudflare Workers dashboard → Settings → Variables):
 *   GITHUB_TOKEN  — Fine-grained PAT with Actions: Read & Write on zenquant-automation
 */

const REPO   = 'greeeeggy/zenquant-automation';
const BRANCH = 'main';   // change if your default branch is named differently
const WORKFLOW_FILE = 'schedule.yml';

export default {
  // Cron trigger (configured in Cloudflare dashboard: every 5 minutes → "*/5 * * * *")
  async scheduled(event, env, ctx) {
    await checkAndTrigger(env);
  },

  // HTTP fetch handler — lets you test the Worker by visiting its URL manually
  async fetch(request, env, ctx) {
    await checkAndTrigger(env);
    return new Response('Zenquant scheduler check complete.', { status: 200 });
  },
};

async function checkAndTrigger(env) {
  const token = env.GITHUB_TOKEN;
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Accept':        'application/vnd.github+json',
    'User-Agent':    'zenquant-cloudflare-worker',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  // ── Step 1: Read next_run.txt from the repo ────────────────────────────────
  let nextRunAt = 0; // default = run immediately (handles first-ever run)

  const fileRes = await fetch(
    `https://api.github.com/repos/${REPO}/contents/next_run.txt?ref=${BRANCH}`,
    { headers }
  );

  if (fileRes.ok) {
    const data      = await fileRes.json();
    const rawContent = atob(data.content.replace(/\s/g, '')); // base64 → string
    nextRunAt = parseInt(rawContent.trim(), 10);
    console.log(`next_run.txt = ${nextRunAt} (${new Date(nextRunAt * 1000).toISOString()})`);
  } else if (fileRes.status === 404) {
    console.log('next_run.txt not found — treating as first run, firing immediately.');
  } else {
    console.error(`Failed to read next_run.txt: ${fileRes.status} ${await fileRes.text()}`);
    return; // don't fire if we can't confirm the state
  }

  // ── Step 2: Is it time yet? ───────────────────────────────────────────────
  const nowSeconds = Math.floor(Date.now() / 1000);

  if (nowSeconds < nextRunAt) {
    const waitMin = Math.round((nextRunAt - nowSeconds) / 60);
    console.log(`Not time yet. ${waitMin} minute(s) remaining. Skipping.`);
    return;
  }

  // ── Step 3: Fire workflow_dispatch on schedule.yml ────────────────────────
  console.log('Time reached — triggering schedule.yml via workflow_dispatch...');

  const triggerRes = await fetch(
    `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
    {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref: BRANCH }),
    }
  );

  if (triggerRes.status === 204) {
    console.log('✅ Workflow triggered successfully.');
  } else {
    const body = await triggerRes.text();
    console.error(`❌ Failed to trigger workflow: ${triggerRes.status} — ${body}`);
  }
}
