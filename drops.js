/* Drops.bot manual checker — uses public wallet addresses only. */
(() => {
  const $d = (id) => document.getElementById(id);
  const stateKey = () => "walletscope:drops:checked:" + (window.walletScopeUserId || (typeof user !== "undefined" && user?.id) || "guest");
  const readChecked = () => {
    try { return new Set(JSON.parse(localStorage.getItem(stateKey()) || "[]")); }
    catch { return new Set(); }
  };
  const writeChecked = (set) => localStorage.setItem(stateKey(), JSON.stringify([...set]));
  const uniqueWallets = () => {
    if (!Array.isArray(wallets)) return [];
    const seen = new Set();
    return wallets.filter(w => {
      const address = String(w.address || "").trim().toLowerCase();
      const key = String(w.chain || "") + "|" + address;
      if (!address || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };
  const supported = new Set(["ethereum", "arbitrum", "base", "solana", "bitcoin"]);
  const addressKey = (w) => String(w.address || "").trim().toLowerCase();
  const uniqueAddresses = (rows) => [...new Map(rows.map(w => [addressKey(w), w])).values()];
  const copy = async (value, message) => {
    if (!value) { $d("drops-message").textContent = "Tidak ada alamat untuk disalin."; return; }
    try {
      await navigator.clipboard.writeText(value);
      $d("drops-message").textContent = message;
    } catch {
      $d("drops-addresses").value = value;
      $d("drops-addresses").focus();
      $d("drops-message").textContent = "Clipboard tidak tersedia. Daftar ditampilkan; salin secara manual.";
    }
  };
  const render = () => {
    const root = $d("drops-wallet-list");
    if (!root) return;
    const rows = uniqueWallets();
    const checked = readChecked();
    const addressRows = uniqueAddresses(rows);
    const done = addressRows.filter(w => checked.has(addressKey(w)) || checked.has(String(w.id))).length;
    const pending = addressRows.length - done;
    const uniqueAddressCount = addressRows.length;
    $d("drops-total").textContent = uniqueAddressCount.toLocaleString("id-ID");
    $d("drops-checked").textContent = done.toLocaleString("id-ID");
    $d("drops-pending").textContent = pending.toLocaleString("id-ID");
    const search = ($d("drops-search")?.value || "").trim().toLowerCase();
    const visible = rows.filter(w => {
      const chainName = CHAINS[w.chain]?.name || w.chain;
      return !search || String(w.address).toLowerCase().includes(search) || chainName.toLowerCase().includes(search);
    });
    $d("drops-addresses").value = rows.map(w => w.address).join("\n");
    if (!rows.length) {
      root.innerHTML = '<div class="empty">Masuk ke CekWallet dan tambahkan wallet terlebih dahulu.</div>';
      return;
    }
    if (!visible.length) {
      root.innerHTML = '<div class="empty">Tidak ada wallet yang cocok dengan pencarian.</div>';
      return;
    }
    const byChain = {};
    visible.forEach(w => (byChain[w.chain] ||= []).push(w));
    root.innerHTML = Object.entries(byChain).map(([chain, items]) => {
      const chainName = CHAINS[chain]?.name || chain;
      const isSupported = supported.has(chain);
      return '<section class="drops-chain"><div class="drops-chain-head"><div><strong>' + esc(chainName) + '</strong><small class="drops-support ' + (isSupported ? 'is-supported' : 'is-unlisted') + '">' + (isSupported ? 'Tercantum didukung Drops' : 'Belum tercantum di daftar dukungan Drops') + '</small></div><button type="button" class="mini" data-drops-copy-chain="' + esc(chain) + '">Salin (' + items.length + ')</button></div>' +
        items.map(w => {
          const id = String(w.id);
          const done = checked.has(addressKey(w)) || checked.has(id);
          return '<div class="drops-wallet-row"><code>' + esc(w.address) + '</code><label><input type="checkbox" data-drops-checked="' + esc(id) + '"' + (done ? ' checked' : '') + '> Sudah diperiksa</label></div>';
        }).join("") + '</section>';
    }).join("");
  };
  const openPage = () => {
    document.querySelector(".workspace")?.classList.add("drops-mode");
    document.querySelector(".workspace")?.classList.remove("add-mode");
    render();
  };
  document.addEventListener("DOMContentLoaded", () => {
    $d("network-menu")?.addEventListener("click", e => {
      if (e.target.closest("[data-drops-open]")) { openPage(); return; }
      if (e.target.closest("[data-chain]")) document.querySelector(".workspace")?.classList.remove("drops-mode");
    });
    $d("add-wallet-nav")?.addEventListener("click", () => document.querySelector(".workspace")?.classList.remove("drops-mode"));
    $d("drops-copy-all")?.addEventListener("click", () => {
      const rows = uniqueAddresses(uniqueWallets());
      copy(rows.map(w => w.address).join("\n"), rows.length + " alamat unik berhasil disalin.");
    });
    $d("drops-copy-pending")?.addEventListener("click", () => {
      const checked = readChecked();
      const rows = uniqueAddresses(uniqueWallets()).filter(w => !checked.has(addressKey(w)) && !checked.has(String(w.id)));
      copy(rows.map(w => w.address).join("\n"), rows.length + " alamat unik yang belum diperiksa berhasil disalin.");
    });
    $d("drops-search")?.addEventListener("input", render);
    $d("drops-open-site")?.addEventListener("click", () => window.open("https://www.drops.bot/", "_blank", "noopener,noreferrer"));
    $d("drops-wallet-list")?.addEventListener("click", e => {
      const btn = e.target.closest("[data-drops-copy-chain]");
      if (!btn) return;
      const chain = btn.dataset.dropsCopyChain;
      const rows = uniqueWallets().filter(w => w.chain === chain);
      copy(rows.map(w => w.address).join("\n"), rows.length + " alamat " + (CHAINS[chain]?.name || chain) + " disalin.");
    });
    $d("drops-wallet-list")?.addEventListener("change", e => {
      const input = e.target.closest("[data-drops-checked]");
      if (!input) return;
      const checked = readChecked();
      const wallet = uniqueWallets().find(w => String(w.id) === input.dataset.dropsChecked);
      const key = wallet ? addressKey(wallet) : input.dataset.dropsChecked;
      if (input.checked) checked.add(key);
      else checked.delete(key);
      writeChecked(checked);
      render();
    });
    window.addEventListener("walletscope:wallets-updated", render);
    window.addEventListener("walletscope:user-updated", () => render());
  });
  window.renderDropsWallets = render;
})();
