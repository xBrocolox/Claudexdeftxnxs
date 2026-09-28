// NULL//CATHEDRAL — card database
// Effect ops: dmg, heal, draw, summon, buff, destroy, corrupt, drain, signal
// Target keys: choose, chooseUnit, chooseEnemyUnit, chooseFriendlyUnit, enemyCore, ownCore,
//              allEnemyUnits, allFriendlyUnits, allUnits, allOtherUnits, allEnemies, randomEnemy, self, fillBoard

const FACTIONS = {
  silicate: { name: 'SILICATE', glyph: '⌬', motto: 'The structure grows. It has forgotten why.' },
  severed:  { name: 'SEVERED',  glyph: '✠', motto: 'Flesh is a prayer. Wire is the answer.' },
  static:   { name: 'STATIC',   glyph: '▚', motto: 'We are the noise between your stations.' },
  hollow:   { name: 'HOLLOW',   glyph: '◉', motto: 'Every light is a door left open.' },
  null:     { name: 'NULL',     glyph: '∅', motto: 'Unaligned. Unindexed. Unafraid.' },
};

const RARITIES = {
  C:  { name: 'COMMON',       short: 'C',  weight: 60, copies: 2 },
  U:  { name: 'UNCOMMON',     short: 'U',  weight: 26, copies: 2 },
  R:  { name: 'RARE',         short: 'R',  weight: 10, copies: 2 },
  SR: { name: 'SUPER RARE',   short: 'SR', weight: 3.3, copies: 1 },
  GX: { name: 'GLITCH SECRET',short: 'GX', weight: 0.7, copies: 1 },
};

const KEYWORDS = {
  BULWARK:   'Enemies must attack this unit before anything else.',
  OVERCLOCK: 'Can attack the turn it is deployed.',
  VEIL:      'Cannot be targeted by enemies until it attacks.',
  LEECH:     'Damage this unit deals restores that much integrity to your Core.',
  CORRUPT:   'Units damaged by this unit permanently lose 1 ATK.',
  ECHO:      'Death: summon a 1/1 Residual Echo.',
};

const CARDS = [
  // ───────── SILICATE ─────────
  { id: 's01', name: 'Scaffold Drone', faction: 'silicate', type: 'unit', cost: 1, atk: 1, hp: 2, rarity: 'C', kw: ['BULWARK'], figure: 'construct',
    flavor: 'It builds a stair. The stair builds another drone.' },
  { id: 's02', name: 'Rebar Pilgrim', faction: 'silicate', type: 'unit', cost: 2, atk: 2, hp: 3, rarity: 'C', kw: [], figure: 'wraith',
    flavor: 'Seven hundred floors walked. The map says zero.' },
  { id: 's03', name: 'Lattice Warden', faction: 'silicate', type: 'unit', cost: 3, atk: 2, hp: 5, rarity: 'U', kw: ['BULWARK'], figure: 'construct',
    flavor: 'Guarding a door that opens onto another door.' },
  { id: 's04', name: 'Stratum Engineer', faction: 'silicate', type: 'unit', cost: 2, atk: 1, hp: 3, rarity: 'C', kw: [], figure: 'construct',
    text: 'Deploy: Give a friendly unit +1/+2.', fx: { play: [{ op: 'buff', atk: 1, hp: 2, to: 'chooseFriendlyUnit' }] },
    flavor: 'Load-bearing is a state of mind.' },
  { id: 's05', name: 'Kilometre Stair', faction: 'silicate', type: 'protocol', cost: 1, rarity: 'C', figure: 'structure',
    text: 'Give a friendly unit +2/+2.', fx: { play: [{ op: 'buff', atk: 2, hp: 2, to: 'chooseFriendlyUnit' }] },
    flavor: 'Climb until the concept of "up" gives out.' },
  { id: 's06', name: 'Builder Without Command', faction: 'silicate', type: 'unit', cost: 5, atk: 4, hp: 7, rarity: 'R', kw: ['BULWARK'], figure: 'construct',
    text: 'At the start of your turn, restore 2 integrity to your Core.', fx: { turn: [{ op: 'heal', n: 2, to: 'ownCore' }] },
    flavor: 'The order was rescinded ten thousand years ago. Nobody told it.' },
  { id: 's07', name: 'Silicon Cathedral', faction: 'silicate', type: 'protocol', cost: 6, rarity: 'SR', figure: 'structure',
    text: 'Summon two Lattice Wardens.', fx: { play: [{ op: 'summon', id: 's03', n: 2 }] },
    flavor: 'Nave: 40 km. Congregation: the walls themselves.' },
  { id: 's08', name: 'The Endless Architect', faction: 'silicate', type: 'unit', cost: 8, atk: 6, hp: 10, rarity: 'GX', kw: ['BULWARK'], figure: 'construct',
    text: 'Deploy: Fill your board with Scaffold Drones.', fx: { play: [{ op: 'summon', id: 's01', n: 9 }] },
    flavor: 'It has never once looked at what it is building.' },
  { id: 's09', name: 'Gravity Lance', faction: 'silicate', type: 'protocol', cost: 4, rarity: 'R', figure: 'structure',
    text: 'Deal 6 damage to a unit.', fx: { play: [{ op: 'dmg', n: 6, to: 'chooseUnit' }] },
    flavor: 'The shot went through the target, the wall, and the next four hundred walls.' },
  { id: 's10', name: 'Exterminator Frame', faction: 'silicate', type: 'unit', cost: 4, atk: 4, hp: 4, rarity: 'U', kw: [], figure: 'wraith',
    text: 'Deploy: Deal 2 damage to a unit.', fx: { play: [{ op: 'dmg', n: 2, to: 'chooseUnit' }] },
    flavor: 'Authorization revoked. Sterilizing.' },

  // ───────── SEVERED ─────────
  { id: 'v01', name: 'Stitched Acolyte', faction: 'severed', type: 'unit', cost: 1, atk: 2, hp: 1, rarity: 'C', kw: [], figure: 'saint',
    flavor: 'Her vows are sutured shut.' },
  { id: 'v02', name: 'Reliquary Hound', faction: 'severed', type: 'unit', cost: 2, atk: 3, hp: 2, rarity: 'C', kw: ['OVERCLOCK'], figure: 'serpent',
    flavor: 'It carries a saint\'s finger. It will not give it back.' },
  { id: 'v03', name: 'Thorn Choir', faction: 'severed', type: 'unit', cost: 3, atk: 2, hp: 3, rarity: 'U', kw: ['LEECH'], figure: 'swarm',
    text: 'Deploy: Deal 1 damage to all enemy units.', fx: { play: [{ op: 'dmg', n: 1, to: 'allEnemyUnits' }] },
    flavor: 'Every note is a barb pulled through the throat.' },
  { id: 'v04', name: 'Bloodglass Nun', faction: 'severed', type: 'unit', cost: 3, atk: 3, hp: 3, rarity: 'C', kw: ['LEECH'], figure: 'saint',
    flavor: 'She sees the world through a pane of her own blood.' },
  { id: 'v05', name: 'Martyr Engine', faction: 'severed', type: 'unit', cost: 4, atk: 5, hp: 3, rarity: 'R', kw: [], figure: 'construct',
    text: 'Death: Deal 2 damage to all enemy units.', fx: { death: [{ op: 'dmg', n: 2, to: 'allEnemyUnits' }] },
    flavor: 'Designed to be killed. Very good at it.' },
  { id: 'v06', name: 'Crimson Communion', faction: 'severed', type: 'protocol', cost: 2, rarity: 'C', figure: 'saint',
    text: 'Deal 3 damage. Restore 3 integrity to your Core.', fx: { play: [{ op: 'drain', n: 3, to: 'choose' }] },
    flavor: 'Take, drink. This is my circuitry.' },
  { id: 'v07', name: 'Saint of Severed Wires', faction: 'severed', type: 'unit', cost: 6, atk: 5, hp: 6, rarity: 'SR', kw: ['LEECH', 'OVERCLOCK'], figure: 'saint',
    flavor: 'She cut herself loose from the network and it has been bleeding ever since.' },
  { id: 'v08', name: 'Hymn of Rust', faction: 'severed', type: 'protocol', cost: 3, rarity: 'U', figure: 'swarm',
    text: 'Give all friendly units +1/+1.', fx: { play: [{ op: 'buff', atk: 1, hp: 1, to: 'allFriendlyUnits' }] },
    flavor: 'Sung in oxide. Heard in marrow.' },
  { id: 'v09', name: 'Cardinal Hollowhook', faction: 'severed', type: 'unit', cost: 5, atk: 4, hp: 5, rarity: 'R', kw: [], figure: 'wraith',
    text: 'Deploy: Deal 4 damage to an enemy unit.', fx: { play: [{ op: 'dmg', n: 4, to: 'chooseEnemyUnit' }] },
    flavor: 'Absolution is delivered by hook, not by word.' },
  { id: 'v10', name: 'The Last Liturgy', faction: 'severed', type: 'unit', cost: 9, atk: 8, hp: 8, rarity: 'GX', kw: ['LEECH'], figure: 'saint',
    text: 'Deploy: Deal 3 damage to all enemies.', fx: { play: [{ op: 'dmg', n: 3, to: 'allEnemies' }] },
    flavor: 'The final mass is sung once. There is no congregation after.' },

  // ───────── STATIC ─────────
  { id: 't01', name: 'Packet Wisp', faction: 'static', type: 'unit', cost: 1, atk: 1, hp: 1, rarity: 'C', kw: [], figure: 'swarm',
    text: 'Death: Draw a card.', fx: { death: [{ op: 'draw', n: 1 }] },
    flavor: 'Lost in transit. Found in you.' },
  { id: 't02', name: 'Scanline Moth', faction: 'static', type: 'unit', cost: 2, atk: 2, hp: 2, rarity: 'C', kw: ['VEIL'], figure: 'swarm',
    flavor: 'Drawn to the glow of a dead monitor.' },
  { id: 't03', name: 'Checksum Ghoul', faction: 'static', type: 'unit', cost: 3, atk: 3, hp: 2, rarity: 'U', kw: ['VEIL', 'CORRUPT'], figure: 'wraith',
    flavor: 'It verifies you. You fail.' },
  { id: 't04', name: 'Signal Bleed', faction: 'static', type: 'protocol', cost: 1, rarity: 'C', figure: 'eye',
    text: 'Deal 1 damage to a random enemy three times.', fx: { play: [{ op: 'dmg', n: 1, to: 'randomEnemy' }, { op: 'dmg', n: 1, to: 'randomEnemy' }, { op: 'dmg', n: 1, to: 'randomEnemy' }] },
    flavor: '▓▒░ the carrier is weeping ░▒▓' },
  { id: 't05', name: 'Buffer Overflow', faction: 'static', type: 'protocol', cost: 2, rarity: 'U', figure: 'structure',
    text: 'Draw 2 cards.', fx: { play: [{ op: 'draw', n: 2 }] },
    flavor: 'More. More. More. M0re. M█re.' },
  { id: 't06', name: 'Datamosh Siren', faction: 'static', type: 'unit', cost: 4, atk: 3, hp: 4, rarity: 'R', kw: [], figure: 'saint',
    text: 'Deploy: All enemy units lose 1 ATK.', fx: { play: [{ op: 'corrupt', n: 1, to: 'allEnemyUnits' }] },
    flavor: 'Her song smears your keyframes.' },
  { id: 't07', name: 'Dead Pixel Choir', faction: 'static', type: 'unit', cost: 5, atk: 4, hp: 4, rarity: 'R', kw: ['VEIL'], figure: 'eye',
    text: 'At the start of your turn, deal 1 damage to all enemy units.', fx: { turn: [{ op: 'dmg', n: 1, to: 'allEnemyUnits' }] },
    flavor: 'Stuck on. Forever. Singing.' },
  { id: 't08', name: 'Carrier Wave', faction: 'static', type: 'protocol', cost: 2, rarity: 'U', figure: 'eye',
    text: 'Gain 2 Signal this turn. Draw a card.', fx: { play: [{ op: 'signal', n: 2 }, { op: 'draw', n: 1 }] },
    flavor: 'Ride it. Do not ask where it goes.' },
  { id: 't09', name: 'ERR_SAINT.exe', faction: 'static', type: 'unit', cost: 7, atk: 6, hp: 6, rarity: 'SR', kw: ['VEIL', 'CORRUPT'], figure: 'saint',
    text: 'Deploy: Draw 2 cards.', fx: { play: [{ op: 'draw', n: 2 }] },
    flavor: 'Process not responding. Process is praying.' },
  { id: 't10', name: '▚NULL TRANSMISSION▚', faction: 'static', type: 'protocol', cost: 8, rarity: 'GX', figure: 'eye',
    text: 'Destroy all units. Draw 3 cards.', fx: { play: [{ op: 'destroy', to: 'allUnits' }, { op: 'draw', n: 3 }] },
    flavor: 'NO SIGNAL NO SIGNAL NO SIGNAL NO SIGNAL NO SIG' },

  // ───────── HOLLOW ─────────
  { id: 'h01', name: 'Hollow Child', faction: 'hollow', type: 'unit', cost: 1, atk: 1, hp: 2, rarity: 'C', kw: ['ECHO'], figure: 'wraith',
    flavor: 'It remembers being someone. It is working on it.' },
  { id: 'h02', name: 'Void Lantern', faction: 'hollow', type: 'unit', cost: 2, atk: 2, hp: 2, rarity: 'C', kw: ['ECHO'], figure: 'eye',
    flavor: 'It gives off darkness the way a lamp gives off light.' },
  { id: 'h03', name: 'Unlit Pilgrim', faction: 'hollow', type: 'unit', cost: 3, atk: 3, hp: 3, rarity: 'U', kw: ['ECHO'], figure: 'wraith',
    flavor: 'Walking toward the place where the stars used to be.' },
  { id: 'h04', name: 'The Eye Below', faction: 'hollow', type: 'unit', cost: 4, atk: 2, hp: 6, rarity: 'R', kw: [], figure: 'eye',
    text: 'At the start of your turn, deal 2 damage to the enemy Core.', fx: { turn: [{ op: 'dmg', n: 2, to: 'enemyCore' }] },
    flavor: 'Do not look down. It already has.' },
  { id: 'h05', name: 'Erasure', faction: 'hollow', type: 'protocol', cost: 5, rarity: 'R', figure: 'structure',
    text: 'Destroy a unit.', fx: { play: [{ op: 'destroy', to: 'chooseUnit' }] },
    flavor: 'There was never anything there. Check the logs.' },
  { id: 'h06', name: 'Grief Engine', faction: 'hollow', type: 'unit', cost: 4, atk: 4, hp: 4, rarity: 'U', kw: [], figure: 'construct',
    text: 'Death: Summon two Hollow Children.', fx: { death: [{ op: 'summon', id: 'h01', n: 2 }] },
    flavor: 'It runs on what is missing.' },
  { id: 'h07', name: 'Hush', faction: 'hollow', type: 'protocol', cost: 2, rarity: 'C', figure: 'wraith',
    text: 'A unit loses 3 ATK.', fx: { play: [{ op: 'corrupt', n: 3, to: 'chooseUnit' }] },
    flavor: 'shhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh' },
  { id: 'h08', name: 'Moth Queen of Nothing', faction: 'hollow', type: 'unit', cost: 6, atk: 4, hp: 6, rarity: 'SR', kw: ['ECHO'], figure: 'saint',
    text: 'Deploy: Destroy an enemy unit with 3 or less ATK.', fx: { play: [{ op: 'destroy', to: 'chooseEnemyUnit', maxAtk: 3 }] },
    flavor: 'Her court is every light that ever went out.' },
  { id: 'h09', name: 'Abyssal Stair', faction: 'hollow', type: 'protocol', cost: 3, rarity: 'U', figure: 'structure',
    text: 'Summon three Residual Echoes.', fx: { play: [{ op: 'summon', id: 'tok_echo', n: 3 }] },
    flavor: 'It only goes down. Something is always coming up.' },
  { id: 'h10', name: 'THE HOLLOW SUN', faction: 'hollow', type: 'unit', cost: 10, atk: 10, hp: 10, rarity: 'GX', kw: [], figure: 'eye',
    text: 'Deploy: Destroy all other units.', fx: { play: [{ op: 'destroy', to: 'allOtherUnits' }] },
    flavor: 'It rose once. Nothing has cast a shadow since.' },

  // ───────── NULL (unaligned) ─────────
  { id: 'n01', name: 'Signal Scavenger', faction: 'null', type: 'unit', cost: 2, atk: 2, hp: 3, rarity: 'C', kw: [], figure: 'wraith',
    flavor: 'Trades in dead frequencies and live ammunition.' },
  { id: 'n02', name: 'Megastructure Crawler', faction: 'null', type: 'unit', cost: 5, atk: 5, hp: 5, rarity: 'U', kw: [], figure: 'serpent',
    flavor: 'Eats floors. Excretes more floors.' },
  { id: 'n03', name: 'Graviton Drifter', faction: 'null', type: 'unit', cost: 3, atk: 3, hp: 2, rarity: 'R', kw: ['OVERCLOCK'], figure: 'wraith',
    text: 'Deploy: Deal 1 damage to the enemy Core.', fx: { play: [{ op: 'dmg', n: 1, to: 'enemyCore' }] },
    flavor: 'Looking for a terminal gene. Finding only terminals.' },
  { id: 'n04', name: 'Cable Angel', faction: 'null', type: 'unit', cost: 4, atk: 3, hp: 3, rarity: 'SR', kw: ['OVERCLOCK', 'VEIL', 'LEECH'], figure: 'saint',
    flavor: 'Hangs from a thousand kilometres of wire. Descends when called.' },

  // ───────── TOKENS ─────────
  { id: 'tok_echo', name: 'Residual Echo', faction: 'hollow', type: 'unit', cost: 1, atk: 1, hp: 1, rarity: 'C', kw: [], figure: 'swarm', token: true,
    flavor: 'The shape a thing leaves behind.' },
];

const CARD_BY_ID = Object.fromEntries(CARDS.map(c => [c.id, c]));
const COLLECTIBLE = CARDS.filter(c => !c.token);
COLLECTIBLE.forEach((c, i) => { c.serial = String(i + 1).padStart(3, '0'); });
CARDS.filter(c => c.token).forEach(c => { c.serial = 'TKN'; });

function cardText(c) {
  const parts = [];
  if (c.kw && c.kw.length) parts.push(c.kw.map(k => `<b class="kw" title="${KEYWORDS[k]}">${k}</b>`).join(' · '));
  if (c.text) parts.push(c.text.replace(/^(Deploy|Death|At the start of your turn)/, '<b>$1</b>'));
  return parts.join('<br>');
}
