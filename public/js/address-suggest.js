(function initAddressSuggest() {
  const MIN_CHARS = 3;
  const DEBOUNCE_MS = 350;

  document.querySelectorAll(".address-suggest").forEach((input) => {
    if (input.dataset.suggestReady) return;
    input.dataset.suggestReady = "1";

    const wrap = input.closest(".address-suggest-wrap") || input.parentElement;
    let list = wrap.querySelector(".address-suggest-list");
    if (!list) {
      list = document.createElement("ul");
      list.className = "address-suggest-list list-group";
      list.hidden = true;
      wrap.appendChild(list);
    }

    let timer = null;
    let requestId = 0;

    const hideList = () => {
      list.hidden = true;
      list.replaceChildren();
    };

    const showSuggestions = (items) => {
      list.replaceChildren();
      if (!items.length) {
        hideList();
        return;
      }

      items.forEach((item) => {
        const li = document.createElement("li");
        li.className = "list-group-item list-group-item-action";
        li.textContent = item.label;
        li.tabIndex = 0;
        li.addEventListener("mousedown", (event) => {
          event.preventDefault();
          input.value = item.address;
          if (item.lat != null && item.lon != null) {
            input.dataset.geoLat = String(item.lat);
            input.dataset.geoLon = String(item.lon);
          } else {
            delete input.dataset.geoLat;
            delete input.dataset.geoLon;
          }
          hideList();
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
        });
        list.appendChild(li);
      });
      list.hidden = false;
    };

    const fetchSuggestions = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const query = input.value.trim();
        if (query.length < MIN_CHARS) {
          hideList();
          return;
        }

        const currentRequest = ++requestId;
        try {
          const params = new URLSearchParams({ q: query });
          const response = await fetch(`/api/address-suggest?${params.toString()}`);
          const data = await response.json();
          if (currentRequest !== requestId) return;
          if (!response.ok) {
            hideList();
            return;
          }
          showSuggestions(Array.isArray(data.suggestions) ? data.suggestions : []);
        } catch {
          if (currentRequest !== requestId) return;
          hideList();
        }
      }, DEBOUNCE_MS);
    };

    input.addEventListener("input", (event) => {
      if (event.isTrusted) {
        delete input.dataset.geoLat;
        delete input.dataset.geoLon;
      }
      fetchSuggestions();
    });
    input.addEventListener("focus", fetchSuggestions);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") hideList();
    });
    document.addEventListener("click", (event) => {
      if (!wrap.contains(event.target)) hideList();
    });
  });
})();
