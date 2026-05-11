import "dotenv/config";

import express, { type Request, type Response } from "express";
import { PubSub } from "@google-cloud/pubsub";

const projectId = process.env.PROJECT_ID ?? "pubsub-learning-123456";
const topicName = process.env.TOPIC_NAME ?? "chat-events";
const port = Number(process.env.PUB_PORT ?? process.env.PORT ?? 3000);

const app = express();
const pubSubClient = new PubSub({ projectId });

app.use(express.json());

type PublishRequestBody = {
  userId?: unknown;
  message?: unknown;
};

app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok", service: "publisher" });
});

app.post(
  "/publish",
  async (req: Request<unknown, unknown, PublishRequestBody>, res: Response) => {
    try {
      const { userId, message } = req.body;

      const payload = {
        userId,
        message,
        publishedAt: new Date().toISOString(),
      };

      console.log("Publishing message:", payload);

      const messageBuffer = Buffer.from(JSON.stringify(payload));
      const messageId = await pubSubClient.topic(topicName).publishMessage({
        data: messageBuffer,
      });

      console.log(`Message published with ID: ${messageId}`);

      res.status(200).json({
        success: true,
        messageId,
      });
    } catch (error) {
      console.error("Failed to publish message:", error);

      res.status(500).json({
        success: false,
        error: "Failed to publish message",
      });
    }
  },
);

app.listen(port, () => {
  console.log(`Publisher server is listening on port ${port}`);
  console.log(`Local publish endpoint: http://localhost:${port}/publish`);
  console.log(`Project ID: ${projectId}`);
  console.log(`Topic name: ${topicName}`);
});
