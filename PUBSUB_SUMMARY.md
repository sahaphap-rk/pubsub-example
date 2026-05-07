# สรุปการทำ Google Cloud Pub/Sub แบบ Push Subscription

เอกสารนี้สรุปภาพรวมการทำงานของ Pub/Sub, วิธีตั้งค่าด้วย command, วิธี run local, วิธีใช้ ngrok, วิธี deploy worker ไป Cloud Run และปัญหาที่เจอระหว่างทดลอง

## ภาพรวมการทำงาน

โปรเจกต์นี้มี 2 service หลัก:

```text
Publisher API
  |
  | publish message
  v
Pub/Sub Topic: chat-events
  |
  | push message
  v
Subscription: chat-events-sub
  |
  | HTTP POST
  v
Worker API: /pubsub/push
```

### Publisher

Publisher คือ Express API ที่รับ request จาก client แล้วส่ง message เข้า Pub/Sub topic

Endpoint:

```text
POST /publish
```

ตัวอย่าง request:

```json
{
  "userId": "user-1",
  "message": "hello pubsub"
}
```

เมื่อ publish สำเร็จ Google Pub/Sub จะคืน `messageId` กลับมา

### Topic

Topic คือที่รับ message จาก publisher

ในโปรเจกต์นี้ใช้:

```text
chat-events
```

### Subscription

Subscription คือทางที่ subscriber ใช้อ่าน message จาก topic

ในโปรเจกต์นี้ใช้ Push Subscription:

```text
chat-events-sub
```

Push Subscription จะส่ง HTTP request ไปหา worker endpoint เอง

### Worker

Worker คือ Express API ที่รับ message จาก Pub/Sub

Endpoint:

```text
POST /pubsub/push
```

ถ้า worker process สำเร็จ ให้ตอบ:

```ts
res.status(204).send();
```

HTTP `2xx` คือการ ack message สำหรับ Push Subscription

ถ้า worker ตอบ `500`, timeout, หรือ endpoint ล่ม Pub/Sub จะถือว่ายังไม่ ack และจะ retry message เดิม

## Project Config

```text
Project Name: pubsub-learning
Project ID: pubsub-learning-123456
Topic ID: chat-events
Subscription ID: chat-events-sub
Dead Letter Topic: chat-events-dead-letter
```

## Environment Variables

ไฟล์ `.env` ควรมีค่าประมาณนี้:

```env
PROJECT_ID=pubsub-learning-123456
TOPIC_NAME=chat-events
SUBSCRIPTION_NAME=chat-events-sub
PORT=3000
WORKER_DELAY_MS=0
FAIL_ON_MESSAGE=
```

ค่าที่ใช้ demo:

```text
WORKER_DELAY_MS=3000
```

ใช้จำลอง worker ทำงานช้า

```text
FAIL_ON_MESSAGE=fail
```

ใช้จำลอง worker fail เมื่อ message มีคำว่า `fail`

## ติดตั้งโปรเจกต์

```bash
npm install
cp .env.example .env
```

ตรวจว่า TypeScript build ผ่าน:

```bash
npm run build
```

## Authenticate Google Cloud

Login ด้วย Google Cloud CLI:

```bash
gcloud auth login
gcloud auth application-default login
gcloud config set project pubsub-learning-123456
```

คำสั่งนี้สำคัญ:

```bash
gcloud auth application-default login
```

เพราะ library `@google-cloud/pubsub` จะใช้ Application Default Credentials ตอน run local

## สร้าง Topic

เช็กก่อนว่า topic มีอยู่แล้วหรือยัง:

```bash
gcloud pubsub topics describe chat-events \
  --project=pubsub-learning-123456
```

ถ้ายังไม่มี ให้สร้าง:

```bash
gcloud pubsub topics create chat-events \
  --project=pubsub-learning-123456
```

ถ้า topic มีอยู่แล้ว ไม่ต้องสร้างซ้ำ ใช้ topic เดิมได้เลย

เช็ก topic:

```bash
gcloud pubsub topics list \
  --project=pubsub-learning-123456
```

## Run Local ด้วย ngrok

Push Subscription ต้องมี public HTTPS endpoint

ถ้า worker อยู่ที่เครื่องเรา:

```text
http://localhost:3000/pubsub/push
```

Google Cloud จะเรียกไม่ได้ เพราะ `localhost` คือเครื่องของ Google ไม่ใช่เครื่องเรา

ดังนั้นตอน local ต้องใช้ ngrok:

```bash
ngrok http 3000
```

ตัวอย่าง ngrok URL:

```text
https://skinhead-purposely-stung.ngrok-free.dev
```

Push endpoint ที่ต้องใช้คือ:

```text
https://skinhead-purposely-stung.ngrok-free.dev/pubsub/push
```

## Run Worker Local

ใช้ port `3000` สำหรับ worker:

```bash
npm run dev:worker
```

Worker จะ listen ที่:

```text
http://localhost:3000/pubsub/push
```

## Run Publisher Local

เพราะ worker ใช้ port `3000` แล้ว ให้ publisher ใช้ port `3001`:

```bash
PORT=3001 npm run dev:publisher
```

Publisher จะอยู่ที่:

```text
http://localhost:3001/publish
```

## สร้าง Push Subscription

ถ้ายังไม่เคยสร้าง subscription:

```bash
gcloud pubsub subscriptions create chat-events-sub \
  --topic=chat-events \
  --push-endpoint=https://skinhead-purposely-stung.ngrok-free.dev/pubsub/push \
  --project=pubsub-learning-123456
```

ถ้า subscription มีอยู่แล้ว และต้องการเปลี่ยน ngrok URL:

```bash
gcloud pubsub subscriptions update chat-events-sub \
  --push-endpoint=https://skinhead-purposely-stung.ngrok-free.dev/pubsub/push \
  --project=pubsub-learning-123456
```

เช็ก subscription:

```bash
gcloud pubsub subscriptions describe chat-events-sub \
  --project=pubsub-learning-123456
```

## Publish Message เพื่อทดสอบ

ยิง request ไปที่ publisher:

```bash
curl -X POST http://localhost:3001/publish \
  -H "Content-Type: application/json" \
  -d '{"userId":"user-1","message":"hello from local publisher"}'
```

ผลลัพธ์ที่ควรได้:

```json
{
  "success": true,
  "messageId": "..."
}
```

จากนั้นดู terminal ของ worker ควรเห็น log:

```text
Received Pub/Sub push message
Message ID: ...
Delivery attempt: ...
Decoded payload: ...
Message processed successfully. Sending HTTP 204 ack.
```

## การ Ack ของ Push Subscription

สำหรับ Push Subscription ไม่มีการเรียก `ack()` ในโค้ดเอง

Pub/Sub ดูจาก HTTP status code:

```text
HTTP 2xx
=> ack สำเร็จ
=> message จบ

HTTP 500 / timeout / network error
=> ไม่ ack
=> Pub/Sub retry message เดิม
```

ใน worker ใช้:

```ts
res.status(204).send();
```

`204 No Content` หมายถึงสำเร็จแล้ว แต่ไม่ต้องส่ง body กลับ

## Demo: API ตอบเร็ว

Pub/Sub ช่วยให้ API ตอบเร็ว เพราะ publisher แค่ส่ง message เข้า topic แล้ว return `messageId`

ลองจับเวลา:

```bash
time curl -X POST http://localhost:3001/publish \
  -H "Content-Type: application/json" \
  -d '{"userId":"user-1","message":"fast api test"}'
```

สิ่งที่เห็น:

```text
Publisher ตอบเร็ว
Worker ค่อย process message ทีหลัง
```

## Demo: Queue รอได้

จำลอง worker ช้า:

```bash
WORKER_DELAY_MS=3000 npm run dev:worker
```

ยิงหลาย message:

```bash
for i in {1..10}; do
  curl -s -X POST http://localhost:3001/publish \
    -H "Content-Type: application/json" \
    -d "{\"userId\":\"user-1\",\"message\":\"slow worker test $i\"}" &
done
wait
```

สิ่งที่เห็น:

```text
Publisher ยังตอบเร็ว
Worker ค่อยๆ process
Message ที่ยังไม่ ack จะค้างอยู่ใน subscription
```

Metric ที่ดูได้ใน Google Cloud Console:

```text
Pub/Sub > Subscriptions > chat-events-sub > Metrics
```

Metric ที่ควรดู:

```text
Unacked messages
Oldest unacked message age
Push request count
Push response codes
```

## Demo: Retry เมื่อ Worker Fail

Run worker โดยให้ fail เมื่อ message มีคำว่า `fail`:

```bash
FAIL_ON_MESSAGE=fail npm run dev:worker
```

Publish message:

```bash
curl -X POST http://localhost:3001/publish \
  -H "Content-Type: application/json" \
  -d '{"userId":"user-1","message":"please fail and retry"}'
```

สิ่งที่เห็น:

```text
Worker return HTTP 500
Pub/Sub retry message เดิม
Message ID เดิมจะถูกส่งซ้ำ
Delivery attempt จะเพิ่มขึ้น
```

## Retry กี่รอบ

ถ้าไม่มี Dead Letter Policy:

```text
Pub/Sub จะ retry ไปเรื่อยๆ
จนกว่า message จะ ack หรือหมด message retention duration
```

โดยทั่วไป message retention default คือประมาณ 7 วัน

ถ้าต้องการจำกัดจำนวน retry เช่น 5 ครั้ง ต้องใช้ Dead Letter Topic

## ตั้งค่า Dead Letter Topic

เช็กก่อนว่า dead-letter topic มีอยู่แล้วหรือยัง:

```bash
gcloud pubsub topics describe chat-events-dead-letter \
  --project=pubsub-learning-123456
```

ถ้ายังไม่มี ให้สร้าง dead-letter topic:

```bash
gcloud pubsub topics create chat-events-dead-letter \
  --project=pubsub-learning-123456
```

ถ้า topic มีอยู่แล้ว ไม่ต้องสร้างซ้ำ ใช้ topic เดิมได้เลย

ตั้งค่า subscription ให้ส่ง message ที่ fail ไป dead-letter topic หลังพยายามประมาณ 5 ครั้ง:

```bash
gcloud pubsub subscriptions update chat-events-sub \
  --dead-letter-topic=chat-events-dead-letter \
  --max-delivery-attempts=5 \
  --project=pubsub-learning-123456
```

เช็ก config:

```bash
gcloud pubsub subscriptions describe chat-events-sub \
  --project=pubsub-learning-123456
```

ควรเห็น:

```yaml
deadLetterPolicy:
  deadLetterTopic: projects/pubsub-learning-123456/topics/chat-events-dead-letter
  maxDeliveryAttempts: 5
```

หมายเหตุ: `maxDeliveryAttempts=5` เป็น best effort อาจไม่เป๊ะ 5 รอบทุกครั้ง

## ตั้งค่า IAM สำหรับ Dead Letter

หา project number:

```bash
gcloud projects describe pubsub-learning-123456 \
  --format='value(projectNumber)'
```

ตัวอย่าง project number:

```text
164182800735
```

Pub/Sub service account จะเป็น:

```text
service-164182800735@gcp-sa-pubsub.iam.gserviceaccount.com
```

ให้สิทธิ์ publish ไป dead-letter topic:

```bash
gcloud pubsub topics add-iam-policy-binding chat-events-dead-letter \
  --project=pubsub-learning-123456 \
  --member='serviceAccount:service-164182800735@gcp-sa-pubsub.iam.gserviceaccount.com' \
  --role='roles/pubsub.publisher'
```

ให้สิทธิ์ subscriber บน subscription เดิม:

```bash
gcloud pubsub subscriptions add-iam-policy-binding chat-events-sub \
  --project=pubsub-learning-123456 \
  --member='serviceAccount:service-164182800735@gcp-sa-pubsub.iam.gserviceaccount.com' \
  --role='roles/pubsub.subscriber'
```

ถ้าไม่ตั้ง IAM ให้ครบ อาจเห็นว่า message retry ไม่หยุด แม้ตั้ง `maxDeliveryAttempts=5` แล้ว

## อ่าน Message จาก Dead Letter Topic

Dead-letter topic เป็นแค่ topic สำหรับเก็บ message ที่ fail

ถ้าต้องการ pull ดู message ต้องสร้าง subscription อีกตัว:

```bash
gcloud pubsub subscriptions create chat-events-dead-letter-sub \
  --topic=chat-events-dead-letter \
  --project=pubsub-learning-123456
```

Pull ดู message:

```bash
gcloud pubsub subscriptions pull chat-events-dead-letter-sub \
  --auto-ack \
  --limit=10 \
  --project=pubsub-learning-123456
```

แบบ JSON:

```bash
gcloud pubsub subscriptions pull chat-events-dead-letter-sub \
  --auto-ack \
  --limit=10 \
  --format=json \
  --project=pubsub-learning-123456
```

ถ้าเจอ message ที่เคย fail แปลว่า `chat-events-sub` republish ไป dead-letter topic สำเร็จ

## Deploy Worker ไป Cloud Run

Push Subscription ต้องเรียก worker ผ่าน public HTTPS URL

ถ้าไม่ใช้ ngrok ให้ deploy worker ไป Cloud Run:

```bash
gcloud run deploy pubsub-learning-worker \
  --source . \
  --project=pubsub-learning-123456 \
  --region=asia-southeast1 \
  --allow-unauthenticated \
  --set-env-vars PROJECT_ID=pubsub-learning-123456,TOPIC_NAME=chat-events,SUBSCRIPTION_NAME=chat-events-sub,WORKER_DELAY_MS=0,FAIL_ON_MESSAGE=
```

หลัง deploy จะได้ Cloud Run URL เช่น:

```text
https://pubsub-learning-worker-xxxxx-as.a.run.app
```

อัปเดต push endpoint:

```bash
gcloud pubsub subscriptions update chat-events-sub \
  --push-endpoint=https://YOUR_CLOUD_RUN_URL/pubsub/push \
  --project=pubsub-learning-123456
```

หลังจากนี้ไม่ต้องใช้ ngrok แล้ว

## ถ้า Server ล่ม จะเกิดอะไร

ถ้า worker ล่ม หรือ ngrok ปิด:

```text
Pub/Sub push ไปหา endpoint ไม่ได้
message ไม่ถูก ack
message ค้างใน subscription
Pub/Sub retry ภายหลัง
```

เมื่อ worker กลับมา:

```text
Pub/Sub จะส่ง message ที่ค้างมาใหม่
worker ตอบ 204
message ถูก ack
backlog ลดลง
```

Metric ที่ดูได้:

```text
Unacked messages
Oldest unacked message age
Push response codes
Push request count
```

## ปัญหาที่เจอและวิธีแก้

### 1. Worker log แสดง localhost ตอน deploy Cloud Run

ปัญหา:

```text
Worker log บอก http://localhost:3000/pubsub/push
ทำให้สับสนตอนอยู่บน Cloud Run
```

วิธีแก้:

```text
Log เป็น port และ endpoint path แทน
เช่น Push endpoint path: /pubsub/push
```

Cloud Run endpoint จริงต้องใช้ URL ของ Cloud Run:

```text
https://YOUR_CLOUD_RUN_URL/pubsub/push
```

### 2. Pub/Sub เรียก localhost ไม่ได้

ปัญหา:

```text
ตั้ง push endpoint เป็น localhost แล้ว Google Cloud เรียกไม่ได้
```

วิธีแก้:

```text
ตอน local ใช้ ngrok
ตอน production ใช้ Cloud Run URL
```

### 3. Worker delay 10 วินาทีแล้ว message ถูกส่งซ้ำ

ปัญหา:

```text
Worker ช้าเกินไป
Pub/Sub ยังไม่ได้รับ 2xx ทันเวลา
จึง retry message เดิม
```

วิธีแก้:

```text
ลด delay เช่น WORKER_DELAY_MS=3000
หรือเพิ่ม ack deadline
```

ตัวอย่างเพิ่ม ack deadline:

```bash
gcloud pubsub subscriptions update chat-events-sub \
  --ack-deadline=60 \
  --project=pubsub-learning-123456
```

### 4. ตั้ง maxDeliveryAttempts=5 แล้วแต่ยัง retry ไม่หยุด

ปัญหา:

```text
มี deadLetterPolicy แล้ว แต่ IAM ของ Pub/Sub service account ยังไม่ครบ
Pub/Sub ส่ง message ไป dead-letter topic ไม่ได้
```

วิธีแก้:

```text
ให้ roles/pubsub.publisher บน dead-letter topic
ให้ roles/pubsub.subscriber บน subscription เดิม
```

### 5. ไม่รู้ว่า message ถูกส่งไป dead-letter แล้วหรือยัง

วิธีเช็ก:

```text
สร้าง dead-letter subscription
pull message จาก chat-events-dead-letter-sub
ดู metric ของ dead-letter topic
```

Command:

```bash
gcloud pubsub subscriptions pull chat-events-dead-letter-sub \
  --auto-ack \
  --limit=10 \
  --project=pubsub-learning-123456
```

## Command สรุปแบบเร็ว

```bash
# Auth
gcloud auth login
gcloud auth application-default login
gcloud config set project pubsub-learning-123456

# Topic
gcloud pubsub topics describe chat-events \
  --project=pubsub-learning-123456

gcloud pubsub topics create chat-events \
  --project=pubsub-learning-123456

# Worker local
npm run dev:worker

# ngrok
ngrok http 3000

# Push subscription
gcloud pubsub subscriptions create chat-events-sub \
  --topic=chat-events \
  --push-endpoint=https://skinhead-purposely-stung.ngrok-free.dev/pubsub/push \
  --project=pubsub-learning-123456

# If subscription already exists, update endpoint instead
gcloud pubsub subscriptions update chat-events-sub \
  --push-endpoint=https://skinhead-purposely-stung.ngrok-free.dev/pubsub/push \
  --project=pubsub-learning-123456

# Publisher local
PORT=3001 npm run dev:publisher

# Publish test
curl -X POST http://localhost:3001/publish \
  -H "Content-Type: application/json" \
  -d '{"userId":"user-1","message":"hello pubsub"}'

# Dead-letter topic
gcloud pubsub topics describe chat-events-dead-letter \
  --project=pubsub-learning-123456

gcloud pubsub topics create chat-events-dead-letter \
  --project=pubsub-learning-123456

# Enable dead-letter policy
gcloud pubsub subscriptions update chat-events-sub \
  --dead-letter-topic=chat-events-dead-letter \
  --max-delivery-attempts=5 \
  --project=pubsub-learning-123456

# Find project number
gcloud projects describe pubsub-learning-123456 \
  --format='value(projectNumber)'

# Dead-letter IAM
gcloud pubsub topics add-iam-policy-binding chat-events-dead-letter \
  --project=pubsub-learning-123456 \
  --member='serviceAccount:service-164182800735@gcp-sa-pubsub.iam.gserviceaccount.com' \
  --role='roles/pubsub.publisher'

gcloud pubsub subscriptions add-iam-policy-binding chat-events-sub \
  --project=pubsub-learning-123456 \
  --member='serviceAccount:service-164182800735@gcp-sa-pubsub.iam.gserviceaccount.com' \
  --role='roles/pubsub.subscriber'

# Create subscription for reading dead-letter messages
gcloud pubsub subscriptions create chat-events-dead-letter-sub \
  --topic=chat-events-dead-letter \
  --project=pubsub-learning-123456

# Pull dead-letter message
gcloud pubsub subscriptions pull chat-events-dead-letter-sub \
  --auto-ack \
  --limit=10 \
  --project=pubsub-learning-123456
```

## สรุปสั้นที่สุด

```text
Publisher ส่ง message เข้า Topic
Subscription รับ message จาก Topic
Push Subscription ส่ง HTTP POST ไปหา Worker
Worker ตอบ 204 คือ ack
Worker fail หรือ timeout คือ retry
ถ้าอยากจำกัด retry ต้องใช้ Dead Letter Topic
ถ้า run local ต้องใช้ ngrok
ถ้ารันจริงควร deploy worker เป็น Cloud Run
```
