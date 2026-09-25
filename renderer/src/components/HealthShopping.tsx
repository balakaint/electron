import { useEffect, useState } from 'react';
import { ArrowLeft, Check, Copy, Plus, Printer, X } from 'lucide-react';
import { HealthShopping as Shopping, healthApi } from '../services/api';
import { useL } from '../i18n';
import { RADIUS, SPACE } from '../spacing';
import { TRACKING, TYPE_SIZE, TYPE_WEIGHT } from '../typography';

// Health › Shopping list. Built by the engine from the week's meals as
// they are planned right now, so editing a meal changes the list. Only
// ticks and hand-added items are stored, per week. Print goes through a
// throwaway iframe holding just the list, so the page prints clean.

const label: React.CSSProperties = { fontSize: TYPE_SIZE.xs, fontWeight: TYPE_WEIGHT.bold, letterSpacing: TRACKING.wide };
const card: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: RADIUS.card,
  padding: SPACE.lg,
  display: 'flex',
  flexDirection: 'column',
  gap: SPACE.md,
};
const btn: React.CSSProperties = {
  height: 28,
  padding: `0 ${SPACE.md}px`,
  fontSize: TYPE_SIZE.xs,
  border: '1px solid var(--border)',
  borderRadius: RADIUS.control,
  background: 'var(--surface)',
  color: 'var(--text)',
  display: 'inline-flex',
  alignItems: 'center',
  gap: SPACE.xs,
  cursor: 'pointer',
};
const input: React.CSSProperties = {
  height: 28,
  fontSize: TYPE_SIZE.sm,
  border: '1px solid var(--border)',
  borderRadius: RADIUS.control,
  background: 'var(--surface)',
  color: 'var(--text)',
  padding: `0 ${SPACE.sm}px`,
  minWidth: 0,
};
const muted: React.CSSProperties = { fontSize: TYPE_SIZE.xs, color: 'var(--text-muted)' };

const addDays = (d: string, n: number) => {
  const x = new Date(`${d}T00:00:00`);
  x.setDate(x.getDate() + n);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
const shortDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);

export default function HealthShopping({ onBack }: { onBack: () => void }) {
  const L = useL();
  const [s, setS] = useState<Shopping | null>(null);
  const [thisWeek, setThisWeek] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [qty, setQty] = useState('');
  const [copied, setCopied] = useState(false);

  const groupName: Record<string, string> = {
    protein: L('PROTEIN', 'প্রোটিন'),
    grains: L('GRAINS', 'শস্য'),
    vegetables: L('VEGETABLES', 'সবজি'),
    fruit_nuts: L('FRUIT & NUTS', 'ফল ও বাদাম'),
    other: L('OTHER', 'অন্যান্য'),
    added: L('ADDED BY YOU', 'আপনার যোগ করা'),
  };

  const run = (p: Promise<Shopping>) =>
    p
      .then((x) => {
        setS(x);
        setError('');
      })
      .catch((e) => setError(String(e?.message ?? e)));

  useEffect(() => {
    healthApi
      .shopping()
      .then((x) => {
        setS(x);
        setThisWeek(x.week);
      })
      .catch(() => setError(L("Couldn't load the list.", 'তালিকা লোড হয়নি।')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!s || !thisWeek) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.md }}>
        <button onClick={onBack} style={{ ...btn, alignSelf: 'flex-start' }}>
          <ArrowLeft size={14} /> {L('Back to week', 'সপ্তাহে ফিরুন')}
        </button>
        <span style={muted}>{error || L('Loading…', 'লোড হচ্ছে…')}</span>
      </div>
    );
  }

  const nextWeek = addDays(thisWeek, 7);
  const onNext = s.week === nextWeek;
  const title = L(`Week ${s.plan_week} · ${shortDate(s.week)} – ${shortDate(s.end)}`, `সপ্তাহ ${s.plan_week} · ${shortDate(s.week)} – ${shortDate(s.end)}`);

  const asText = () =>
    [L('Shopping list', 'বাজারের তালিকা') + ' — ' + title, '']
      .concat(
        s.groups.flatMap((g) => [
          groupName[g.group] ?? g.group,
          ...g.items.map((it) => `${it.bought ? '[x]' : '[ ]'} ${it.name}${it.qty ? ` — ${it.qty}` : ''}`),
          '',
        ])
      )
      .join('\n');

  const print = () => {
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(L('Shopping list', 'বাজারের তালিকা'))}</title>
<style>body{font:14px system-ui,sans-serif;margin:32px;color:#111}h1{font-size:24px;margin:0 0 4px}p{color:#555;margin:0 0 16px}
h2{font-size:12px;letter-spacing:1px;margin:16px 0 4px}li{list-style:none;padding:4px 0;border-bottom:1px solid #eee;display:flex;gap:8px}
ul{padding:0;margin:0}.b{text-decoration:line-through;color:#888}.q{margin-left:auto;color:#555}</style></head><body>
<h1>${esc(L('Shopping list', 'বাজারের তালিকা'))}</h1><p>${esc(title)}</p>
${s.groups
  .map(
    (g) =>
      `<h2>${esc(groupName[g.group] ?? g.group)}</h2><ul>${g.items
        .map((it) => `<li class="${it.bought ? 'b' : ''}">${it.bought ? '☑' : '☐'} ${esc(it.name)}<span class="q">${esc(it.qty)}</span></li>`)
        .join('')}</ul>`
  )
  .join('')}
</body></html>`;
    const frame = document.createElement('iframe');
    frame.style.position = 'fixed';
    frame.style.width = '0';
    frame.style.height = '0';
    frame.style.border = '0';
    document.body.appendChild(frame);
    const doc = frame.contentDocument;
    if (!doc || !frame.contentWindow) {
      frame.remove();
      return;
    }
    doc.open();
    doc.write(html);
    doc.close();
    frame.contentWindow.focus();
    frame.contentWindow.print();
    setTimeout(() => frame.remove(), 1000);
  };

  const copy = () =>
    navigator.clipboard
      .writeText(asText())
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => setError(L("Couldn't copy.", 'কপি হয়নি।')));

  const add = () => {
    if (!name.trim()) return;
    run(healthApi.addShopItem(s.week, name, qty)).then(() => {
      setName('');
      setQty('');
    });
  };

  const tab = (on: boolean): React.CSSProperties => ({
    ...btn,
    border: 'none',
    background: on ? 'var(--surface)' : 'transparent',
    fontWeight: on ? TYPE_WEIGHT.bold : TYPE_WEIGHT.normal,
    boxShadow: on ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.lg }}>
      <div style={{ display: 'flex', gap: SPACE.sm }}>
        <button onClick={onBack} style={btn}>
          <ArrowLeft size={14} /> {L('Back to week', 'সপ্তাহে ফিরুন')}
        </button>
        <span style={{ flex: 1 }} />
        <button onClick={copy} style={btn}>
          {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? L('Copied', 'কপি হয়েছে') : L('Copy', 'কপি')}
        </button>
        <button onClick={print} style={btn}>
          <Printer size={12} /> {L('Print / PDF', 'প্রিন্ট / PDF')}
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.xs }}>
        <span style={{ ...label, color: 'var(--success)' }}>{L('HEALTH', 'স্বাস্থ্য')}</span>
        <span style={{ fontSize: TYPE_SIZE.lg, fontWeight: TYPE_WEIGHT.bold }}>{L('Shopping list', 'বাজারের তালিকা')}</span>
        <span style={{ fontSize: TYPE_SIZE.sm, color: 'var(--text-muted)' }}>
          {title} · {L('from the meals in your plan', 'আপনার প্ল্যানের খাবার থেকে')}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.md }}>
        <div style={{ display: 'inline-flex', gap: SPACE.hair, padding: SPACE.hair, borderRadius: RADIUS.control, background: 'var(--surface-2)' }}>
          <button onClick={() => run(healthApi.shopping(thisWeek))} style={tab(!onNext)}>
            {L('This week', 'এই সপ্তাহ')}
          </button>
          <button onClick={() => run(healthApi.shopping(nextWeek))} style={tab(onNext)}>
            {L('Next week', 'পরের সপ্তাহ')}
          </button>
        </div>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: TYPE_SIZE.xs, fontWeight: TYPE_WEIGHT.bold, color: s.bought === s.total && s.total ? 'var(--success)' : 'var(--text-muted)' }}>
          {L(`${s.bought} of ${s.total} bought`, `${s.total}টার ${s.bought}টা কেনা`)}
        </span>
      </div>
      {error && <span style={{ fontSize: TYPE_SIZE.xs, color: 'var(--danger)' }}>{error}</span>}

      <div style={{ ...card, gap: SPACE.lg }}>
        {s.groups.map((g) => (
          <div key={g.group} style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ ...label, color: 'var(--text-muted)', paddingBottom: SPACE.xs }}>{groupName[g.group] ?? g.group}</span>
            {g.items.map((it) => (
              <div key={it.name} style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm, borderBottom: '1px solid var(--border)', padding: `${SPACE.xs}px 0` }}>
                <button
                  onClick={() => run(healthApi.setBought(s.week, it.name, !it.bought))}
                  aria-label={it.bought ? L(`Unmark ${it.name}`, `${it.name} বাদ`) : L(`Mark ${it.name} bought`, `${it.name} কেনা হয়েছে`)}
                  style={{
                    width: 18,
                    height: 18,
                    padding: 0,
                    flexShrink: 0,
                    borderRadius: RADIUS.control,
                    border: `1.5px solid ${it.bought ? 'var(--success)' : 'var(--border)'}`,
                    background: it.bought ? 'var(--success)' : 'transparent',
                    color: 'var(--on-accent)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                >
                  {it.bought && <Check size={12} strokeWidth={3} />}
                </button>
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: TYPE_SIZE.sm,
                    textDecoration: it.bought ? 'line-through' : 'none',
                    color: it.bought ? 'var(--text-muted)' : 'var(--text)',
                  }}
                >
                  {it.name}
                </span>
                <span style={{ fontSize: TYPE_SIZE.sm, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{it.qty}</span>
                {it.custom && (
                  <button
                    onClick={() => run(healthApi.removeShopItem(s.week, it.name))}
                    aria-label={L(`Remove ${it.name}`, `${it.name} মুছুন`)}
                    style={{ ...btn, width: 24, height: 24, padding: 0, justifyContent: 'center', border: 'none', background: 'transparent' }}
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>
        ))}
        <div style={{ display: 'flex', gap: SPACE.sm }}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            placeholder={L('Add an item', 'কিছু যোগ করুন')}
            style={{ ...input, flex: 1 }}
          />
          <input
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            placeholder={L('Qty', 'পরিমাণ')}
            style={{ ...input, width: 88 }}
          />
          <button onClick={add} style={btn}>
            <Plus size={12} /> {L('Add', 'যোগ')}
          </button>
        </div>
      </div>
      <span style={muted}>
        {L(
          'Quantities are rough, rounded up from the week’s portions. Changing a meal updates this list.',
          'পরিমাণ আনুমানিক, সপ্তাহের পরিবেশন থেকে উপরে গোল করা। কোনো খাবার বদলালে তালিকাও বদলায়।'
        )}
      </span>
    </div>
  );
}
