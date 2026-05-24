import React from 'react';
import { A } from '../../theme';
import { ARule } from '../../components/Shared';
import { useUndoableStore } from '../../useUndoableStore';

export default function CategoriesEditor({ t, onBack }) {
  const { categoryTree, addCategory, renameCategory, removeCategory } = useUndoableStore();
  const [expanded, setExpanded] = React.useState({ edu: true, 'edu.school': true, 'edu.school.supplies': true });
  const [adding, setAdding] = React.useState(null);
  const [renaming, setRenaming] = React.useState(null); // path id "a.b.c"
  const [renameVal, setRenameVal] = React.useState('');
  const [confirmDelete, setConfirmDelete] = React.useState(null); // path id
  const [newName, setNewName] = React.useState('');

  const toggle = k => setExpanded(e => ({ ...e, [k]: !e[k] }));

  const startRename = (id, currentLabel) => {
    setRenaming(id);
    setRenameVal(currentLabel || '');
  };

  const commitRename = (path) => {
    const id = path.join('.');
    if (renaming !== id) return;
    renameCategory(path, renameVal.trim().toUpperCase());
    setRenaming(null);
    setRenameVal('');
  };

  const renderNode = (key, node, path, depth) => {
    const id = path.join('.');
    const children = node.children || {};
    const hasKids = Object.keys(children).length > 0;
    const isOpen = expanded[id];
    const isRenaming = renaming === id;
    const isConfirming = confirmDelete === id;
    return (
      <div key={id}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '9px 0', paddingLeft: depth * 16, borderBottom: '1px solid ' + A.rule2 }}>
          <button onClick={() => hasKids ? toggle(id) : null}
            style={{ all: 'unset', cursor: hasKids ? 'pointer' : 'default', width: 18, color: A.ink2, fontSize: 12 }}>
            {hasKids ? (isOpen ? '−' : '+') : '·'}
          </button>
          {isRenaming ? (
            <input autoFocus value={renameVal} onChange={e => setRenameVal(e.target.value)}
              onBlur={() => commitRename(path)}
              onKeyDown={e => {
                if (e.key === 'Enter') commitRename(path);
                if (e.key === 'Escape') { setRenaming(null); setRenameVal(''); }
              }}
              style={{ flex: 1, fontFamily: A.font, fontSize: 12, background: 'transparent', border: 'none', borderBottom: '1px solid ' + A.ink, outline: 'none', padding: '2px 0', color: A.ink, letterSpacing: 0.6 }}
            />
          ) : (
            <span onClick={() => startRename(id, node.label || key)}
              style={{ fontSize: 12, letterSpacing: depth === 0 ? 1.2 : 0.4, fontWeight: depth === 0 ? 600 : 400, color: A.ink, flex: 1, cursor: 'text' }}>
              {node.glyph ? node.glyph + ' ' : ''}{node.label || key}
            </span>
          )}
          <button onClick={() => setAdding(id)}
            title="Add sub-category"
            style={{ all: 'unset', cursor: 'pointer', width: 24, height: 20, textAlign: 'center', fontSize: 14, color: A.muted, marginLeft: 6 }}>+</button>
          {isConfirming ? (
            <>
              <button onClick={() => { removeCategory(path); setConfirmDelete(null); }}
                title="Confirm delete"
                style={{ all: 'unset', cursor: 'pointer', fontSize: 9, color: A.neg, letterSpacing: 1, marginLeft: 6 }}>SURE?</button>
              <button onClick={() => setConfirmDelete(null)}
                title="Cancel"
                style={{ all: 'unset', cursor: 'pointer', fontSize: 10, color: A.muted, marginLeft: 4 }}>×</button>
            </>
          ) : (
            <button onClick={() => setConfirmDelete(id)}
              title="Delete category"
              style={{ all: 'unset', cursor: 'pointer', width: 20, height: 20, textAlign: 'center', fontSize: 11, color: A.muted, marginLeft: 4 }}>✕</button>
          )}
        </div>
        {adding === id && (
          <div style={{ display: 'flex', gap: 8, padding: '8px 0', paddingLeft: (depth + 1) * 16, borderBottom: '1px solid ' + A.rule2, background: A.bg }}>
            <span style={{ fontSize: 11, color: A.muted, alignSelf: 'center', letterSpacing: 1 }}>›</span>
            <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
              placeholder="NEW · CATEGORY"
              onKeyDown={e => {
                if (e.key === 'Enter' && newName.trim()) {
                  addCategory(path, newName.trim().toUpperCase());
                  setExpanded(e => ({ ...e, [id]: true }));
                  setNewName(''); setAdding(null);
                }
                if (e.key === 'Escape') { setNewName(''); setAdding(null); }
              }}
              style={{ flex: 1, fontFamily: A.font, fontSize: 11, background: 'transparent', border: 'none', borderBottom: '1px solid ' + A.ink, outline: 'none', padding: '2px 0', color: A.ink, letterSpacing: 0.8 }}
            />
            <button onClick={() => { setNewName(''); setAdding(null); }}
              style={{ all: 'unset', cursor: 'pointer', fontSize: 10, color: A.muted }}>×</button>
          </div>
        )}
        {isOpen && Object.entries(children).map(([k, n]) => renderNode(k, n, [...path, k], depth + 1))}
      </div>
    );
  };

  return (
    <div style={{ padding: '0 18px 20px' }}>
      <div style={{ padding: '10px 0 6px', display: 'flex', justifyContent: 'space-between' }}>
        <button onClick={onBack} style={{ all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.2 }}>◂ BACK</button>
        <div style={{ fontSize: 10, letterSpacing: 1.2, color: A.muted }}>SETTINGS</div>
      </div>
      <ARule thick />
      <div style={{ padding: '14px 0 8px' }}>
        <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.2 }}>CATEGORIES</div>
        <div style={{ fontSize: 11, color: A.muted, marginTop: 4, lineHeight: 1.6 }}>
          NEST AS DEEP AS YOU NEED. TAP <span style={{ color: A.ink }}>+</span> TO ADD · TAP NAME TO RENAME · TAP <span style={{ color: A.ink }}>✕</span> TO DELETE.
        </div>
      </div>
      <ARule />
      <div style={{ marginTop: 4 }}>
        {Object.entries(categoryTree).map(([k, n]) => renderNode(k, n, [k], 0))}
      </div>
      {adding === '__root__' ? (
        <div style={{ display: 'flex', gap: 8, padding: '12px', marginTop: 16, border: '1.5px dashed ' + A.ink, background: A.bg }}>
          <span style={{ fontSize: 11, color: A.muted, alignSelf: 'center', letterSpacing: 1 }}>›</span>
          <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
            placeholder="NEW · TOP · LEVEL · CATEGORY"
            onKeyDown={e => {
              if (e.key === 'Enter' && newName.trim()) {
                addCategory([], newName.trim().toUpperCase());
                setNewName(''); setAdding(null);
              }
              if (e.key === 'Escape') { setNewName(''); setAdding(null); }
            }}
            style={{ flex: 1, fontFamily: A.font, fontSize: 11, background: 'transparent', border: 'none', borderBottom: '1px solid ' + A.ink, outline: 'none', padding: '2px 0', color: A.ink, letterSpacing: 0.8 }}
          />
          <button onClick={() => { setNewName(''); setAdding(null); }}
            style={{ all: 'unset', cursor: 'pointer', fontSize: 10, color: A.muted }}>×</button>
        </div>
      ) : (
        <button onClick={() => setAdding('__root__')}
          style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 16, padding: '12px', border: '1.5px dashed ' + A.ink, fontSize: 10, color: A.muted, letterSpacing: 1, textAlign: 'center' }}>
          + ADD · TOP · LEVEL · CATEGORY
        </button>
      )}
    </div>
  );
}
