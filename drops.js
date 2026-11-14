/* Drops.bot helper — uses public wallet addresses only. No Telegram session or keys. */
(() => {
  const $d = (id) => document.getElementById(id);
  const stateKey = () => "walletscope:drops:checked:" + (window.walletScopeUserId || "guest");
  const readChecked = () => {
    try { return new Set(JSON.parse(localStorage.getItem(stateKey()) || "[]")); }
    catch { return new Set(); }
  };
  const writeChecked = (set) => localStorage.setItem(stateKey(), JSON.stringify([...set]));
  const uniqueWallets = () => {
    if (!Array.isArray(wallets)) return [];
    const seen = new Set();
    return wallets.filter(w => {
      const key = String(w.address || "").trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };
  const copy = async (value, message) => {
    try {
      await navigator.clipboard.writeText(value);
      $d("drops-message").textContent = message;
    } catch {
      $d("drops-addresses").value = value;
      $d("drops-addresses").focus();
      $d("drops-message").textContent = "Clipboard tidak tersedia. Daftar sudah ditampilkan; salin secara manual.";
    }
  };
  const render = () => {
    const root = $d("drops-wallet-list");
    if (!root) return;
    const rows = uniqueWallets();
    const checked = readChecked();
    $d("drops-total").textContent = rows.length.toLocaleString("id-ID");
    $d("drops-checked").textContent = rows.filter(w => checked.has(String(w.id))).length.toLocaleString("id-ID");
    $d("drops-addresses").value = rows.map(w => w.address).join("\n");
    if (!rows.length) {
      root.innerHTML = '<div class="empty">Masuk ke CekWallet dan tambahkan wallet terlebih dahulu.</div>';
      return;
    }
    const byChain = {};
    rows.forEach(w => (byChain[w.chain] ||= []).push(w));
    root.innerHTML = Object.entries(byChain).map(([chain, items]) => {
      const chainName = CHAINS?.[chain]?.name || chain;
      return '<section class="drops-chain"><div class="drops-chain-head"><strong>' + esc(chainName) + '</strong><button type="button" class="mini" data-drops-copy-chain="' + window.walletScopeEscape(chain) + '">Salin jaringan (' + items.length + ')</button></div>' +
        items.map(w => {
          const id = String(w.id);
          const done = checked.has(id);
          return '<div class="drops-wallet-row"><code>' + window.walletScopeEscape(w.address) + '</code><label><input type="checkbox" data-drops-checked="' + window.walletScopeEscape(id) + '"' + (done ? ' checked' : '') + '> Sudah diperiksa</label></div>';
        }).join("") + '</section>';
    }).join("");
  };
  const openPage = () => {
    document.querySelector(".workspace")?.classList.add("drops-mode");
    document.querySelector(".workspace")?.classList.remove("add-mode");
    render();
  };
  document.addEventListener("DOMContentLoaded", () => {
    $d("drops-nav")?.addEventListener("click", openPage);
    $d("network-menu")?.addEventListener("click", () => document.querySelector(".workspace")?.classList.remove("drops-mode"));
    $d("add-wallet-nav")?.addEventListener("click", () => document.querySelector(".workspace")?.classList.remove("drops-mode"));
    $d("drops-copy-all")?.addEventListener("click", () => {
      const rows = uniqueWallets();
      copy(rows.map(w => w.address).join("\n"), rows.length + " alamat unik berhasil disalin.");
    });
    $d("drops-open-site")?.addEventListener("click", () => window.open("https://www.drops.bot/", "_blank", "noopener,noreferrer"));
    $d("drops-wallet-list")?.addEventListener("click", e => {
      const btn = e.target.closest("[data-drops-copy-chain]");
      if (!btn) return;
      const chain = btn.dataset.dropsCopyChain;
      const rows = uniqueWallets().filter(w => w.chain === chain);
      copy(rows.map(w => w.address).join("\n"), rows.length + " alamat " + (window.walletScopeChains?.[chain]?.name || chain) + " disalin.");
    });
    $d("drops-wallet-list")?.addEventListener("change", e => {
      const input = e.target.closest("[data-drops-checked]");
      if (!input) return;
      const checked = readChecked();
      if (input.checked) checked.add(input.dataset.dropsChecked);
      else checked.delete(input.dataset.dropsChecked);
      writeChecked(checked);
      render();
    });
    window.addEventListener("walletscope:wallets-updated", render);
    window.addEventListener("walletscope:user-updated", () => { render(); });
  });
  window.renderDropsWallets = render;
})();
