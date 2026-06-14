'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ErrorArt } from '@/components/illustrations';
import { DEFAULT_PAIRS } from '@/lib/onchain-data';
import { getFeedDescriptor } from '@/lib/feed-defaults';
import { Card } from '@/components/ui/Card';
import { SkeletonStats } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import type { PublicRuntimeStatusSnapshot } from '@neo-morpheus-oracle/shared/public-runtime';

import { OverviewStats } from './OverviewStats';
import { OverviewNetwork } from './OverviewNetwork';
import { OverviewActivity } from './OverviewActivity';
import { getDashboardNetworkConfig } from './networkSelection';

type OnchainRecord = {
  pair: string;
  price_display: string;
  timestamp: string;
  timestamp_iso: string | null;
  attestation_hash: string;
};

function getSelectedNetworkQuerySuffix() {
  if (typeof window === 'undefined') return '';
  const network = new URL(window.location.href).searchParams.get('network');
  return network ? `&network=${encodeURIComponent(network)}` : '';
}

function getOverviewNetworkConfig(onchainState: any) {
  const networkConfig = getDashboardNetworkConfig(onchainState?.network);
  return {
    ...networkConfig,
    oracleDomain: onchainState?.neo_n3?.oracle?.domain || networkConfig.oracleDomain,
    datafeedDomain: onchainState?.neo_n3?.datafeed?.domain || networkConfig.datafeedDomain,
    datafeedContract: onchainState?.neo_n3?.datafeed?.contract || networkConfig.datafeedContract,
  };
}

export function OverviewTab({ setOutput }: any) {
  const [onchainState, setOnchainState] = useState<any>(null);
  const [runtimeStatus, setRuntimeStatus] = useState<PublicRuntimeStatusSnapshot | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPair, setSelectedPair] = useState<string>(DEFAULT_PAIRS[0]);
  const [liveQuote, setLiveQuote] = useState<any>(null);
  const [liveQuoteLoading, setLiveQuoteLoading] = useState(false);
  const { addToast } = useToast();
  // Monotonic request id so only the latest loadState() invocation may setState,
  // preventing out-of-order resolution from overlapping interval/manual fetches
  // (mirrors the `cancelled` guard used by loadLiveQuote below).
  const loadStateRequestId = useRef(0);

  const loadState = useCallback(async () => {
    const requestId = ++loadStateRequestId.current;
    const isLatest = () => loadStateRequestId.current === requestId;
    setIsRefreshing(true);
    setError(null);
    try {
      const [stateResponse, runtimeResponse] = await Promise.all([
        fetch(`/api/onchain/state?limit=50${getSelectedNetworkQuerySuffix()}`),
        fetch('/api/runtime/status'),
      ]);
      const [stateBody, runtimeBody] = await Promise.all([
        stateResponse.json().catch(() => ({})),
        runtimeResponse.json().catch(() => ({})),
      ]);
      if (!isLatest()) return;
      setOnchainState(stateBody);
      setRuntimeStatus(runtimeBody as PublicRuntimeStatusSnapshot);

      const recordCount = Number(stateBody?.neo_n3?.datafeed?.pair_count || 0);
      const requestFee = stateBody?.neo_n3?.oracle?.request_fee_display || '0.01 GAS';
      const networkConfig = getOverviewNetworkConfig(stateBody);
      const appId = runtimeBody?.runtime?.info?.appId || 'unavailable';
      const runtimeState = runtimeBody?.runtime?.status || 'unknown';
      const executionPlane = runtimeBody?.catalog?.topology?.executionPlane || 'unknown';
      const riskPlane = runtimeBody?.catalog?.topology?.riskPlane || 'unknown';
      const triggerKinds = Array.isArray(runtimeBody?.catalog?.automation?.triggerKinds)
        ? runtimeBody.catalog.automation.triggerKinds.join(', ')
        : 'unknown';
      setOutput(
        [
          '>> Loaded Neo N3 on-chain state.',
          `>> Oracle fee: ${requestFee}`,
          `>> Feed pairs tracked: ${recordCount}`,
          `>> Runtime status: ${runtimeState}`,
          `>> Runtime execution plane: ${executionPlane}`,
          `>> Runtime risk plane: ${riskPlane}`,
          `>> Automation triggers: ${triggerKinds}`,
          `>> Enclave app id: ${appId}`,
          `>> Oracle attestation: ${networkConfig.oracleAttestationExplorerUrl || 'unpublished'}`,
          `>> Datafeed attestation: ${
            networkConfig.datafeedAttestationExplorerUrl || 'unpublished'
          }`,
        ].join('\n')
      );
    } catch (error) {
      if (!isLatest()) return;
      const errorMsg = error instanceof Error ? error.message : String(error);
      setError(errorMsg);
      setOutput(`!! Failed to load on-chain state: ${errorMsg}`);
      addToast('error', `Failed to load on-chain state: ${errorMsg}`);
    } finally {
      if (isLatest()) {
        setIsRefreshing(false);
        setIsInitialLoading(false);
      }
    }
  }, [setOutput, addToast]);

  useEffect(() => {
    void loadState();
    const timer = setInterval(() => {
      void loadState();
    }, 20000);
    return () => clearInterval(timer);
  }, [loadState]);

  useEffect(() => {
    let cancelled = false;
    async function loadLiveQuote() {
      setLiveQuoteLoading(true);
      try {
        const response = await fetch(`/api/feeds/${encodeURIComponent(selectedPair)}`);
        const body = await response.json().catch(() => ({}));
        if (!cancelled) setLiveQuote(body);
      } catch {
        if (!cancelled) setLiveQuote(null);
      } finally {
        if (!cancelled) setLiveQuoteLoading(false);
      }
    }
    void loadLiveQuote();
    return () => {
      cancelled = true;
    };
  }, [selectedPair]);

  const recordsByPair = useMemo(() => {
    const records = Array.isArray(onchainState?.neo_n3?.datafeed?.records)
      ? onchainState.neo_n3.datafeed.records
      : [];
    return new Map<string, OnchainRecord>(
      records.map((record: OnchainRecord) => [
        String(record.pair || '')
          .trim()
          .toUpperCase(),
        record,
      ])
    );
  }, [onchainState]);

  const oracleState = onchainState?.neo_n3?.oracle || null;
  const dstack = runtimeStatus?.runtime?.info
    ? {
        app_id: runtimeStatus.runtime.info.appId,
        compose_hash: runtimeStatus.runtime.info.composeHash,
        client_kind: runtimeStatus.runtime.info.clientKind,
      }
    : null;
  const configuredSyncedCount = DEFAULT_PAIRS.filter((pair) => recordsByPair.has(pair)).length;
  const selectedRecord = recordsByPair.get(selectedPair) || null;
  const selectedDescriptor = getFeedDescriptor(selectedPair);
  const networkConfig = useMemo(() => getOverviewNetworkConfig(onchainState), [onchainState]);
  const livePrice = liveQuote?.price ? Number(liveQuote.price) : null;
  const onchainPrice = selectedRecord?.price_display ? Number(selectedRecord.price_display) : null;
  const liveDeltaPct =
    livePrice !== null &&
    Number.isFinite(livePrice) &&
    onchainPrice !== null &&
    Number.isFinite(onchainPrice) &&
    onchainPrice > 0
      ? ((livePrice - onchainPrice) / onchainPrice) * 100
      : null;

  return (
    <div className="fade-up" style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          borderBottom: '1px solid var(--border-dim)',
          paddingBottom: '1rem',
        }}
      >
        <div>
          <h2
            style={{
              fontSize: '2rem',
              fontWeight: 900,
              letterSpacing: 0,
              marginBottom: '0.5rem',
            }}
          >
            Network Monitor
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
            Live Neo N3 registry state, synchronized pricefeeds, and TEE deployment metadata.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          {isInitialLoading ? (
            <div
              className="badge-outline"
              style={{ color: 'var(--text-muted)', borderColor: 'var(--border-dim)' }}
            >
              Loading...
            </div>
          ) : (
            <>
              <div
                className="badge-outline"
                style={{ color: 'var(--neo-green)', borderColor: 'var(--neo-green)' }}
              >
                Neo N3: Live
              </div>
              <div className="badge-outline" style={{ color: 'var(--text-muted)' }}>
                Runtime: {runtimeStatus?.runtime?.status || 'unknown'}
              </div>
            </>
          )}
        </div>
      </div>

      {isInitialLoading ? (
        <SkeletonStats />
      ) : error ? (
        <Card variant="error" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span style={{ flexShrink: 0, lineHeight: 0 }}>
              <ErrorArt size={72} title="Failed to load network data" />
            </span>
            <div>
              <div style={{ fontWeight: 800, marginBottom: '4px' }}>
                Failed to load network data
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{error}</div>
            </div>
          </div>
        </Card>
      ) : (
        <OverviewStats
          oracleState={oracleState}
          dstack={dstack}
          configuredSyncedCount={configuredSyncedCount}
          oracleDomain={networkConfig.oracleDomain}
          datafeedDomain={networkConfig.datafeedDomain}
          oracleAttestationExplorerUrl={networkConfig.oracleAttestationExplorerUrl}
          datafeedAttestationExplorerUrl={networkConfig.datafeedAttestationExplorerUrl}
        />
      )}

      <OverviewNetwork
        selectedPair={selectedPair}
        selectedRecord={selectedRecord}
        selectedDescriptor={selectedDescriptor}
        liveQuote={liveQuote}
        liveQuoteLoading={liveQuoteLoading}
        liveDeltaPct={liveDeltaPct}
      />

      <OverviewActivity
        isInitialLoading={isInitialLoading}
        isRefreshing={isRefreshing}
        selectedPair={selectedPair}
        setSelectedPair={setSelectedPair}
        recordsByPair={recordsByPair}
        onRefresh={() => void loadState()}
        networkKey={networkConfig.networkKey}
        datafeedContract={networkConfig.datafeedContract}
        datafeedDomain={networkConfig.datafeedDomain}
      />
    </div>
  );
}
