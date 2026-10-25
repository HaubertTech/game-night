<script lang="ts">
  import { OPERATOR_CONTACT, OPERATOR_NAME } from '#lib/legal.ts';
</script>

<svelte:head><title>Podmínky používání – Herní večer</title></svelte:head>

<main class="page stack">
  <p><a href="/">← Zpět na úvod</a> · <a href="/soukromi">Zásady ochrany osobních údajů</a></p>
  <h1>Podmínky používání</h1>
  <p class="muted">Účinnost od 25. 10. 2026 · verze 1</p>

  <section class="card stack">
    <h2>Kdo službu provozuje</h2>
    <p>Herní večer (kvízy, Řekni-ukaž-nakresli, Město-jméno-zvíře, prší, žolíky, liga, večery a statistiky) provozuje {OPERATOR_NAME}, fyzická osoba. Kontakt: <a href="mailto:{OPERATOR_CONTACT}">{OPERATOR_CONTACT}</a>.</p>
    <p class="note">Údaje o provozovateli a kontakt jsou zatím předběžné. Provozovatel je před veřejným spuštěním zkontroluje a případně upraví.</p>
  </section>

  <section class="card stack">
    <h2>Účet domácnosti</h2>
    <ul>
      <li>Správce domácnosti je dospělý člověk. Registruje se e-mailem a heslem a zadá název domácnosti.</li>
      <li>Může e-mailem pozvat dalšího dospělého správce. Odpovídá za to, že s tím druhý dospělý souhlasí.</li>
      <li>Hráči, včetně dětí, jsou profily bez vlastního účtu. Správce odpovídá za údaje, které o členech domácnosti zadá.</li>
      <li>Chraň si heslo a nesdílej ho.</li>
    </ul>
  </section>

  <section class="card stack">
    <h2>Pravidla používání</h2>
    <p>Nepoužívej službu k útokům na ni ani na ostatní, nezakládej účty automatizovaně a nepiš do jmen hráčů a domácností nevhodný obsah.</p>
  </section>

  <section class="card stack">
    <h2>Služba zdarma a bez záruky</h2>
    <ul>
      <li>Služba je zdarma a bez záruky dostupnosti.</li>
      <li>Provozovatel může službu změnit nebo ukončit. Správcům to oznámí e-mailem s předstihem.</li>
    </ul>
  </section>

  <section class="card stack">
    <h2>Zrušení účtu</h2>
    <ul>
      <li>Účet můžeš zrušit kdykoli smazáním domácnosti v Nastavení domácnosti (<a href="/domacnost">/domacnost</a>).</li>
      <li>Při zneužití služby může účet zrušit provozovatel.</li>
    </ul>
  </section>

  <section class="card stack">
    <h2>Osobní údaje</h2>
    <p>Jak s údaji zacházíme, popisují <a href="/soukromi">Zásady ochrany osobních údajů</a>.</p>
  </section>

  <section class="card stack">
    <h2>Změny podmínek a právo</h2>
    <ul>
      <li>Změny podmínek oznámíme e-mailem. Nová verze platí od data uvedeného nahoře.</li>
      <li>Rozhodným právem je právo České republiky.</li>
    </ul>
  </section>
</main>
