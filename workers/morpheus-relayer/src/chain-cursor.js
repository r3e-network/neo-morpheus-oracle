export function getRequestCursorFloor(config, chain) {
  const raw = Number(config.startRequestIds?.[chain]);
  return Number.isFinite(raw) && raw > 0 ? raw : null;
}

export function pruneRetryQueueBelowRequestFloor(state, chain, minRequestId) {
  if (minRequestId === null) return 0;
  const before = state[chain].retry_queue.length;
  state[chain].retry_queue = state[chain].retry_queue.filter((item) => {
    const requestId = Number(item?.event?.requestId || 0);
    return !Number.isFinite(requestId) || requestId >= minRequestId;
  });
  return before - state[chain].retry_queue.length;
}

export function resolveChainFromBlock(config, state, chain, confirmedTip, logger = null) {
  const configuredStart = config.startBlocks[chain];
  const defaultStart = Math.max(configuredStart ?? 0, 0);
  const lastBlockRaw = state[chain].last_block;

  if (lastBlockRaw === null || lastBlockRaw === undefined) {
    return defaultStart;
  }

  const lastBlock = Number(lastBlockRaw);
  if (!Number.isFinite(lastBlock) || lastBlock < -1) {
    state[chain].last_block = null;
    logger?.warn?.(
      {
        chain,
        invalid_checkpoint: lastBlockRaw,
        reset_to_start_block: defaultStart,
      },
      'Resetting invalid relayer checkpoint'
    );
    return defaultStart;
  }

  if (lastBlock > confirmedTip) {
    state[chain].last_block = null;
    logger?.warn?.(
      {
        chain,
        checkpoint: lastBlock,
        confirmed_tip: confirmedTip,
        reset_to_start_block: defaultStart,
      },
      'Resetting relayer checkpoint ahead of current confirmed tip'
    );
    return defaultStart;
  }

  return lastBlock + 1;
}
