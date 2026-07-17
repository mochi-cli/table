import { RedisPubSub } from '../../share-db/sharedb-redis.pubsub';

const redisURI = process.env.BACKEND_CACHE_REDIS_URI ?? 'redis://127.0.0.1:6379/0';
const channel = `__action_trigger_tbl_mochi_realtime_smoke_${Date.now()}`;
const payload = [
  {
    actionKey: 'setRecord',
    payload: {
      tableId: 'tbl_mochi_realtime_smoke',
      fieldIds: ['fld_name'],
      skipRealtime: true,
    },
  },
];

async function main() {
  const publisher = new RedisPubSub({ redisURI });
  const subscriber = new RedisPubSub({ redisURI });

  const close = () =>
    Promise.all([
      new Promise<void>((resolve, reject) =>
        publisher.close((error) => (error ? reject(error) : resolve()))
      ),
      new Promise<void>((resolve, reject) =>
        subscriber.close((error) => (error ? reject(error) : resolve()))
      ),
    ]);

  const waitForMessage = new Promise<unknown>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out waiting for Redis pubsub')), 5000);
    subscriber.subscribe(channel, (error, stream) => {
      if (error) {
        clearTimeout(timeout);
        reject(error);
        return;
      }
      if (!stream) {
        clearTimeout(timeout);
        reject(new Error('Redis pubsub subscribe returned no stream'));
        return;
      }
      const opStream = stream as unknown as {
        on: (event: 'data', listener: (data: unknown) => void) => void;
      };
      opStream.on('data', (data: unknown) => {
        clearTimeout(timeout);
        resolve(data);
      });
    });
  });

  setTimeout(() => {
    publisher.publish([channel], payload, (publishError) => {
      if (publishError) {
        throw publishError;
      }
    });
  }, 250);

  try {
    const received = await waitForMessage;
    console.log(JSON.stringify({ ok: true, redisURI, channel, received }, null, 2));
  } finally {
    await close();
  }
}

void main();
