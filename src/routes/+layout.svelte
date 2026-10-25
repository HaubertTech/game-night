<script lang="ts">
  import '../app.css';
  import '#lib/ui/app/app.css';
  import { page } from '$app/state';
  import { loadSession, session } from '#lib/ui/app/session.svelte.ts';

  let { children } = $props();

  // The tablet game, the TV screen and the phones run full screen without the app navigation.
  const bare = $derived(/^\/(tablet|tv|m)(\/|$)/.test(page.url.pathname));

  $effect(() => {
    if (!bare && !session.loaded) loadSession();
  });

  interface NavLink {
    href: string;
    label: string;
    emoji: string;
  }

  const householdLinks: NavLink[] = [
    { href: '/', label: 'Domů', emoji: '🏠' },
    { href: '/vecery', label: 'Večery', emoji: '🌙' },
    { href: '/liga', label: 'Liga', emoji: '🏆' },
    { href: '/hraci', label: 'Hráči', emoji: '👪' },
    { href: '/sachy', label: 'Šachy', emoji: '♟️' },
    { href: '/trenink', label: 'Trénink karet', emoji: '🃏' },
    { href: '/domacnost', label: 'Nastavení', emoji: '⚙️' },
  ];
  // Without an account: the games that run on one device and save nothing on the server.
  const guestLinks: NavLink[] = [
    { href: '/', label: 'Domů', emoji: '🏠' },
    { href: '/tablet', label: 'Kvízovna na tabletu', emoji: '🦉' },
    { href: '/sachy', label: 'Šachy', emoji: '♟️' },
    { href: '/trenink', label: 'Trénink karet', emoji: '🃏' },
  ];
  const links = $derived(session.household ? householdLinks : guestLinks);

  function active(href: string): boolean {
    const path = page.url.pathname;
    if (href === '/') return path === '/';
    if (href === '/hraci') return path.startsWith('/hraci') || path.startsWith('/hrac/');
    return path.startsWith(href);
  }
</script>

{#if !bare && session.loaded}
  <nav class="app-nav" aria-label="Hlavní navigace">
    {#each links as l (l.href)}
      <a href={l.href} class="nav-link" aria-current={active(l.href) ? 'page' : undefined}>
        <span class="emoji" aria-hidden="true">{l.emoji}</span><span>{l.label}</span>
      </a>
    {/each}
    {#if session.household}
      <span class="nav-home muted">{session.household.name}</span>
    {:else if !session.offline}
      <a class="nav-link nav-login" href="/">Přihlásit</a>
    {/if}
  </nav>
{/if}

{@render children()}

{#if !bare}
  <footer class="legal-links">
    <a href="/podminky">Podmínky používání</a>
    <a href="/soukromi">Ochrana osobních údajů</a>
  </footer>
{/if}

<style>
  .app-nav {
    position: sticky;
    top: 0;
    z-index: 10;
    display: flex;
    gap: 6px;
    align-items: center;
    padding: 8px max(16px, env(safe-area-inset-left));
    background: var(--paper);
    border-bottom: 2px solid var(--line);
    overflow-x: auto;
  }
  .nav-link {
    display: inline-flex;
    align-items: center;
    gap: 0.4em;
    min-height: 48px;
    padding: 6px 16px;
    border-radius: 999px;
    color: var(--ink);
    text-decoration: none;
    font-weight: 700;
    white-space: nowrap;
  }
  .nav-link[aria-current='page'] {
    background: var(--sage-light);
    color: var(--sage-dark);
  }
  .nav-login {
    margin-left: auto;
    border: 2px solid var(--line);
  }
  .nav-home {
    margin-left: auto;
    font-weight: 650;
    white-space: nowrap;
    padding-right: 8px;
  }
  @media (max-width: 560px) {
    .nav-home {
      display: none;
    }
    .nav-link {
      padding: 6px 12px;
    }
  }
</style>
