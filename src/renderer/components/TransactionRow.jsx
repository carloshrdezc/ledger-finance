import React from 'react';
import { A } from '../theme';
import { Checkbox } from './Shared';
import { fmtSigned, fmtMoney, dayLabel, catGlyph, catBreadcrumb } from '../data';

/**
 * Presentational row for the web transactions list. All click decisions
 * (open edit modal vs. toggle selection vs. extend range) live in the
 * parent — this component just calls back with the click events.
 *
 * Grid columns: 28px (checkbox) | 90px (date) | 24px (glyph) | 1fr (merchant)
 * | 280px (category) | 90px (account) | 120px (amount).
 */
export default function TransactionRow({
  tx,
  t,
  isFocused = false,
  isSelected = false,
  accountsWithBalance,
  onRowClick,
  onCheckboxToggle,
  innerRef,
}) {
  const accentColor = tx.cat === 'transfer' ? A.ink2 : (tx.amt >= 0 ? t.accent : A.ink);
  return (
    <div
      ref={innerRef}
      aria-selected={isFocused ? 'true' : 'false'}
      onClick={onRowClick}
      style={{
        display: 'grid',
        gridTemplateColumns: '28px 90px 24px 1fr 280px 90px 120px',
        padding: t.density === 'compact' ? '7px 0' : '10px 0',
        fontSize: 11,
        borderBottom: '1px solid ' + A.rule2,
        alignItems: 'center',
        cursor: 'pointer',
        borderLeft: isFocused ? '2px solid ' + A.ink : '2px solid transparent',
        background: isSelected ? A.bg2 : 'transparent',
      }}
      onMouseEnter={e => {
        if (!isSelected) e.currentTarget.style.background = A.bg2;
      }}
      onMouseLeave={e => {
        if (!isSelected) e.currentTarget.style.background = 'transparent';
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Checkbox
          checked={isSelected}
          ariaLabel={`Select transaction ${tx.name}`}
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => {
            e.stopPropagation();
            onCheckboxToggle?.(e);
          }}
        />
      </div>
      <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1 }}>{dayLabel(tx.date)}</div>
      <div>{tx.cat === 'transfer' ? '⇄' : catGlyph(tx.path || [tx.cat])}</div>
      <div style={{ fontSize: 12 }}>{tx.name}</div>
      <div style={{ color: A.ink2, fontSize: 10, letterSpacing: 0.6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {tx.cat === 'transfer' ? 'TRANSFER' : catBreadcrumb(tx.path || [tx.cat])}
      </div>
      <div style={{ color: A.muted, fontSize: 10 }}>
        {accountsWithBalance.find(a => a.id === tx.acct)?.code}
      </div>
      <div style={{
        textAlign: 'right',
        fontVariantNumeric: 'tabular-nums',
        color: accentColor,
      }}>
        {fmtSigned(tx.amt, tx.ccy, t.decimals)}
        {/* CAR-348: foreign-spend provenance — show the original amount the
            charge was incurred in (e.g. "€42.00 → $45.30"). Only rendered when
            the optional origAmt/origCcy fields are present and the original
            currency differs from the account currency. */}
        {tx.origCcy && tx.origAmt != null && tx.origCcy !== tx.ccy && (
          <div style={{ fontSize: 9, color: A.muted, letterSpacing: 0.4, marginTop: 2 }}>
            {fmtMoney(Math.abs(tx.origAmt), tx.origCcy, t.decimals)} → {fmtMoney(Math.abs(tx.amt), tx.ccy, t.decimals)}
          </div>
        )}
      </div>
    </div>
  );
}
