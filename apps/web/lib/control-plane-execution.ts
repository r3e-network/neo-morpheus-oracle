import { resolveSupabaseNetwork, type MorpheusNetwork } from './server-supabase';

export function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export async function withMorpheusNetworkContext<T>(
  network: MorpheusNetwork,
  fn: () => Promise<T>
): Promise<T> {
  const previous = process.env.MORPHEUS_NETWORK;
  process.env.MORPHEUS_NETWORK = resolveSupabaseNetwork(network);
  try {
    return await fn();
  } finally {
    if (previous === undefined) delete process.env.MORPHEUS_NETWORK;
    else process.env.MORPHEUS_NETWORK = previous;
  }
}

export async function buildRelayerExecutionConfig(network: MorpheusNetwork) {
  return withMorpheusNetworkContext(network, async () => {
    const modulePath = '../../../workers/morpheus-relayer/src/config.js';
    const mod = (await import(modulePath)) as {
      createRelayerConfig: () => unknown;
    };
    return mod.createRelayerConfig();
  });
}
