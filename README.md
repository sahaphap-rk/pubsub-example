# Google Cloud Pub/Sub Learning Project

Minimal TypeScript + Express project for learning Google Cloud Pub/Sub with a publisher API and a push subscription worker.

## Project Config

- Google Cloud project name: `pubsub-learning`
- Google Cloud project ID: `pubsub-learning-123456`
- Topic ID: `chat-events`
- Subscription ID: `chat-events-sub`

## Folder Structure

```text
src/
  publisher.ts
  worker.ts
.env.example
package.json
tsconfig.json
```

## Install

```bash
npm install
cp .env.example .env
```

## Authenticate gcloud Locally

Install the Google Cloud CLI, then run:

```bash
gcloud auth login
gcloud auth application-default login
gcloud config set project pubsub-learning-123456
```

`gcloud auth application-default login` creates local Application Default Credentials. The `@google-cloud/pubsub` library uses these credentials automatically during local development.

## Create Pub/Sub Topic

```bash
gcloud pubsub topics create chat-events \
  --project=pubsub-learning-123456
```

## Run the Publisher Locally

```bash
npm run dev:publisher
```

The publisher starts on:

```text
http://localhost:3000
```

Test the publisher with curl:

```bash
curl -X POST http://localhost:3000/publish \
  -H "Content-Type: application/json" \
  -d '{"userId":"user-1","message":"Hello Pub/Sub"}'
```

You should receive a response like:

```json
{
  "success": true,
  "messageId": "1234567890"
}
```

## Run the Worker Locally

The worker is a push endpoint server:

```bash
npm run dev:worker
```

The worker starts on:

```text
http://localhost:3000/pubsub/push
```

To test the worker without Google Cloud, send a fake Pub/Sub push message:

```bash
curl -X POST http://localhost:3000/pubsub/push \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "messageId": "local-test-message",
      "publishTime": "2026-05-06T00:00:00Z",
      "data": "eyJ1c2VySWQiOiJ1c2VyLTEiLCJtZXNzYWdlIjoiSGVsbG8gZnJvbSBjdXJsIn0="
    },
    "subscription": "projects/pubsub-learning-123456/subscriptions/chat-events-sub"
  }'
```

The base64 payload decodes to:

```json
{
  "userId": "user-1",
  "message": "Hello from curl"
}
```

On success, the worker returns HTTP `204 No Content`.

## Demo Slow Worker and Retry

By default the worker processes messages immediately:

```env
WORKER_DELAY_MS=0
FAIL_ON_MESSAGE=
```

To simulate a slow worker without accidentally creating a retry loop, use a small delay such as 3 seconds:

```bash
WORKER_DELAY_MS=3000 npm run dev:worker
```

To make the worker process one message at a time for learning, set `WORKER_CONCURRENCY=1`:

```bash
WORKER_DELAY_MS=3000 WORKER_CONCURRENCY=1 npm run dev:worker
```

You should see logs like:

```text
Worker slot acquired. Active: 1/1, queued: 0
Worker concurrency limit reached. Waiting queue: 1
Worker slot released. Active: 0/1, queued: 1
```

For this demo, publish only a few messages or increase the ack deadline. If many push requests wait too long, Pub/Sub can retry them.

```bash
gcloud pubsub subscriptions update chat-events-sub \
  --ack-deadline=60 \
  --project=pubsub-learning-123456
```

Then publish several messages from another terminal:

```bash
for i in {1..10}; do
  curl -s -X POST http://localhost:3001/publish \
    -H "Content-Type: application/json" \
    -d "{\"userId\":\"user-1\",\"message\":\"slow worker test $i\"}" &
done
wait
```

To simulate retry, run the worker with `FAIL_ON_MESSAGE`:

```bash
FAIL_ON_MESSAGE=fail npm run dev:worker
```

Then publish a message that includes the word `fail`:

```bash
curl -X POST http://localhost:3001/publish \
  -H "Content-Type: application/json" \
  -d '{"userId":"user-1","message":"please fail and retry"}'
```

When the worker returns HTTP `500`, Pub/Sub will retry the same message. You should see the same message ID appear again in the worker logs.

## Create Push Subscription

Google Cloud Pub/Sub needs a public HTTPS URL for push subscriptions. For local testing, use a tunnel such as ngrok:

```bash
ngrok http 3000
```

Then create the push subscription using the HTTPS forwarding URL from ngrok:

```bash
gcloud pubsub subscriptions create chat-events-sub \
  --topic=chat-events \
  --push-endpoint=https://skinhead-purposely-stung.ngrok-free.dev/pubsub/push \
  --project=pubsub-learning-123456
```

Now run the worker locally:

```bash
npm run dev:worker
```

In another terminal, run the publisher:

```bash
PORT=3001 npm run dev:publisher
```

Publish a message:

```bash
curl -X POST http://localhost:3001/publish \
  -H "Content-Type: application/json" \
  -d '{"userId":"user-1","message":"Hello push subscription"}'
```

You should see the decoded message printed in the worker console.

## Deploy Worker to Cloud Run

Build the project:

```bash
npm run build
```

Deploy the worker source to Cloud Run:

```bash
gcloud run deploy pubsub-learning-worker \
  --source . \
  --project=pubsub-learning-123456 \
  --region=asia-southeast1 \
  --allow-unauthenticated \
  --set-env-vars PROJECT_ID=pubsub-learning-123456,TOPIC_NAME=chat-events,SUBSCRIPTION_NAME=chat-events-sub
```

After deployment, copy the Cloud Run service URL and create or update the push subscription:

```bash
gcloud pubsub subscriptions create chat-events-sub \
  --topic=chat-events \
  --push-endpoint=https://YOUR_CLOUD_RUN_URL/pubsub/push \
  --project=pubsub-learning-123456
```

If the subscription already exists, update it:

```bash
gcloud pubsub subscriptions update chat-events-sub \
  --push-endpoint=https://YOUR_CLOUD_RUN_URL/pubsub/push \
  --project=pubsub-learning-123456
```

## Useful Scripts

```bash
npm run dev:publisher
npm run dev:worker
npm run build
npm run start:publisher
npm run start:worker
```

## Notes

- Publisher endpoint: `POST /publish`
- Worker push endpoint: `POST /pubsub/push`
- The publisher and worker both use `PORT`, so run them on different ports when testing together locally.
- No database is required.
