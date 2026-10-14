# CendekiAwan Judge App

Tablet judging app for the Grand Finale of AWS CendekiAwan Bedrock AI Solution (UM, 20 Oct 2026).

```
cd web
npm install
npm run dev      # http://localhost:5173
npm test         # scoring, ranking and storage tests
npm run build
```

Today the app runs fully on one device: scores are stored in the browser (IndexedDB). The backend (API Gateway + Lambda + DynamoDB) and sync come next.
