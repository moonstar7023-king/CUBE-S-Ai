/**
 * CUBE-S-AI | ai/vault.js
 * Encrypted local storage for the user's own API keys (BYOK).
 *
 * - Keys are encrypted with AES-GCM (WebCrypto) before they touch storage.
 * - Mode "device": a NON-extractable AES key lives in IndexedDB (no passphrase to type).
 * - Mode "pass":   the AES key is derived from a passphrase with PBKDF2-SHA256 and is never stored.
 * - Decrypted keys exist only in memory while the vault is unlocked. lock() clears them.
 * - Nothing here ever sends a key anywhere. Keys are never written to Firebase.
 */
(function (g) {
  'use strict';
  const enc = new TextEncoder(), dec = new TextDecoder();
  const ITER = 310000; // stored in the record, so it can be raised later
  const b64 = u8 => { u8 = new Uint8Array(u8); let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const cr = () => (g.crypto && g.crypto.subtle) ? g.crypto : null;

  /* ----- default storage adapters (browser). Tests inject their own. ----- */
  function lsBlobStore() {
    return {
      get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } },
      set: (k, v) => localStorage.setItem(k, v),
      del: k => { try { localStorage.removeItem(k); } catch (e) {} }
    };
  }
  function idbKeyStore() {
    const open = () => new Promise((ok, no) => {
      const r = indexedDB.open('cubes-vault', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('k');
      r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error);
    });
    const tx = async (mode, fn) => { const db = await open(); try { return await new Promise((ok, no) => { const t = db.transaction('k', mode), q = fn(t.objectStore('k')); t.oncomplete = () => ok(q && q.result); t.onerror = () => no(t.error); }); } finally { db.close(); } };
    return { get: k => tx('readonly', s => s.get(k)), set: (k, v) => tx('readwrite', s => s.put(v, k)), del: k => tx('readwrite', s => s.delete(k)) };
  }

  function VaultError(code, msg) { const e = new Error(msg || code); e.code = code; return e; }

  function create(opts) {
    opts = opts || {};
    const uid = String(opts.uid || ''); if (!uid) throw VaultError('NO_USER', 'Vault needs a signed-in user');
    const blobs = opts.blobStore || lsBlobStore(), keys = opts.keyStore || idbKeyStore();
    const BK = 'cs_vault_v1_' + uid, DK = 'dev_' + uid, aad = enc.encode('cubes-vault:' + uid);
    let cryptoKey = null, data = null; // data = {providerId: 'key'} while unlocked

    const rec = () => { try { return JSON.parse(blobs.get(BK) || 'null'); } catch (e) { return null; } };
    async function seal() {
      const r = rec(); const iv = g.crypto.getRandomValues(new Uint8Array(12));
      const ct = await g.crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad }, cryptoKey, enc.encode(JSON.stringify(data)));
      const next = Object.assign({}, r, { iv: b64(iv), ct: b64(ct), providers: Object.keys(data).filter(k => data[k]) });
      blobs.set(BK, JSON.stringify(next));
    }
    async function open(key, r) {
      try {
        const pt = await g.crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(r.iv), additionalData: aad }, key, unb64(r.ct));
        return JSON.parse(dec.decode(pt));
      } catch (e) { throw VaultError(r.mode === 'pass' ? 'WRONG_PASSPHRASE' : 'DECRYPT_FAILED', 'Could not decrypt the key vault'); }
    }
    async function derive(pass, salt, iter) {
      const base = await g.crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
      return g.crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    }

    const v = {
      supported: () => !!cr(),
      status() { const r = rec(); return { exists: !!r, mode: r ? r.mode : null, unlocked: !!data, providers: r ? (r.providers || []) : [] }; },
      isUnlocked: () => !!data,

      /** Create a new empty vault. mode: 'device' | 'pass'. Refuses to overwrite an existing vault. */
      async init(mode, passphrase) {
        if (!cr()) throw VaultError('UNSUPPORTED', 'This browser cannot encrypt keys safely (WebCrypto missing).');
        if (rec()) throw VaultError('EXISTS', 'A vault already exists');
        const r = { v: 1, mode };
        if (mode === 'pass') {
          if (!passphrase || passphrase.length < 8) throw VaultError('WEAK_PASSPHRASE', 'Passphrase must be at least 8 characters');
          const salt = g.crypto.getRandomValues(new Uint8Array(16)); r.salt = b64(salt); r.iter = ITER;
          cryptoKey = await derive(passphrase, salt, ITER);
        } else if (mode === 'device') {
          cryptoKey = await g.crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
          await keys.set(DK, cryptoKey);
        } else throw VaultError('BAD_MODE');
        data = {}; blobs.set(BK, JSON.stringify(r)); await seal();
      },

      /** Unlock. Device mode needs no argument; pass mode needs the passphrase. */
      async unlock(passphrase) {
        if (data) return true;
        const r = rec(); if (!r) throw VaultError('NO_VAULT', 'No key vault yet');
        let key;
        if (r.mode === 'pass') {
          if (!passphrase) throw VaultError('NEED_PASSPHRASE', 'Passphrase needed');
          key = await derive(passphrase, unb64(r.salt), r.iter || ITER);
        } else {
          key = await keys.get(DK);
          if (!key) throw VaultError('DEVICE_KEY_MISSING', 'The device key is gone (browser data was cleared). Remove the vault and add your keys again.');
        }
        data = await open(key, r); cryptoKey = key; return true;
      },

      lock() { data = null; cryptoKey = null; },
      get(provider) { return data && data[provider] ? data[provider] : null; },
      has(provider) { const r = rec(); return !!(r && (r.providers || []).includes(provider)); },
      async set(provider, key) { if (!data) throw VaultError('LOCKED', 'Vault is locked'); data[provider] = String(key); await seal(); },
      async remove(provider) { if (!data) throw VaultError('LOCKED', 'Vault is locked'); delete data[provider]; await seal(); },
      /** Delete everything: encrypted blob and device key. Cannot be undone. */
      async wipe() { data = null; cryptoKey = null; blobs.del(BK); try { await keys.del(DK); } catch (e) {} }
    };
    return v;
  }

  g.CSVault = { create, ITER };
})(typeof window !== 'undefined' ? window : globalThis);
