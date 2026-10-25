<script lang="ts">
  // Living design system: tokens, type, components and the whole illustration manifest.
  // Public and not indexed; documented in docs/DESIGN.md.
  import Art from '#lib/ui/art/Art.svelte';
  import Avatar from '#lib/ui/art/Avatar.svelte';
  import GameCard from '#lib/ui/art/GameCard.svelte';
  import Owl from '#lib/ui/art/Owl.svelte';
  import Pic from '#lib/ui/art/Pic.svelte';
  import { ART_AVATARS, GAME_ART, GAME_NAMES, LEVEL_ART, MANIFEST, PICS_EMOJI, PIC_KEYS, type GameId } from '#lib/ui/art/art.ts';
  import { LEVELS, LEVEL_AGES, LEVEL_LABELS } from '#lib/types.ts';

  const palette = [
    ['cream', 'paper', 'surface', 'line'],
    ['ink', 'ink-soft', 'night', 'night-soft'],
    ['sage-light', 'sage', 'sage-dark', 'sage-edge'],
    ['clay-light', 'clay', 'clay-dark'],
    ['slate-light', 'slate', 'slate-dark'],
    ['mustard-light', 'mustard', 'mustard-dark'],
    ['rose-light', 'rose', 'rose-dark'],
    ['brick-light', 'brick'],
  ];

  const roles: [string, string][] = [
    ['color-bg', 'pozadí stránky'],
    ['color-surface', 'karta, panel'],
    ['color-surface-raised', 'pole formuláře, řádek'],
    ['color-border', 'okraj'],
    ['color-text', 'text'],
    ['color-text-muted', 'vedlejší text'],
    ['color-primary', 'hlavní akce'],
    ['color-primary-soft', 'vybráno'],
    ['color-accent', 'druhá akce, zvýraznění'],
    ['color-info', 'informace'],
    ['color-success', 'správně'],
    ['color-success-bg', 'správně — pozadí'],
    ['color-error', 'špatně, chyba'],
    ['color-error-bg', 'chyba — pozadí'],
    ['color-warning', 'pozor'],
    ['color-warning-bg', 'pozor — pozadí'],
    ['color-focus', 'focus'],
  ];

  const typeScale = ['text-xs', 'text-sm', 'text-md', 'text-lg', 'text-xl', 'text-2xl', 'text-3xl', 'text-4xl'];
  const spaces = ['space-1', 'space-2', 'space-3', 'space-4', 'space-5', 'space-6', 'space-8', 'space-10', 'space-12', 'space-16'];
  const shadows = ['shadow', 'shadow-press', 'shadow-lift', 'shadow-overlay'];
  const motion: [string, string][] = [
    ['dur-press', 'stisk tlačítka'],
    ['dur-fast', 'hover, výběr'],
    ['dur', 'přechod obrazovky, karta'],
    ['dur-slow', 'odhalení odpovědi'],
    ['dur-celebrate', 'oslava, medaile'],
  ];

  const groupNames: Record<string, string> = {
    mascot: 'Maskot',
    hero: 'Úvod',
    cards: 'Karty her',
    levels: 'Úrovně',
    themes: 'Témata kvízu',
    ui: 'Drobnosti rozhraní',
    avatars: 'Avatary hráčů',
    rewards: 'Odměny',
    empty: 'Prázdné stavy',
    env: 'Pozadí čekáren',
    pics: 'Obrázkový slovník (dětské otázky)',
  };

  const groups = $derived.by(() => {
    const out = new Map<string, string[]>();
    for (const [key, e] of Object.entries(MANIFEST)) {
      if (e.group === 'pics') continue;
      out.set(e.group, [...(out.get(e.group) ?? []), key]);
    }
    return [...out];
  });

  // Emoji per picture for the dictionary table.
  const emojiOf = $derived.by(() => {
    const m = new Map<string, string[]>();
    for (const [emoji, key] of Object.entries(PICS_EMOJI)) m.set(key, [...(m.get(key) ?? []), emoji]);
    return m;
  });

  let picSize = $state(128);
  let picFilter = $state('');
  const shownPics = $derived(
    PIC_KEYS.filter((k) => {
      const q = picFilter.trim().toLowerCase();
      if (!q) return true;
      return k.includes(q) || (MANIFEST[`pics.${k}`]?.alt.toLowerCase().includes(q) ?? false) || (emojiOf.get(k) ?? []).includes(q);
    }),
  );

  const games = Object.keys(GAME_NAMES) as GameId[];
  let pressedGame = $state<GameId>('kvizovna');
  let chosenAnswer = $state<number | null>(null);
  const demoOptions = ['🐐 Koza', '🐄 Kráva', '🐑 Ovce', '🐷 Prase'];
  const demoCorrect = 0;
</script>

<svelte:head>
  <title>Design systém — Rodinný herní večer</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<main class="page stack ds">
  <header class="stack">
    <h1>Design systém</h1>
    <p class="muted lead">
      Živý přehled tokenů, typografie, komponent a ilustrací. Pravidla použití jsou v <code>docs/DESIGN.md</code>,
      hodnoty v <code>src/app.css</code>, obrázky v <code>static/art/manifest.json</code>.
    </p>
    <nav class="row toc" aria-label="Obsah">
      {#each [['barvy', 'Barvy'], ['urovne', 'Úrovně'], ['typografie', 'Typografie'], ['prostor', 'Prostor a tvar'], ['pohyb', 'Pohyb'], ['komponenty', 'Komponenty'], ['tv', 'TV'], ['ilustrace', 'Ilustrace'], ['slovnik', 'Obrázkový slovník']] as [id, label] (id)}
        <a class="chip" href="#{id}">{label}</a>
      {/each}
    </nav>
  </header>

  <section id="barvy" class="card stack">
    <h2>Barvy</h2>
    <h3>Základní paleta</h3>
    <div class="palette">
      {#each palette as row, i (i)}
        <div class="swatch-row">
          {#each row as name (name)}
            <figure class="swatch">
              <span class="chipcolor" style:background="var(--{name})"></span>
              <figcaption><code>--{name}</code></figcaption>
            </figure>
          {/each}
        </div>
      {/each}
    </div>
    <h3>Sémantické role</h3>
    <p class="muted">V nových komponentách používej role, ne základní paletu. Role přemapuje tmavé téma TV.</p>
    <div class="roles">
      {#each roles as [name, use] (name)}
        <div class="role">
          <span class="chipcolor small" style:background="var(--{name})"></span>
          <span><code>--{name}</code><br /><span class="muted">{use}</span></span>
        </div>
      {/each}
    </div>
    <div class="row">
      <p class="note-demo ok">✓ Správně! Koza dělá mééé.</p>
      <p class="note-demo err">✗ Tentokrát ne. Správně je koza.</p>
      <p class="note-demo warn">Připojení kolísá, zkus to znovu.</p>
    </div>
  </section>

  <section id="urovne" class="card stack">
    <h2>Úrovně</h2>
    <div class="levels">
      {#each LEVELS as level (level)}
        <div class="level-tile" style:background="var(--level-{level}-bg)" style:color="var(--level-{level})">
          <Art name={LEVEL_ART[level]} size={96} decorative />
          <strong>{LEVEL_LABELS[level]}</strong>
          <span>{LEVEL_AGES[level]}</span>
          <span class="badge {level}">{LEVEL_LABELS[level]}</span>
        </div>
      {/each}
      <div class="level-tile">
        <Art name={LEVEL_ART.vsichni} size={96} decorative />
        <strong>Všichni</strong>
        <span class="muted">celá rodina</span>
      </div>
    </div>
  </section>

  <section id="typografie" class="card stack">
    <h2>Typografie</h2>
    <p class="muted">
      Písmo <code>--font</code>: zaoblené systémové (ui-rounded, SF Pro Rounded, Nunito), 1rem = 18 px. Nadpisy tučnost 800,
      řádkování <code>--leading-tight</code>; text <code>--leading</code> 1,4.
    </p>
    {#each typeScale as t (t)}
      <div class="type-row">
        <code>--{t}</code>
        <span style:font-size="var(--{t})">Příliš žluťoučký kůň</span>
      </div>
    {/each}
    <div class="type-row">
      <code>--text-tv</code>
      <span style:font-size="var(--text-tv)">Otázka na televizi</span>
    </div>
    <div class="type-row">
      <code>--text-tv-title</code>
      <span style:font-size="var(--text-tv-title)" style:font-weight="800">ABCD</span>
    </div>
  </section>

  <section id="prostor" class="card stack">
    <h2>Prostor a tvar</h2>
    <h3>Mezery (mřížka 4 px)</h3>
    {#each spaces as sp (sp)}
      <div class="space-row"><code>--{sp}</code><span class="space-bar" style:width="var(--{sp})"></span></div>
    {/each}
    <h3>Dotykové plochy</h3>
    <div class="row">
      <span class="tap" style:min-height="var(--tap-min)">--tap-min 44 px</span>
      <span class="tap" style:min-height="var(--tap)">--tap 60 px</span>
      <span class="tap" style:min-height="var(--tap-big)">--tap-big 76 px</span>
    </div>
    <h3>Zaoblení a stíny</h3>
    <div class="row">
      <span class="shape" style:border-radius="var(--radius-sm)">--radius-sm</span>
      <span class="shape" style:border-radius="var(--radius)">--radius</span>
      <span class="shape" style:border-radius="var(--radius-lg)">--radius-lg</span>
      <span class="shape" style:border-radius="var(--radius-pill)">--radius-pill</span>
    </div>
    <div class="row">
      {#each shadows as sh (sh)}
        <span class="shape" style:box-shadow="var(--{sh})">--{sh}</span>
      {/each}
    </div>
  </section>

  <section id="pohyb" class="card stack">
    <h2>Pohyb</h2>
    <p class="muted">Najeď nebo ťukni na řádek. Při <code>prefers-reduced-motion</code> jsou všechny délky nulové.</p>
    {#each motion as [name, use] (name)}
      <button type="button" class="motion-row" style:--d="var(--{name})">
        <code>--{name}</code><span class="muted">{use}</span><span class="dot"></span>
      </button>
    {/each}
  </section>

  <section id="komponenty" class="card stack">
    <h2>Komponenty</h2>

    <h3>Tlačítka</h3>
    <div class="row">
      <button class="btn primary" type="button">Hrát</button>
      <button class="btn clay" type="button">Další otázka</button>
      <button class="btn" type="button">Zpět</button>
      <button class="btn ghost" type="button">Přeskočit</button>
      <button class="btn danger" type="button">Ukončit večer</button>
      <button class="btn" type="button" disabled>Nedostupné</button>
    </div>
    <div class="row">
      <button class="btn primary big" type="button">Začít večer</button>
      <button class="btn small" type="button">Upravit</button>
    </div>

    <h3>Volby a pole</h3>
    <div class="row">
      <button class="chip" type="button" aria-pressed="true">Příroda</button>
      <button class="chip" type="button" aria-pressed="false">Sport a hry</button>
      <span class="badge piskoviste">Pískoviště</span>
    </div>
    <input type="text" placeholder="Jméno hráče" aria-label="Ukázkové pole" />

    <h3>Karty her</h3>
    <div class="games">
      {#each games as g (g)}
        <GameCard art={GAME_ART[g]} title={GAME_NAMES[g]} small pressed={pressedGame === g} onclick={() => (pressedGame = g)} />
      {/each}
    </div>

    <h3>Otázka pro předškoláky (obrázkové odpovědi)</h3>
    <div class="question-demo">
      <Owl pose="otazka" text="Které zvířátko dělá mééé?" />
      <div class="answers">
        {#each demoOptions as opt, i (opt)}
          {@const parts = opt.split(' ')}
          <button
            type="button"
            class="answer"
            class:right={chosenAnswer !== null && i === demoCorrect}
            class:wrong={chosenAnswer === i && i !== demoCorrect}
            aria-pressed={chosenAnswer === i}
            onclick={() => (chosenAnswer = i)}
          >
            <Pic emoji={parts[0]} size={112} decorative />
            <span>{parts.slice(1).join(' ')}</span>
          </button>
        {/each}
      </div>
    </div>

    <h3>Sova Moderátorka</h3>
    <div class="owls">
      <Owl pose="mava" text="Ahoj! Dnes hrajeme spolu." compact />
      <Owl pose="otazka" text="Poslouchej otázku." compact />
      <Owl pose="premysli" text="Hmm, kdo to ví?" compact />
      <Owl pose="slavi" text="Hurá, správně!" compact />
    </div>

    <h3>Avatary a odměny</h3>
    <div class="row">
      {#each ART_AVATARS.slice(0, 8) as a (a)}
        <Avatar value={a} px={64} label />
      {/each}
      <Avatar value="🦄" px={64} />
    </div>
    <div class="row">
      {#each ['rewards.misto-1', 'rewards.misto-2', 'rewards.misto-3', 'rewards.vitez-vecera', 'rewards.serie'] as r (r)}
        <Art name={r} size={72} />
      {/each}
    </div>

    <h3>Prázdný stav</h3>
    <div class="empty-state">
      <Art name="empty.zadne-vecery" size={120} decorative />
      <p>Zatím jste nehráli žádný večer. Začněte prvním — stačí tablet nebo televize.</p>
    </div>
  </section>

  <section id="tv" class="stack">
    <div class="theme-tv tv-demo">
      <h2>Tmavé téma TV a čekárny</h2>
      <p style:font-size="var(--text-tv)">Kolik nohou má pavouk?</p>
      <div class="tv-code">K7QM</div>
      <p class="tv-muted">Připoj se telefonem: naskenuj kód nebo zadej čtyři písmena.</p>
    </div>
  </section>

  <section id="ilustrace" class="card stack">
    <h2>Ilustrace</h2>
    <p class="muted">Celý manifest kromě slovníku. Klíč pod obrázkem je jméno pro <code>&lt;Art name="…"&gt;</code>.</p>
    {#each groups as [group, keys] (group)}
      <h3>{groupNames[group] ?? group} <span class="muted count">{keys.length}</span></h3>
      <div class="gallery" class:wide={!MANIFEST[keys[0]].transparent}>
        {#each keys as k (k)}
          <figure class="art-cell" class:checker={MANIFEST[k].transparent}>
            <Art name={k} size={MANIFEST[k].transparent ? 128 : undefined} sizes="240px" />
            <figcaption><code>{k}</code><br /><span class="muted">{MANIFEST[k].alt}</span></figcaption>
          </figure>
        {/each}
      </div>
    {/each}
  </section>

  <section id="slovnik" class="card stack">
    <h2>Obrázkový slovník <span class="muted count">{PIC_KEYS.length}</span></h2>
    <p class="muted">
      <code>&lt;Pic emoji="🐐" size={'{'}96{'}'} /&gt;</code> ukáže ilustraci, když má emoji obrázek
      (<code>static/art/pics-emoji.json</code>), jinak emoji. Velikost 128 px je kontrola čitelnosti pro tříleté.
    </p>
    <div class="row">
      <label class="row">
        Velikost
        <select bind:value={picSize}>
          <option value={64}>64 px</option>
          <option value={96}>96 px</option>
          <option value={128}>128 px</option>
          <option value={192}>192 px</option>
        </select>
      </label>
      <input type="text" bind:value={picFilter} placeholder="Hledat (koza, 🐐…)" aria-label="Hledat obrázek" class="grow-input" />
    </div>
    <div class="pics" style:--pic="{picSize}px">
      {#each shownPics as k (k)}
        <figure class="pic-cell">
          <Pic key={k} size={picSize} />
          <figcaption>
            <strong>{MANIFEST[`pics.${k}`]?.alt}</strong>
            <code>{k}</code>
            <span class="emoji">{(emojiOf.get(k) ?? []).join(' ')}</span>
          </figcaption>
        </figure>
      {/each}
    </div>
    <h3>Bez obrázku (záložní emoji)</h3>
    <div class="row">
      <Pic emoji="🦄" size={96} alt="Jednorožec" />
      <Pic emoji="🍕" size={96} alt="Pizza" />
    </div>
  </section>
</main>

<style>
  .ds {
    padding-bottom: var(--space-16);
  }
  .lead {
    font-size: var(--text-lg);
    margin: 0;
  }
  code {
    font-size: 0.85em;
    background: var(--color-primary-soft);
    padding: 1px 6px;
    border-radius: 6px;
    overflow-wrap: anywhere;
  }
  .toc {
    gap: var(--space-2);
  }
  .toc .chip {
    text-decoration: none;
    color: inherit;
    min-height: var(--tap-min);
  }
  h3 {
    margin: var(--space-4) 0 0;
  }
  .count {
    font-size: var(--text-md);
    font-weight: var(--weight-medium);
  }
  .palette {
    display: grid;
    gap: var(--space-3);
  }
  .swatch-row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
  }
  .swatch {
    margin: 0;
    width: 130px;
  }
  .chipcolor {
    display: block;
    height: 56px;
    border-radius: var(--radius-sm);
    border: var(--border) solid var(--color-border);
  }
  .chipcolor.small {
    width: 44px;
    height: 44px;
    flex: none;
  }
  .swatch figcaption {
    font-size: var(--text-xs);
    margin-top: var(--space-1);
  }
  .roles {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: var(--space-3);
  }
  .role {
    display: flex;
    gap: var(--space-3);
    align-items: center;
    font-size: var(--text-sm);
  }
  .note-demo {
    margin: 0;
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-sm);
    font-weight: var(--weight-bold);
  }
  .note-demo.ok {
    background: var(--color-success-bg);
    color: var(--color-success);
  }
  .note-demo.err {
    background: var(--color-error-bg);
    color: var(--color-error);
  }
  .note-demo.warn {
    background: var(--color-warning-bg);
    color: var(--color-warning);
  }
  .levels {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: var(--space-3);
  }
  .level-tile {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-4);
    border-radius: var(--radius);
    border: var(--border) solid var(--color-border);
    text-align: center;
  }
  .level-tile :global(img) {
    width: 96px;
    height: 96px;
  }
  .type-row {
    display: grid;
    grid-template-columns: 150px 1fr;
    gap: var(--space-4);
    align-items: baseline;
    overflow: hidden;
  }
  .type-row span {
    line-height: var(--leading-tight);
    overflow-wrap: anywhere;
  }
  .space-row {
    display: flex;
    gap: var(--space-4);
    align-items: center;
  }
  .space-row code {
    width: 110px;
  }
  .space-bar {
    height: 16px;
    background: var(--clay);
    border-radius: 4px;
  }
  .tap {
    display: inline-flex;
    align-items: center;
    padding: 0 var(--space-4);
    border: var(--border) dashed var(--slate);
    border-radius: var(--radius-sm);
    font-size: var(--text-sm);
  }
  .shape {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 150px;
    height: 80px;
    background: var(--color-surface-raised);
    border: var(--border) solid var(--color-border);
    border-radius: var(--radius-sm);
    font-size: var(--text-xs);
  }
  .motion-row {
    display: grid;
    grid-template-columns: 150px 1fr 220px;
    gap: var(--space-4);
    align-items: center;
    min-height: var(--tap-min);
    padding: var(--space-2) var(--space-3);
    border: var(--border) solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-surface-raised);
    text-align: left;
  }
  .motion-row .dot {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: var(--sage-dark);
    transition: transform var(--d) var(--ease);
  }
  .motion-row:hover .dot,
  .motion-row:focus-visible .dot,
  .motion-row:active .dot {
    transform: translateX(190px);
  }
  .games {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: var(--space-4);
  }
  .question-demo {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  .answers {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: var(--space-3);
  }
  .answer {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    min-height: var(--tap-big);
    padding: var(--space-3);
    border: var(--border) solid var(--color-border);
    border-radius: var(--radius);
    background: var(--color-surface-raised);
    box-shadow: var(--shadow);
    font-size: var(--text-xl);
    font-weight: var(--weight-bold);
    transition: transform var(--dur-fast) var(--ease);
  }
  .answer:active {
    transform: translateY(2px);
  }
  .answer.right {
    border-color: var(--color-success);
    background: var(--color-success-bg);
  }
  .answer.wrong {
    border-color: var(--color-error);
    background: var(--color-error-bg);
  }
  .owls {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: var(--space-4);
  }
  .tv-demo {
    padding: var(--space-8);
    border-radius: var(--radius-lg);
    text-align: center;
  }
  .tv-demo h2 {
    color: var(--tv-accent);
  }
  .tv-code {
    display: inline-block;
    font-size: var(--text-tv-title);
    font-weight: var(--weight-heavy);
    letter-spacing: 0.12em;
    padding: var(--space-2) var(--space-6);
    border: var(--border) solid var(--tv-border);
    border-radius: var(--radius);
    background: var(--tv-surface);
  }
  .tv-muted {
    color: var(--tv-text-muted);
    font-size: var(--text-lg);
  }
  .gallery {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: var(--space-3);
  }
  .gallery.wide {
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  }
  .art-cell,
  .pic-cell {
    margin: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2);
    border-radius: var(--radius-sm);
    background: var(--color-surface-raised);
    border: 1px solid var(--color-border);
    font-size: var(--text-xs);
    text-align: center;
  }
  .art-cell :global(img) {
    max-height: 180px;
    width: auto;
  }
  .checker {
    background-color: #fff;
    background-image:
      linear-gradient(45deg, #eee7da 25%, transparent 25%), linear-gradient(-45deg, #eee7da 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, #eee7da 75%), linear-gradient(-45deg, transparent 75%, #eee7da 75%);
    background-size: 16px 16px;
    background-position:
      0 0,
      0 8px,
      8px -8px,
      -8px 0;
  }
  .pics {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(max(130px, calc(var(--pic) + 24px)), 1fr));
    gap: var(--space-3);
  }
  .pic-cell figcaption {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .grow-input {
    flex: 1 1 200px;
    width: auto;
    min-width: 0;
  }
  select {
    font: inherit;
    min-height: var(--tap-min);
    padding: 0 var(--space-3);
    border: var(--border) solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-surface-raised);
  }
  @media (max-width: 560px) {
    .type-row,
    .motion-row {
      grid-template-columns: 1fr;
    }
    .motion-row:hover .dot,
    .motion-row:focus-visible .dot,
    .motion-row:active .dot {
      transform: translateX(120px);
    }
  }
</style>
