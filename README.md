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

- **Local (no `VITE_API_URL`)**: one device, pick a group, scores stay in the browser (IndexedDB). This is also the fallback if the venue network fails.
- **Connected (`VITE_API_URL` set)**: each judge logs in with a PIN on their own tablet. Every tap is saved on the tablet first and synced every few seconds, so a Wi-Fi drop loses nothing. The operator PIN opens a board showing who is scoring, closes groups, corrects scores with a logged reason, renames judges and runs deliberation.

## Try it locally with the API

```
cd api && npm install && npm run dev                     # API on :8787, in-memory
cd web && VITE_API_URL=http://localhost:8787 npm run dev
```

Demo PINs: Group 1–5 judges `111111` … `555555`, operator `99999999`.

## Deploy to AWS (SAM)

```
cd api
npm install && npm test && npm run build
sam deploy --guided --template-file template.yaml        # asks for TokenSecret (32+ random chars)
TABLE_NAME=<TableName output> npm run seed               # prints the 5 judge PINs and the operator PIN once

cd ../web
VITE_API_URL=<ApiUrl output> npm run build
aws s3 sync dist s3://<WebBucketName output> --delete
```

Open the `WebUrl` output on each tablet. To lock CORS to the site, redeploy with `AllowedOrigin=<WebUrl>`.
Re-running the seed issues new PINs and keeps judge names the operator changed.
