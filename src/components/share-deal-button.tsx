"use client";

import { useRef, useState, useSyncExternalStore } from 'react';
import type { DealInputs } from '@/domain/models';
import type { calculateDeal } from '@/lib/calculations/deal';
import { formatDealShare, isMobileShareAvailable } from '@/lib/deals/share';

const subscribe = () => () => {};
const serverSnapshot = () => false;
const mobileShareSnapshot = () => isMobileShareAvailable(navigator, window.isSecureContext, typeof navigator.share === 'function');

export function ShareDealButton({ address, input, result, taxExplanation }: {
  address: string; input: DealInputs; result: ReturnType<typeof calculateDeal>; taxExplanation: string;
}) {
  const available = useSyncExternalStore(subscribe, mobileShareSnapshot, serverSnapshot);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  if (!available) return null;
  const share = async () => {
    if (pending.current) return;
    pending.current = true;
    setSharing(true); setError('');
    try {
      const data = { title: address.trim() ? `Deal estimate: ${address.trim()}` : 'Railhouse deal estimate', text: formatDealShare(address, input, result, taxExplanation) };
      if (navigator.canShare && !navigator.canShare(data)) throw new Error('Unsupported share');
      // Keep this in the tap handler: native sharing requires user activation.
      await navigator.share(data);
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === 'AbortError')) setError('Could not open the share sheet. Please try again.');
    } finally {
      pending.current = false;
      setSharing(false);
    }
  };
  return <div className="share-deal-controls">
    <button type="button" className="button secondary" onClick={share} disabled={sharing}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M12 16V3m-5 5 5-5 5 5M5 12v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8" /></svg>
      {sharing ? 'Opening share sheet…' : 'Share deal'}
    </button>
    {error && <p className="error" role="alert">{error}</p>}
  </div>;
}
