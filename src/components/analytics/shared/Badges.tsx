/**
 * Storenamen zijn vrij invulbaar, dus geen vaste kleurenlijst — we leiden een
 * stabiele tint af uit de naam zelf zodat dezelfde store altijd dezelfde
 * kleur krijgt.
 */
const TONE_COUNT = 7;

const hashString = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) % 100000;
  }
  return hash;
};

export function StoreBadge({ store }: { store: string }) {
  const tone = hashString(store) % TONE_COUNT;
  return <span className={`analytics-badge tone-${tone}`}>{store}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, number> = {
    afgeleverd: 1,
    verzonden: 4,
    gepickt: 0,
    openstaand: 6,
    geannuleerd: 5,
    geretourneerd: 2,
  };
  const tone = map[String(status).toLowerCase()] ?? 6;
  return <span className={`analytics-badge tone-${tone}`}>{status}</span>;
}