import { API_BASE_URL } from '~/lib/api/config';

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

export async function listTopics(): Promise<PubSubTopic[]> {
  const res = await fetch(`${API_BASE_URL}/pubsub/topics`);
  if (!res.ok) throw new Error(`Failed to list topics: ${res.status}`);
  return res.json() as Promise<PubSubTopic[]>;
}

export async function listSubscriptions(): Promise<PubSubSubscription[]> {
  const res = await fetch(`${API_BASE_URL}/pubsub/subscriptions`);
  if (!res.ok) throw new Error(`Failed to list subscriptions: ${res.status}`);
  return res.json() as Promise<PubSubSubscription[]>;
}

export async function pullMessages(
  subscriptionShortName: string,
  maxMessages: number,
): Promise<ReceivedMessage[]> {
  const res = await fetch(`${API_BASE_URL}/pubsub/subscriptions/${subscriptionShortName}/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ maxMessages }),
  });
  if (!res.ok) throw new Error(`Failed to pull messages: ${res.status}`);
  return res.json() as Promise<ReceivedMessage[]>;
}
