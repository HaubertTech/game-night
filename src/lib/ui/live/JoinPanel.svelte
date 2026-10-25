<script lang="ts">
  import LobbyBackdrop from './LobbyBackdrop.svelte';
  import QrCode from './QrCode.svelte';

  let { code }: { code: string } = $props();
  const joinUrl = $derived(typeof location === 'undefined' ? `/m/${code}` : `${location.origin}/m/${code}`);
</script>

<LobbyBackdrop kind="tv" />

<div class="join">
  <QrCode text={joinUrl} label={`QR kód pro připojení: ${joinUrl}`} />
  <p class="how">Naskenuj telefonem, nebo otevři <strong>{joinUrl.replace(/^https?:\/\//, '')}</strong></p>
  <p class="code" data-testid="room-code" aria-label={`Kód místnosti ${code.split('').join(' ')}`}>{code}</p>
</div>

<style>
  .join {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    max-width: 460px;
    justify-self: center;
    width: 100%;
  }
  .how {
    margin: 0;
    font-size: 1.2rem;
    text-align: center;
  }
  .code {
    margin: 0;
    font-size: clamp(4rem, 10vw, 8rem);
    font-weight: 900;
    letter-spacing: 0.18em;
    line-height: 1;
  }
</style>
