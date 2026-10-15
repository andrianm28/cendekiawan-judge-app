# CendekiAwan Judge App

Tablet judging app for the Grand Finale of AWS CendekiAwan Bedrock AI Solution (UM, 20 Oct 2026).

```
cd web
npm install
npm run dev      # http://localhost:5173
npm test         # scoring, ranking and storage tests
npm run build
```

## Two modes

- **Local (no `VITE_API_URL`)**: one device, pick a judge, scores stay in the browser (IndexedDB). This is also the fallback if the venue network fails.
- **Connected (`VITE_API_URL` set)**: each judge logs in with a PIN on their own tablet. Every tap is saved on the tablet first and synced every few seconds, so a Wi-Fi drop loses nothing. Every judge scores all 20 teams. The operator PIN opens a board that runs the stage (running order, team on stage, pitch timer, which every tablet follows), shows each judge's sheets, closes categories, corrects scores with a logged reason, renames judges, shows the live leaderboard and runs deliberation. After a rehearsal (UAT), the operator's **Reset event data** (type RESET) wipes scores, ties, closed categories, running order, deliberation and the change log on the server and on every tablet; judges, names and PINs stay. If a category's top finals end equal, the judge who owns that category picks the winner on their tablet.

The connected build also installs a small service worker (`web/public/sw.js`), so a tablet that reloads while the Wi-Fi is down still opens the app and its saved scores.

## Worst-case simulation

`cd web && npm run sim` runs the real API and tablet sync code through bad-day scenarios (throttling when five judges tap at once, a 15-minute outage, hung requests, a revived dead tablet, an absent judge, a mid-event reset, the operator moving on too early) and writes `sim/results.json`.

## Try it locally with the API

```
cd api && npm install && npm run dev                     # API on :8787, in-memory
cd web && VITE_API_URL=http://localhost:8787 npm run dev
```

Demo PINs: judges 1–5 `111111` … `555555`, operator `99999999`.

## Deploy to AWS (SAM)

```
cd api
npm install && npm test && npm run build
sam deploy --guided --template-file template.yaml        # asks for TokenSecret (32+ random chars)
TABLE_NAME=<TableName output> npm run seed               # prints the 5 judge PINs and the operator PIN once

cd ../web
VITE_API_URL=<ApiUrl output> npm run build
aws s3 sync dist s3://<WebBucketName output> --delete
aws s3 cp dist/sw.js s3://<WebBucketName output>/sw.js --cache-control no-cache   # so tablets pick up a new service worker
```

Open the `WebUrl` output on each tablet. To lock CORS to the site, redeploy with `AllowedOrigin=<WebUrl>`.
Re-running the seed issues new PINs and keeps judge names the operator changed.
