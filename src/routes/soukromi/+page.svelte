<script lang="ts">
  import { OPERATOR_CONTACT, OPERATOR_NAME } from '#lib/legal.ts';
</script>

<svelte:head><title>Zásady ochrany osobních údajů – Herní večer</title></svelte:head>

<main class="page stack">
  <p><a href="/">← Zpět na úvod</a> · <a href="/podminky">Podmínky používání</a></p>
  <h1>Zásady ochrany osobních údajů</h1>
  <p class="muted">Účinnost od 25. 10. 2026 · verze 1</p>

  <section class="card stack">
    <h2>Správce údajů</h2>
    <p>{OPERATOR_NAME}, fyzická osoba. Kontakt: <a href="mailto:{OPERATOR_CONTACT}">{OPERATOR_CONTACT}</a>.</p>
    <p class="note">Údaje o provozovateli a kontakt jsou zatím předběžné. Provozovatel je před veřejným spuštěním zkontroluje a případně upraví.</p>
  </section>

  <section class="card stack">
    <h2>Jaké údaje ukládáme</h2>
    <ul>
      <li><strong>Účet správce:</strong> e-mail, heslo (uložené jen jako hash, scrypt) a název domácnosti. E-mail slouží k přihlášení, ověření adresy, obnově hesla a pozvánkám. Žádný marketing ani newslettery.</li>
      <li><strong>Hráči (i děti) bez účtu:</strong> jméno nebo přezdívka, avatar (emoji), úroveň obtížnosti a volitelně rok narození, jen kvůli výběru otázek.</li>
      <li><strong>Herní data:</strong> výsledky partií, body ligy, odpovědi v kvízu (správně/špatně, téma), které otázky už hráč viděl, hodnocení, večery a sezóny.</li>
      <li><strong>Mobil v místnosti:</strong> připojuje se kódem místnosti bez účtu. V prohlížeči telefonu se uloží jen anonymní token místnosti, aby se šlo po výpadku vrátit.</li>
    </ul>
  </section>

  <section class="card stack">
    <h2>Děti</h2>
    <ul>
      <li>Za založení profilů dětí odpovídá rodič nebo správce domácnosti.</li>
      <li>U dětí doporučujeme přezdívku a rok narození nevyplňovat, pokud není potřeba.</li>
      <li>Aplikace nepracuje s fotkami ani jinými údaji o dětech.</li>
    </ul>
  </section>

  <section class="card stack">
    <h2>Cookies a úložiště v prohlížeči</h2>
    <ul>
      <li>Přihlašovací cookie (httpOnly), nezbytná pro fungování.</li>
      <li>Cookie zařízení pro rychlé přihlášení PINem domácnosti na sdíleném zařízení (TV, tablet).</li>
      <li>localStorage pro tabletovou verzi kvízu.</li>
      <li>Žádné analytické ani reklamní cookies, žádné sledování, žádní reklamní partneři.</li>
    </ul>
  </section>

  <section class="card stack">
    <h2>Logy serveru</h2>
    <p>Server zaznamenává IP adresu, čas a chyby. Slouží k bezpečnosti a ochraně proti zneužití (omezení počtu pokusů o přihlášení). Uchováváme je nejvýše 30 dní.</p>
  </section>

  <section class="card stack">
    <h2>Účel a právní základ</h2>
    <ul>
      <li>Poskytování služby: plnění smlouvy (<a href="/podminky">Podmínky používání</a>).</li>
      <li>Bezpečnost: oprávněný zájem.</li>
      <li>Žádné profilování a žádné automatizované rozhodování.</li>
      <li>Údaje nepředáváme třetím stranám, jen technickým zpracovatelům (hosting, e-mail).</li>
    </ul>
  </section>

  <section class="card stack">
    <h2>Kde data leží</h2>
    <ul>
      <li>Server provozovatele v ČR (zatím vlastní počítač provozovatele, později server nebo hosting v EU), databáze PostgreSQL.</li>
      <li>Zálohy databáze uchováváme 14 dní.</li>
      <li>E-maily odesílá poštovní server (SMTP) zvoleného poskytovatele.</li>
    </ul>
  </section>

  <section class="card stack">
    <h2>Jak dlouho údaje uchováváme</h2>
    <ul>
      <li>Dokud domácnost existuje.</li>
      <li>Neověřený účet se automaticky smaže po 30 dnech.</li>
      <li>Smazané údaje zmizí ze záloh nejpozději po 14 dnech.</li>
    </ul>
  </section>

  <section class="card stack">
    <h2>Tvoje práva</h2>
    <p>Máš právo na přístup, opravu, výmaz, přenositelnost, omezení zpracování a námitku. Stížnost můžeš podat u Úřadu pro ochranu osobních údajů (<a href="https://www.uoou.cz" rel="noopener">www.uoou.cz</a>).</p>
    <ul>
      <li><strong>Export:</strong> data domácnosti si stáhneš jako JSON v Nastavení domácnosti (<a href="/domacnost">/domacnost</a>).</li>
      <li><strong>Smazání hráče:</strong> jeho jméno se ve výsledcích nahradí „Smazaný hráč“, statistiky domácnosti zůstanou.</li>
      <li><strong>Smazání domácnosti:</strong> včetně účtů, nevratně, s potvrzením.</li>
      <li>Vše ostatní e-mailem na <a href="mailto:{OPERATOR_CONTACT}">{OPERATOR_CONTACT}</a>.</li>
    </ul>
  </section>
</main>
