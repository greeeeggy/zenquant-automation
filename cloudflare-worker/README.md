# Cloudflare Worker Setup Guide

This Worker polls `next_run.txt` every 5 minutes and fires `schedule.yml` via `workflow_dispatch` exactly 3 hours after the previous run completed.

---

## Step 1 — Create a GitHub PAT

You need a Personal Access Token so the Worker can read the repo and trigger the workflow.

1. Go to: **https://github.com/settings/personal-access-tokens/new**
2. Fill in:
   - **Token name:** `zenquant-workflow-trigger`
   - **Expiration:** 1 year (or No expiration)
   - **Repository access:** Only select repositories → `zenquant-automation`
3. Under **Permissions**, set:
   - **Contents:** Read-only _(to read `next_run.txt`)_
   - **Actions:** Read and Write _(to trigger `workflow_dispatch`)_
4. Click **Generate token**
5. **Copy the token immediately** — you won't see it again.

---

## Step 2 — Create a Cloudflare Account

1. Go to **https://dash.cloudflare.com/sign-up** (free, no credit card)
2. Sign up and verify your email

---

## Step 3 — Create the Worker

1. In the Cloudflare dashboard, go to **Workers & Pages** → **Create**
2. Click **Create Worker**
3. Give it a name: `zenquant-scheduler`
4. Click **Deploy** (ignore the placeholder code for now)
5. Click **Edit code**
6. **Delete all the placeholder code** in the editor
7. **Paste the entire contents of [`worker.js`](./worker.js)** into the editor
8. Click **Deploy** (top right)

---

## Step 4 — Add the GitHub PAT as a Secret

1. In your Worker's page, go to **Settings** → **Variables and Secrets**
2. Under **Secret**, click **Add**
3. Fill in:
   - **Variable name:** `GITHUB_TOKEN`
   - **Value:** _(paste the PAT you copied in Step 1)_
4. Click **Deploy**

---

## Step 5 — Add the Cron Trigger

1. Still in your Worker's page, go to **Settings** → **Triggers** → **Cron Triggers**
2. Click **Add Cron Trigger**
3. Enter: `*/5 * * * *` _(every 5 minutes)_
4. Click **Add Trigger**

---

## Step 6 — Initialize next_run.txt

The Worker needs `next_run.txt` in the repo to know when to first fire. Run this once to seed it with a past timestamp (so the first run fires immediately):

```powershell
echo "0" > next_run.txt
git add next_run.txt
git commit -m "chore: initialize next_run.txt"
git push
```

After the first real run completes, `schedule.yml` will overwrite this with the correct future timestamp automatically.

---

## How It Works (Summary)

```
[Worker fires every 5 min]
  → Reads next_run.txt from GitHub API
  → Is now >= timestamp? 
      NO  → do nothing, wait 5 min
      YES → POST workflow_dispatch to GitHub → schedule.yml starts
              ↓
          inject.js runs (~3 min)
              ↓
          Writes next_run.txt = now + 3h → pushes to repo
              ↓
          [Worker checks again in 5 min → "not time yet" for 3 hours]
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Worker doesn't trigger workflow | Check `GITHUB_TOKEN` secret is set and has `Actions: write` |
| "Not found" error on next_run.txt | Run Step 6 to initialize the file |
| Workflow fires too often | Make sure `next_run.txt` is being committed by the workflow |
| Cron not firing | Check Cloudflare Workers → Triggers → Cron is listed |
| Wrong branch | Edit `BRANCH = 'main'` in `worker.js` if your branch is `master` |
