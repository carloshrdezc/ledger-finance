import React from 'react';
import { A } from '../../theme';
import { ARule, ALabel, ADetailCell } from '../../components/Shared';
import { ACCOUNTS, TRANSACTIONS, NET_WORTH, fmtMoney, fmtSigned, dayLabel, catBreadcrumb } from '../../data';

export function Accounts({ t, onAcct }) {
  const groups = [
    ['CASH',        ACCOUNTS.filter(a => ['CHK','SAV','FX'].includes(a.type))],
    ['CREDIT',      ACCOUNTS.filter(a => a.type === 'CC')],
    ['INVESTMENTS', ACCOUNTS.filter(a => a.type === 'INV')],
    ['CRYPTO',      ACCOUNTS.filter(a => a.type === 'CRY')],
  ];

  return (
    <div style={{ padding: '0 18px 20px' }}>
      <div style={{ padding: '10px 0 6px', display: 'flex', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 12, letterSpacing: 2, fontWeight: 700 }}>ACCOUNTS</div>
        <div style={{ fontSize: 10, letterSpacing: 1.2, color: A.ink }}>+ LINK</div>
      </div>
      <ARule thick />
      <div style={{ padding: '14px 0' }}>
        <ALabel>TOTAL</ALabel>
        <div style={{ fontSize: 32, fontVariantNumeric: 'tabular-nums', letterSpacing: -1, marginTop: 4 }}>
          {fmtMoney(NET_WORTH, 'USD', t.decimals)}
        </div>
      </div>
      <ARule />
      {groups.map(([title, rows]) => (
        <div key={title}>
          <div style={{ padding: '12px 0 8px', display: 'flex', justifyContent: 'space-between' }}>
            <ALabel>{title}</ALabel>
            <ALabel>{fmtMoney(rows.reduce((s, a) => s + (a.ccy === 'USD' ? a.bal : a.bal * 1.08), 0), 'USD', t.decimals)}</ALabel>
          </div>
          {rows.map(a => (
            <button key={a.id} onClick={() => onAcct(a.id)} style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: t.density === 'compact' ? '8px 0' : '12px 0', borderBottom: '1px solid ' + A.rule2 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{a.name}</div>
                  <div style={{ fontSize: 10, color: A.muted, marginTop: 2 }}>{a.type} · {a.code}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 14, fontVariantNumeric: 'tabular-nums', color: a.bal < 0 ? A.neg : A.ink }}>
                    {fmtMoney(a.bal, a.ccy, t.decimals)}
                  </div>
                  <div style={{ fontSize: 10, color: a.delta < 0 ? A.neg : t.accent, marginTop: 2 }}>
                    {fmtSigned(a.delta, a.ccy, t.decimals)}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

export function AccountDetail({ t, accountId, onBack }) {
  const a = ACCOUNTS.find(x => x.id === accountId) || ACCOUNTS[0];
  const txns = TRANSACTIONS.filter(x => x.acct === a.id).slice(0, 10);

  return (
    <div style={{ padding: '0 18px 20px' }}>
      <div style={{ padding: '10px 0 6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={onBack} style={{ all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.2 }}>◂ BACK</button>
        <div style={{ fontSize: 10, letterSpacing: 1.2, color: A.muted }}>{a.type} · {a.code}</div>
      </div>
      <ARule thick />
      <div style={{ padding: '16px 0 8px' }}>
        <div style={{ fontSize: 11, letterSpacing: 1.4, color: A.muted, textTransform: 'uppercase' }}>{a.name}</div>
        <div style={{ fontSize: 34, fontVariantNumeric: 'tabular-nums', letterSpacing: -1, marginTop: 4, color: a.bal < 0 ? A.neg : A.ink }}>
          {fmtMoney(a.bal, a.ccy, t.decimals)}
        </div>
        <div style={{ fontSize: 11, color: a.delta < 0 ? A.neg : t.accent, marginTop: 2 }}>
          {fmtSigned(a.delta, a.ccy, t.decimals)} · 30D
        </div>
      </div>
      <div style={{ display: 'flex', gap: 1, background: A.rule2, border: '1px solid ' + A.rule2, marginTop: 6 }}>
        {a.type === 'CC' ? (
          <>
            <ADetailCell label="CREDIT LIMIT" val={fmtMoney(10000, 'USD', t.decimals)} />
            <ADetailCell label="AVAILABLE" val={fmtMoney(10000 + a.bal, 'USD', t.decimals)} />
            <ADetailCell label="APR" val="22.74%" />
          </>
        ) : a.type === 'INV' ? (
          <>
            <ADetailCell label="COST BASIS" val={fmtMoney(a.bal * 0.78, 'USD', t.decimals)} />
            <ADetailCell label="GAIN" val={fmtSigned(a.bal * 0.22, 'USD', t.decimals)} c={t.accent} />
            <ADetailCell label="YIELD" val="1.42%" />
          </>
        ) : (
          <>
            <ADetailCell label="AVAILABLE" val={fmtMoney(a.bal, a.ccy, t.decimals)} />
            <ADetailCell label="APY" val={a.type === 'SAV' ? '4.20%' : '0.00%'} />
            <ADetailCell label="STATEMENT" val="MAY 28" />
          </>
        )}
      </div>
      <ARule style={{ marginTop: 14 }} />
      <div style={{ padding: '14px 0 6px' }}><ALabel>RECENT · ACTIVITY</ALabel></div>
      {txns.map(tx => (
        <div key={tx.id} style={{ display: 'flex', justifyContent: 'space-between', padding: t.density === 'compact' ? '7px 0' : '10px 0', borderBottom: '1px solid ' + A.rule2 }}>
          <div style={{ minWidth: 0, flex: 1, paddingRight: 8 }}>
            <div style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.name}</div>
            <div style={{ fontSize: 10, color: A.muted, marginTop: 2, letterSpacing: 0.6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {dayLabel(tx.d)} · {catBreadcrumb(tx.path || [tx.cat])}
            </div>
          </div>
          <div style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', color: tx.amt < 0 ? A.ink : t.accent, flexShrink: 0 }}>
            {fmtSigned(tx.amt, tx.ccy, t.decimals)}
          </div>
        </div>
      ))}
    </div>
  );
}
