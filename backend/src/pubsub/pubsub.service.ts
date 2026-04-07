import { Injectable } from '@nestjs/common';

const PUBSUB_EMULATOR_BASE_URL = 'http://host.docker.internal:8681/v1';
const PROJECT = 'projects/localdev';

export interface PubSubTopic {
  name: string;
}

export interface PubSubSubscription {
  name: string;
  topic: string;
}

export interface PubSubMessage {
  data: string;
  attributes: Record<string, string>;
  messageId: string;
  publishTime: string;
  orderingKey?: string;
}

export interface ReceivedMessage {
  ackId: string;
  message: PubSubMessage;
}

@Injectable()
export class PubSubService {
  /** Fetch all topics from the PubSub emulator */
  async listTopics(): Promise<PubSubTopic[]> {
    const res = await fetch(`${PUBSUB_EMULATOR_BASE_URL}/${PROJECT}/topics`);
    if (!res.ok) throw new Error(`Failed to list topics: ${res.status}`);
    const data = (await res.json()) as { topics?: PubSubTopic[] };
    return data.topics ?? [];
  }

  /** Fetch all subscriptions from the PubSub emulator */
  async listSubscriptions(): Promise<PubSubSubscription[]> {
    const res = await fetch(`${PUBSUB_EMULATOR_BASE_URL}/${PROJECT}/subscriptions`);
    if (!res.ok) throw new Error(`Failed to list subscriptions: ${res.status}`);
    const data = (await res.json()) as { subscriptions?: PubSubSubscription[] };
    return data.subscriptions ?? [];
  }

  /** Pull messages from a subscription without acknowledging them */
  async pullMessages(subscriptionShortName: string, maxMessages: number): Promise<ReceivedMessage[]> {
    const url = `${PUBSUB_EMULATOR_BASE_URL}/${PROJECT}/subscriptions/${subscriptionShortName}:pull`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ maxMessages }),
    });
    if (!res.ok) throw new Error(`Failed to pull messages: ${res.status}`);
    const data = (await res.json()) as { receivedMessages?: ReceivedMessage[] };
    return data.receivedMessages ?? [];
  }
}
