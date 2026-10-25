<script lang="ts">
  import type { ConnectionStatus } from '../../live-client/connection.ts';

  let { status }: { status: ConnectionStatus } = $props();
  const LABELS: Record<ConnectionStatus, string> = {
    connecting: 'Připojuji…',
    open: 'Připojeno',
    reconnecting: 'Spojení vypadlo, připojuji znovu…',
    failed: 'Nepřipojeno',
    closed: 'Odpojeno',
  };
</script>

<span class="conn {status}" role="status" data-testid="connection" data-status={status}>
  <span class="dot" aria-hidden="true"></span>{LABELS[status]}
</span>

<style>
  .conn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.9rem;
    font-weight: 700;
    color: var(--ink-soft);
  }
  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--clay);
  }
  .open .dot {
    background: var(--sage-dark);
  }
  .failed .dot,
  .reconnecting .dot {
    background: var(--bad);
  }
  .reconnecting,
  .failed {
    color: var(--bad);
  }
</style>
