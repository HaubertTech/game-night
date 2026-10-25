# Zdroj obrázkového slovníku: (mřížka, [(klíč, alt česky, [emoji], popis anglicky)×4]).
# Spuštění zapíše design/art/pics.json (jediný zdroj pro prompty, process.py a mapu emoji).
import json
from pathlib import Path

G = [
 ("animals-1", [
  ("pes", "Pes", ["🐶", "🐕", "🦮"], "a friendly brown-and-white dog standing, side view, tail up"),
  ("stene", "Štěně", [], "a small clumsy puppy sitting, big head, floppy ears, clearly a baby dog, same colors as the dog"),
  ("kocka", "Kočka", ["🐱", "🐈"], "a grey tabby cat sitting, side view, long tail curled"),
  ("kotatko", "Koťátko", [], "a tiny fluffy kitten, big head and big eyes, clearly a baby cat, same grey tabby colors"),
 ]),
 ("animals-2", [
  ("krava", "Kráva", ["🐮", "🐄"], "a black-and-white spotted dairy cow standing, side view, pink udder, small horns"),
  ("tele", "Tele", [], "a small calf with long legs, black-and-white spots, clearly a baby cow"),
  ("koza", "Koza", ["🐐"], "a white goat standing, side view, small horns and a beard"),
  ("kuzle", "Kůzle", [], "a tiny white kid goat jumping, no horns, clearly a baby goat"),
 ]),
 ("animals-3", [
  ("ovce", "Ovce", ["🐑"], "a fluffy white sheep with a dark face, standing, side view"),
  ("jehne", "Jehně", [], "a tiny fluffy white lamb, clearly a baby sheep"),
  ("prase", "Prase", ["🐷", "🐖"], "a pink pig standing, side view, curly tail, round snout"),
  ("sele", "Sele", [], "a tiny pink piglet, clearly a baby pig, curly tail"),
 ]),
 ("animals-4", [
  ("kun", "Kůň", ["🐴", "🐎"], "a brown horse with a dark mane standing, side view"),
  ("hribe", "Hříbě", [], "a small foal with very long thin legs, same brown, clearly a baby horse"),
  ("slepice", "Slepice", ["🐔"], "a brown hen standing, side view, small red comb"),
  ("kuratko", "Kuřátko", ["🐥", "🐤", "🐣"], "a tiny round fluffy yellow chick"),
 ]),
 ("animals-5", [
  ("kohout", "Kohout", ["🐓"], "a proud rooster with a big red comb and colorful long tail feathers, side view"),
  ("kachna", "Kachna", ["🦆"], "a mallard duck standing, side view, green head, yellow beak"),
  ("husa", "Husa", ["🪿"], "a white farm goose standing, long neck, orange beak"),
  ("zajic", "Zajíc", ["🐰", "🐇"], "a brown hare sitting, side view, long upright ears"),
 ]),
 ("animals-6", [
  ("jezek", "Ježek", ["🦔"], "a hedgehog, side view, brown spikes, small black nose"),
  ("liska", "Liška", ["🦊"], "a red fox standing, side view, big bushy tail with white tip"),
  ("medved", "Medvěd", ["🐻"], "a brown bear standing on four legs, side view"),
  ("jelen", "Jelen", ["🦌"], "a red deer stag standing, side view, big antlers"),
 ]),
 ("animals-7", [
  ("veverka", "Veverka", ["🐿️", "🐿"], "a red squirrel sitting holding a nut, big bushy tail"),
  ("sova", "Sova", ["🦉"], "a brown owl perched, front view, big round eyes, no clothes"),
  ("zaba", "Žába", ["🐸"], "a green frog sitting, front view, big eyes"),
  ("ryba", "Ryba", ["🐟", "🐠"], "a simple fish, side view, fins and tail, slate blue and ochre"),
 ]),
 ("animals-8", [
  ("motyl", "Motýl", ["🦋"], "a butterfly seen from above, wings spread, ochre and slate blue pattern"),
  ("vcela", "Včela", ["🐝"], "a round bee, side view, yellow and black stripes, small wings"),
  ("beruska", "Beruška", ["🐞"], "a ladybird seen from above, red with black dots"),
  ("snek", "Šnek", ["🐌"], "a snail, side view, spiral shell, two eye stalks"),
 ]),
 ("animals-9", [
  ("slon", "Slon", ["🐘"], "a grey elephant standing, side view, trunk and big ears"),
  ("zirafa", "Žirafa", ["🦒"], "a giraffe standing, side view, very long neck, brown patches"),
  ("lev", "Lev", ["🦁"], "a lion standing, side view, big shaggy mane"),
  ("opice", "Opice", ["🐒", "🐵"], "a brown monkey sitting, front view, long curly tail"),
 ]),
 ("mix-1", [
  ("zebra", "Zebra", ["🦓"], "a zebra standing, side view, black and white stripes"),
  ("tucnak", "Tučňák", ["🐧"], "a penguin standing, front view, black and white, orange feet"),
  ("balonek", "Balónek", ["🎈"], "a single round red balloon on a string"),
  ("strom", "Strom", ["🌳"], "a single round leafy deciduous tree with a brown trunk"),
 ]),
 ("body-1", [
  ("oko", "Oko", ["👁️", "👁", "👀"], "one human eye with eyelashes and an eyebrow, front view"),
  ("ucho", "Ucho", ["👂"], "one human ear, side view, simple"),
  ("nos", "Nos", ["👃"], "one human nose, side view, simple"),
  ("pusa", "Pusa", ["👄"], "a smiling mouth with pink lips, front view"),
 ]),
 ("body-2", [
  ("ruka", "Ruka", ["✋", "🖐️", "🖐", "👋"], "an open child's hand, palm forward, five fingers spread"),
  ("noha", "Noha", ["🦶", "🦵"], "a child's bare foot, side view, five toes"),
  ("zmrzlina", "Zmrzlina", ["🍦", "🍨"], "an ice cream cone with two scoops, pink and cream"),
  ("hrad", "Hrad", ["🏰"], "a small storybook castle with two round towers and a gate"),
 ]),
 ("food-1", [
  ("jablko", "Jablko", ["🍎", "🍏"], "a red apple with a leaf"),
  ("hruska", "Hruška", ["🍐"], "a yellow-green pear with a stalk"),
  ("banan", "Banán", ["🍌"], "a single yellow banana"),
  ("jahoda", "Jahoda", ["🍓"], "a red strawberry with green leaves"),
 ]),
 ("food-2", [
  ("tresne", "Třešně", ["🍒"], "two dark red cherries joined by stalks"),
  ("hrozny", "Hrozny", ["🍇"], "a bunch of green grapes"),
  ("mrkev", "Mrkev", ["🥕"], "an orange carrot with green leaves"),
  ("rajce", "Rajče", ["🍅"], "a round red tomato with a green stalk"),
 ]),
 ("food-3", [
  ("okurka", "Okurka", ["🥒"], "a green cucumber"),
  ("brambora", "Brambora", ["🥔"], "a brown potato"),
  ("chleb", "Chléb", ["🍞"], "a round Czech loaf of bread"),
  ("rohlik", "Rohlík", ["🥐"], "a Czech rohlik, a long crescent-shaped bread roll with poppy seeds"),
 ]),
 ("food-4", [
  ("mleko", "Mléko", ["🥛"], "a glass bottle of white milk next to a glass of milk"),
  ("syr", "Sýr", ["🧀"], "a wedge of yellow cheese with holes"),
  ("vajicko", "Vajíčko", ["🥚"], "a white hen's egg, whole"),
  ("buchta", "Buchta", [], "a Czech buchta: a square golden baked sweet bun dusted with sugar"),
 ]),
 ("toys-1", [
  ("mic", "Míč", [], "a colorful round play ball with stripes"),
  ("panenka", "Panenka", ["🪆"], "a toy doll with braids in a dress, standing"),
  ("kostky", "Kostky", [], "a small stack of wooden toy building blocks in different colors, plain faces"),
  ("auticko", "Autíčko", [], "a small wooden toy car with round wheels"),
 ]),
 ("toys-2", [
  ("plysak", "Plyšák", ["🧸"], "a plush teddy bear sitting"),
  ("kolo", "Kolo", ["🚲"], "a child's bicycle, side view"),
  ("kolobezka", "Koloběžka", ["🛴"], "a kick scooter, side view"),
  ("mesic", "Měsíc", ["🌙", "🌛", "🌜"], "a yellow crescent moon"),
 ]),
 ("vehicles-1", [
  ("auto", "Auto", ["🚗", "🚙"], "a red family car, side view"),
  ("autobus", "Autobus", ["🚌", "🚍"], "a yellow city bus, side view"),
  ("vlak", "Vlak", ["🚂", "🚆", "🚃"], "an old steam locomotive with one carriage, side view"),
  ("tramvaj", "Tramvaj", ["🚋", "🚊"], "a red-and-cream city tram, side view, pantograph on the roof"),
 ]),
 ("vehicles-2", [
  ("letadlo", "Letadlo", ["✈️", "✈", "🛩️"], "a small propeller airplane flying, side view"),
  ("lod", "Loď", ["🚢", "⛵"], "a sailing boat on a small wave, side view"),
  ("traktor", "Traktor", ["🚜"], "a green farm tractor, side view, big rear wheels"),
  ("hasicske-auto", "Hasičské auto", ["🚒"], "a red fire engine with a ladder, side view"),
 ]),
 ("vehicles-3", [
  ("sanitka", "Sanitka", ["🚑"], "a white ambulance van with a red stripe and a blue light, side view, no cross symbol and no lettering"),
  ("policejni-auto", "Policejní auto", ["🚓", "🚔"], "a white-and-blue police car with a blue light on the roof, side view, no lettering"),
  ("destnik", "Deštník", ["☂️", "☂", "☔"], "an open umbrella with a curved handle"),
  ("more", "Moře", ["🌊"], "a big curling blue sea wave"),
 ]),
 ("jobs-1", [
  ("hasic", "Hasič", ["🧑‍🚒", "👨‍🚒", "👩‍🚒"], "a firefighter in a dark uniform with a helmet holding a hose, full body"),
  ("lekar", "Lékař", ["🧑‍⚕️", "👨‍⚕️", "👩‍⚕️"], "a doctor in a white coat with a stethoscope, full body"),
  ("kuchar", "Kuchař", ["🧑‍🍳", "👨‍🍳", "👩‍🍳"], "a cook in a white chef's hat and apron holding a wooden spoon, full body"),
  ("zednik", "Zedník", ["👷"], "a bricklayer in a yellow hard hat holding a trowel next to a small brick wall, full body"),
 ]),
 ("jobs-2", [
  ("prodavacka", "Prodavačka", [], "a shop assistant woman in an apron holding a basket with bread and apples, full body"),
  ("ucitelka", "Učitelka", ["🧑‍🏫", "👩‍🏫", "👨‍🏫"], "a teacher woman with glasses holding a book and pointing at a small blank green chalkboard, full body"),
  ("slunce", "Slunce", ["☀️", "☀", "🌞"], "a round yellow sun with short rays"),
  ("dest", "Déšť", ["🌧️", "🌧"], "a grey cloud with blue raindrops falling"),
 ]),
 ("seasons", [
  ("jaro", "Jaro", [], "SPRING: a small young tree full of pink blossoms, little flowers in fresh grass at its foot"),
  ("leto", "Léto", ["🏖️", "🏖"], "SUMMER: the SAME small tree, now lush dark green with red apples, bright sun above"),
  ("podzim", "Podzim", [], "AUTUMN: the SAME small tree with orange and brown leaves, some leaves falling"),
  ("zima", "Zima", [], "WINTER: the SAME small tree, bare branches covered with snow, a small snowman next to it"),
 ]),
 ("weather-shapes", [
  ("snih", "Sníh", ["❄️", "❄", "🌨️"], "a large six-pointed white-and-pale-blue snowflake"),
  ("vitr", "Vítr", ["💨", "🌬️"], "a puffy cloud with a face blowing wind: curly wind lines and a few leaves flying"),
  ("kruh", "Kruh", [], "a plain flat CIRCLE shape, solid slate blue watercolor fill, ink outline, nothing else"),
  ("ctverec", "Čtverec", [], "a plain flat SQUARE shape, solid ochre watercolor fill, ink outline, nothing else"),
 ]),
 ("shapes-colors", [
  ("trojuhelnik", "Trojúhelník", ["🔺", "🔼"], "a plain flat TRIANGLE shape (equilateral), solid sage green watercolor fill, ink outline, nothing else"),
  ("hvezda", "Hvězda", ["⭐", "🌟"], "a plain flat five-pointed STAR shape, solid mustard yellow watercolor fill, ink outline, nothing else"),
  ("barva-cervena", "Červená kostka", ["🔴", "🟥"], "one plain wooden toy cube painted clearly RED all over, three-quarter view, no letters"),
  ("barva-zluta", "Žlutá kostka", ["🟡", "🟨"], "one plain wooden toy cube painted clearly YELLOW all over, three-quarter view, no letters"),
 ]),
 ("colors", [
  ("barva-zelena", "Zelená kostka", ["🟢", "🟩"], "one plain wooden toy cube painted clearly GREEN all over, three-quarter view, no letters"),
  ("barva-modra", "Modrá kostka", ["🔵", "🟦"], "one plain wooden toy cube painted clearly BLUE all over, three-quarter view, no letters"),
  ("barva-oranzova", "Oranžová kostka", ["🟠", "🟧"], "one plain wooden toy cube painted clearly ORANGE all over, three-quarter view, no letters"),
  ("barva-fialova", "Fialová kostka", ["🟣", "🟪"], "one plain wooden toy cube painted clearly deep VIOLET (bluish purple, not pink) all over, three-quarter view, no letters"),
 ]),
 # --- druhá dávka (10/2026): nejčastější emoji dětských otázek bez ilustrace -------------------
 ("nature-1", [
  ("kapka", "Kapka vody", ["💧"], "one big single blue water drop, teardrop shape"),
  ("smrk", "Smrk", ["🌲"], "a single dark green spruce tree, tall triangular shape, short brown trunk"),
  ("led", "Led", ["🧊"], "two pale blue translucent ice cubes"),
  ("ohen", "Oheň", ["🔥"], "a small campfire: orange and red flames over three crossed wooden logs"),
 ]),
 ("nature-2", [
  ("klicek", "Klíček", ["🌱"], "a tiny green seedling with two round leaves growing out of a small mound of brown soil"),
  ("hora", "Hora", ["🏔️", "🏔", "⛰️", "⛰", "🗻"], "one big mountain with a white snowy peak"),
  ("tulipan", "Tulipán", ["🌷"], "a single red tulip flower with a green stem and two leaves"),
  ("kamen", "Kámen", ["🪨"], "one big grey rounded stone"),
 ]),
 ("nature-3", [
  ("klasy", "Klasy", ["🌾"], "a small bundle of three golden wheat ears with long stalks"),
  ("listek", "Lísteček", ["🍃"], "one single fresh green leaf with veins"),
  ("vetvicka", "Větvička", ["🌿"], "a small green twig with several pairs of leaves"),
  ("kastan", "Kaštan", ["🌰"], "one shiny brown horse chestnut lying in half of its open spiky green shell"),
 ]),
 ("nature-4", [
  ("zemekoule", "Zeměkoule", ["🌍", "🌎", "🌏"], "the planet Earth seen from space: a round ball with blue seas and green-and-ochre continents, no stand"),
  ("snehulak", "Sněhulák", ["⛄", "☃️", "☃"], "a snowman made of three snowballs with a carrot nose, coal eyes, a small pot as a hat and twig arms"),
  ("mrak", "Mrak", ["☁️", "☁"], "one single fluffy white cloud"),
  ("pirko", "Pírko", ["🪶"], "one single soft light brown bird feather"),
 ]),
 ("animals-10", [
  ("mys", "Myš", ["🐭", "🐁"], "a small grey mouse, side view, round ears, long thin tail"),
  ("mravenec", "Mravenec", ["🐜"], "one ant, side view, dark brown, six legs, two antennae, drawn big"),
  ("zelva", "Želva", ["🐢"], "a tortoise walking, side view, olive green shell with a pattern"),
  ("ptacek", "Ptáček", ["🐦"], "a small songbird (a blue tit) standing, side view, blue cap and yellow belly, no branch"),
 ]),
 ("animals-11", [
  ("had", "Had", ["🐍"], "a friendly green snake coiled in a loose S shape, head raised"),
  ("lahvicka", "Lahvička", ["🍼"], "a baby feeding bottle with white milk and a rubber teat"),
  ("kostka-hraci", "Hrací kostka", ["🎲"], "one white game die (dice), three-quarter view, black dots on its faces"),
  ("med", "Med", ["🍯"], "a round clay honey pot full of golden honey with a wooden honey dipper"),
 ]),
 ("people-1", [
  ("dite", "Dítě", ["🧒"], "a small child about four years old standing, front view, t-shirt and trousers, full body"),
  ("holcicka", "Holčička", ["👧"], "a little girl with two pigtails in a dress, standing, front view, full body"),
  ("chlapec", "Chlapec", ["👦"], "a little boy in a t-shirt and shorts, standing, front view, full body"),
  ("dedecek", "Dědeček", ["👴"], "a grandfather with white hair, a white moustache and glasses, holding a walking stick, full body"),
 ]),
 ("people-2", [
  ("princezna", "Princezna", ["👸"], "a princess in a long dusty pink dress with a small golden crown, full body"),
  ("policista", "Policista", ["👮", "👮‍♂️", "👮‍♀️"], "a policeman in a dark blue uniform and a cap, full body, no badge lettering"),
  ("kadernice", "Kadeřnice", ["💇", "💇‍♀️", "💇‍♂️"], "a hairdresser woman holding scissors in one hand and a comb in the other, full body"),
  ("kosmonaut", "Kosmonaut", ["🧑‍🚀", "👨‍🚀", "👩‍🚀"], "an astronaut in a white spacesuit with a round helmet, full body, no flags or patches"),
 ]),
 ("people-3", [
  ("spi", "Spinká", ["😴", "💤"], "a small child sleeping peacefully on a pillow under a blanket, eyes closed"),
  ("bezi", "Běží", ["🏃", "🏃‍♂️", "🏃‍♀️"], "a child running fast, side view, mid-stride"),
  ("plavec", "Plavec", ["🏊", "🏊‍♂️", "🏊‍♀️"], "a child swimming in a small oval patch of blue water, head and one arm above the water"),
  ("stoji", "Stojí", ["🧍", "🧍‍♂️", "🧍‍♀️"], "a child standing perfectly still like a statue, arms straight down by the sides, front view"),
 ]),
 ("people-4", [
  ("cyklista", "Cyklista", ["🚴", "🚴‍♂️", "🚴‍♀️"], "a child riding a bicycle wearing a helmet, side view"),
  ("sval", "Silná ruka", ["💪"], "one flexed strong arm showing a big bicep"),
  ("vila", "Víla", ["🧚", "🧚‍♀️"], "a small fairy girl with transparent dragonfly wings holding a magic wand with a star on its tip"),
  ("zub", "Zub", ["🦷"], "one single white tooth with two roots, simple and clean"),
 ]),
 ("food-5", [
  ("bonbon", "Bonbon", ["🍬"], "one wrapped sweet with twisted wrapper ends"),
  ("cokolada", "Čokoláda", ["🍫"], "a bar of brown chocolate in squares, partly unwrapped from its paper, no lettering"),
  ("pizza", "Pizza", ["🍕"], "one triangular slice of pizza with tomato, cheese and salami"),
  ("susenka", "Sušenka", ["🍪"], "one round cookie with chocolate chips"),
 ]),
 ("food-6", [
  ("polevka", "Polévka", ["🍲", "🥣"], "a bowl of hot soup with a spoon in it and a little steam"),
  ("hrnek", "Hrnek čaje", ["☕"], "a cup of hot tea on a saucer with a little steam"),
  ("citron", "Citron", ["🍋"], "one yellow lemon with a leaf"),
  ("pomeranc", "Pomeranč", ["🍊"], "one round orange fruit with a small leaf"),
 ]),
 ("food-7", [
  ("dort", "Dort", ["🎂", "🍰"], "a round birthday cake with pink icing and three lit candles"),
  ("panev", "Smažené vajíčko", ["🍳"], "a black frying pan with one fried egg in it, seen from above at an angle"),
  ("lzice", "Lžíce", ["🥄"], "one silver spoon"),
  ("talir", "Talíř", ["🍽️", "🍽"], "one empty round white plate, seen from slightly above"),
 ]),
 ("home-1", [
  ("dum", "Dům", ["🏠", "🏡"], "a small house with a red tiled roof, a chimney, a door and two windows, front view"),
  ("skola", "Škola", ["🏫"], "a small school building with a little bell tower on the roof, many windows and a door, no clock face and no lettering"),
  ("kosik", "Košík", ["🧺"], "an empty wicker basket with a handle"),
  ("kyblik", "Kyblík", ["🪣"], "a child's sand bucket with a handle"),
 ]),
 ("home-2", [
  ("mydlo", "Mýdlo", ["🧼"], "a bar of soap with a few soap bubbles"),
  ("zarovka", "Žárovka", ["💡"], "one glowing light bulb"),
  ("budik", "Budík", ["⏰"], "an old alarm clock with two bells on top, the dial has only two hands and short tick marks, no numbers"),
  ("telefon", "Telefon", ["📞", "☎️", "☎"], "an old-fashioned rotary telephone with its handset"),
 ]),
 ("clothes-1", [
  ("rukavice", "Rukavice", ["🧤"], "a pair of knitted winter mittens"),
  ("ponozky", "Ponožky", ["🧦"], "a pair of striped socks"),
  ("sala", "Šála", ["🧣"], "one long knitted winter scarf with fringes"),
  ("boty", "Boty", ["👟"], "a pair of children's sneakers, side view"),
 ]),
 ("clothes-2", [
  ("holinky", "Holínky", ["👢"], "a pair of rubber boots"),
  ("batoh", "Batoh", ["🎒"], "a children's school backpack with two straps"),
  ("tricko", "Tričko", ["👕"], "one t-shirt, front view, plain without print"),
  ("bunda", "Bunda", ["🧥"], "one warm winter jacket with a hood and a zip, front view"),
 ]),
 ("music-1", [
  ("noty", "Noty", ["🎵", "🎶", "🎼"], "two joined musical eighth notes, drawn big"),
  ("buben", "Bubínek", ["🥁"], "a toy drum with two drumsticks"),
  ("trumpeta", "Trumpeta", ["🎺"], "a brass trumpet, side view"),
  ("housle", "Housle", ["🎻"], "a violin with its bow"),
 ]),
 ("music-2", [
  ("kytara", "Kytara", ["🎸"], "an acoustic guitar"),
  ("klavir", "Klavír", ["🎹"], "a small upright piano, front view, black and white keys"),
  ("televize", "Televize", ["📺"], "an old television set with an antenna and a blank grey screen"),
  ("koruna", "Koruna", ["👑"], "a golden king's crown"),
 ]),
 ("sport-1", [
  ("fotbalovy-mic", "Fotbalový míč", ["⚽"], "a black-and-white football (soccer ball)"),
  ("basketbalovy-mic", "Basketbalový míč", ["🏀"], "an orange basketball with black lines"),
  ("tenis", "Tenis", ["🎾"], "a tennis racket with a yellow tennis ball next to it"),
  ("hokejka", "Hokejka", ["🏒"], "an ice hockey stick with a black puck"),
 ]),
 ("sport-2", [
  ("branka", "Branka", ["🥅"], "a football goal with a white net, front view"),
  ("brusle", "Brusle", ["⛸️", "⛸"], "one ice skate boot with a blade, side view"),
  ("sane", "Sáňky", ["🛷"], "a wooden sled, side view"),
  ("pohar", "Pohár", ["🏆"], "a golden trophy cup with two handles"),
 ]),
 ("toys-3", [
  ("drak", "Drak", ["🪁"], "a diamond-shaped flying kite with a long tail of little bows"),
  ("puzzle", "Puzzle", ["🧩"], "one single jigsaw puzzle piece"),
  ("vanocni-stromek", "Vánoční stromek", ["🎄"], "a small Christmas tree with red baubles and a star on top"),
  ("paleta", "Malířská paleta", ["🎨"], "a wooden painter's palette with blobs of paint and a brush"),
 ]),
 ("things-1", [
  ("kladivo", "Kladivo", ["🔨"], "a hammer with a wooden handle"),
  ("cihly", "Cihly", ["🧱"], "a small stack of red bricks"),
  ("knihy", "Knížky", ["📚"], "a stack of three closed books with plain covers, no lettering"),
  ("lupa", "Lupa", ["🔍", "🔎"], "a magnifying glass with a wooden handle"),
 ]),
 ("things-2", [
  ("vahy", "Váhy", ["⚖️", "⚖"], "an old balance scale with two pans hanging level"),
  ("sipka-nahoru", "Šipka nahoru", ["⬆️", "⬆"], "one thick brick red arrow pointing straight UP"),
  ("sipka-dolu", "Šipka dolů", ["⬇️", "⬇"], "one thick brick red arrow pointing straight DOWN"),
  ("sipka-vpravo", "Šipka doprava", ["➡️", "➡"], "one thick brick red arrow pointing straight to the RIGHT"),
 ]),
 # Tečky na kostkách 1–10 (počítání): neskládá model, ale tools/dots.py z předlohy dots-base
 # (prázdná stěna kostky + puntíky), aby počet seděl přesně. 7–10 = dvě kostky vedle sebe.
 ("dots-1", [
  ("tecky-1", "Jedna tečka", ["1️⃣"], "dots:1"),
  ("tecky-2", "Dvě tečky", ["2️⃣"], "dots:2"),
  ("tecky-3", "Tři tečky", ["3️⃣"], "dots:3"),
  ("tecky-4", "Čtyři tečky", ["4️⃣"], "dots:4"),
 ]),
 ("dots-2", [
  ("tecky-5", "Pět teček", ["5️⃣"], "dots:5"),
  ("tecky-6", "Šest teček", ["6️⃣"], "dots:6"),
  ("tecky-7", "Sedm teček", ["7️⃣"], "dots:5+2"),
  ("tecky-8", "Osm teček", ["8️⃣"], "dots:4+4"),
 ]),
 ("dots-3", [
  ("tecky-9", "Devět teček", ["9️⃣"], "dots:5+4"),
  ("tecky-10", "Deset teček", ["🔟"], "dots:5+5"),
 ]),
]

# Předloha pro tools/dots.py (generuje ji model, do slovníku nepatří).
DOTS_BASE = ("dots-base", [
  "one blank face of a wooden toy die: a flat square cream tile with softly rounded corners, front view, completely empty",
  "one single round dark brown painted dot, like a pip on a die, drawn big",
  "one single round dark brown painted dot, like a pip on a die, drawn big, slightly different hand-painted edge",
  "one single round dark brown painted dot, like a pip on a die, drawn big, slightly irregular",
])

COLOR_GRIDS = {"shapes-colors", "colors"}

QUADS = ("top-left", "top-right", "bottom-left", "bottom-right")

def grid_job(gid, subjects):
    """Úloha pro tools/gen-batch.py: mřížka 2×2 na purpurové se stylovou předlohou."""
    brief = "; ".join(f"{n + 1}) {QUADS[n]}: {s}" for n, s in enumerate(subjects))
    return {"id": f"pics-{gid}", "out": f"originals/pics/{gid}.png", "kind": "grid", "pics": True,
            "ref_kind": "style", "refs": ["originals/grids/themes-2.png"], "prompt": f"Four subjects: {brief}."}

def sync_jobs(out):
    """Doplní do prompts.json chybějící úlohy pics-* (existující nechá, ať se nemění jejich prompt)."""
    path = Path(__file__).resolve().parent.parent / "prompts.json"
    cfg = json.loads(path.read_text(encoding="utf-8"))
    have = {j["id"] for j in cfg["jobs"]}
    wanted = [grid_job(g["grid"], [i["subject"] for i in g["items"]]) for g in out if not g.get("compose")]
    wanted.append(grid_job(*DOTS_BASE))
    added = [j for j in wanted if j["id"] not in have]
    if added:
        cfg["jobs"] += added
        path.write_text(json.dumps(cfg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return len(added)

if __name__ == "__main__":
    out = []
    for gid, items in G:
        compose = gid.startswith("dots-")
        assert len(items) == 4 or (compose and 0 < len(items) < 4), gid
        g = {"grid": gid, "key": "distance" if gid in COLOR_GRIDS else "magenta",
             "items": [{"key": k, "alt": a, "emoji": e, "subject": s} for k, a, e, s in items]}
        if compose:
            g["compose"] = "dots"
        out.append(g)
    keys = [i["key"] for g in out for i in g["items"]]
    assert len(keys) == len(set(keys)), [x for x in keys if keys.count(x) > 1]
    em = [e for g in out for i in g["items"] for e in i["emoji"]]
    assert len(em) == len(set(em)), [x for x in em if em.count(x) > 1]
    Path(__file__).resolve().parent.parent.joinpath("pics.json").write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(len(out), "mřížek,", len(keys), "obrázků,", len(em), "emoji,", sync_jobs(out), "nových úloh v prompts.json")
