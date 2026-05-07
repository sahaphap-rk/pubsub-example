import "dotenv/config";

import express, { type Request, type Response } from "express";

const port = Number(process.env.PORT ?? 3000);
const subscriptionName = process.env.SUBSCRIPTION_NAME ?? "chat-events-sub";
const workerDelayMs = Number(process.env.WORKER_DELAY_MS ?? 0);
const failOnMessage = process.env.FAIL_ON_MESSAGE;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const app = express();

app.use(express.json());

type PubSubPushBody = {
  message?: {
    data?: string;
    messageId?: string;
    publishTime?: string;
    attributes?: Record<string, string>;
  };
  subscription?: string;
};

app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok", service: "worker" });
});

app.post(
  "/pubsub/push",
  async (req: Request<unknown, unknown, PubSubPushBody>, res: Response) => {
    try {
      const pubSubMessage = req.body.message;

      if (!pubSubMessage?.data) {
        console.error("Invalid Pub/Sub push payload:", req.body);
        res.status(400).json({ error: "Invalid Pub/Sub push payload" });
        return;
      }

      const decodedData = Buffer.from(pubSubMessage.data, "base64").toString(
        "utf8",
      );
      const parsedData = JSON.parse(decodedData) as unknown;

      console.log("Received Pub/Sub push message");
      console.log("Message ID:", pubSubMessage.messageId);
      console.log("Publish time:", pubSubMessage.publishTime);
      console.log("Subscription:", req.body.subscription);
      console.log("Decoded payload:", parsedData);

      if (
        failOnMessage &&
        typeof parsedData === "object" &&
        parsedData !== null &&
        "message" in parsedData &&
        typeof parsedData.message === "string" &&
        parsedData.message.includes(failOnMessage)
      ) {
        console.log(
          `Simulating failure because message includes "${failOnMessage}". Pub/Sub will retry this message.`,
        );
        res.status(500).json({ error: "Simulated worker failure" });
        return;
      }

      if (workerDelayMs > 0) {
        console.log(`Simulating slow work for ${workerDelayMs}ms...`);
        await sleep(workerDelayMs);
      }

      console.log("Message processed successfully. Sending HTTP 204 ack.");
      res.status(204).send();
    } catch (error) {
      console.error("Failed to process Pub/Sub push message:", error);
      res.status(500).json({ error: "Failed to process Pub/Sub push message" });
    }
  },
);

app.listen(port, () => {
  console.log(`Worker server is listening on port ${port}`);
  console.log(`Push endpoint path: /pubsub/push`);
  console.log(`Local push endpoint: http://localhost:${port}/pubsub/push`);
  console.log(`Subscription name: ${subscriptionName}`);
  console.log(`Worker delay: ${workerDelayMs}ms`);
  console.log(`Fail on message: ${failOnMessage ?? "(disabled)"}`);
});
