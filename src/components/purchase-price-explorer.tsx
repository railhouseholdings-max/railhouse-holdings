"use client";

import { useState, type CSSProperties } from 'react';
import { money } from '@/lib/format';

export function PurchasePriceExplorer({ price, arv, target, onChange }: {
  price: string; arv: number; target: number | null; onChange: (value: string) => void;
}) {
  const [initialPrice] = useState(Number(price));
  const maximum = Math.ceil(Math.max(initialPrice, arv, target ?? 0, 10000) * 1.25 / 1000) * 1000;
  const rangeMaximum = Math.max(maximum, Number(price) || 0);
  const progress = Math.max(0, Math.min(100, Number(price) / rangeMaximum * 100));
  return <div className="purchase-price-explorer" role="group" aria-labelledby="purchase-price-explorer-heading">
    <div className="price-explorer-heading"><div><p className="eyebrow">EXPLORE YOUR OFFER</p><h3 id="purchase-price-explorer-heading">Find your purchase price</h3></div><span className="price-live-label">Live results</span></div>
    <label className="field explorer-price-field" htmlFor="explorer-purchase-price"><span>Purchase price</span><div className="input-wrap"><input id="explorer-purchase-price" type="number" inputMode="decimal" min={0} max={1000000000} step="0.01" required value={price} onChange={event => onChange(event.target.value)} /><span>$</span></div></label>
    <div className="purchase-price-track" style={{ '--price-progress': `${progress}%` } as CSSProperties}>
      <input className="purchase-price-slider" type="range" aria-label="Adjust purchase price" aria-describedby="purchase-price-help" aria-valuetext={money(Number(price) || 0, true)} min={0} max={rangeMaximum} step={1} value={Number(price) || 0} onChange={event => onChange(event.target.value)} />
      {target !== null && <span className="purchase-price-target-mark" style={{ left: `${target / rangeMaximum * 100}%` }} aria-hidden="true" />}
    </div>
    <div className="price-range-labels" aria-hidden="true"><span>$0</span><span>{money(rangeMaximum)}</span></div>
    <div className="purchase-price-target"><div><span>Target purchase price</span><strong>{target === null ? 'No price-only solution' : money(target)}</strong><small>{target === null ? 'Changing price alone cannot reach Good. Review rent, costs, or financing.' : 'At or below this price meets the Good rating thresholds.'}</small></div>{target !== null && <button className="button secondary" type="button" onClick={() => onChange(String(target))}>Use target</button>}</div>
    <p className="note" id="purchase-price-help">Slide or type a price to update the dials and primary purchase-price field together. Price changes affect recovery and value created. Monthly cash flow stays the same because the refinance is based on ARV.</p>
  </div>;
}
