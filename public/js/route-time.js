(function initRouteTime() {
  const block = document.getElementById("route-time-block");
  if (!block) return;

  const originInput = document.getElementById("route_origin_custom");
  const addressInput = document.getElementById("address");
  const resultEl = document.getElementById("route-time-result");
  const directionsLink = document.getElementById("route-directions-link");
  if (!originInput || !addressInput || !resultEl || !directionsLink) return;

  let timer = null;
  let requestId = 0;

  const setDirectionsLink = (origin, destination, url) => {
    if (!origin || !destination || !url) {
      directionsLink.classList.add("d-none");
      directionsLink.href = "#";
      return;
    }
    directionsLink.href = url;
    directionsLink.classList.remove("d-none");
  };

  const appendCoords = (params, prefix, inputEl) => {
    if (!inputEl) return;
    const lat = inputEl.dataset.geoLat;
    const lon = inputEl.dataset.geoLon;
    if (lat && lon) {
      params.set(`${prefix}Lat`, lat);
      params.set(`${prefix}Lon`, lon);
    }
  };

  const updateRouteTime = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const origin = originInput.value.trim();
      const destination = addressInput.value.trim();

      if (!origin || !destination) {
        resultEl.textContent = origin && !destination
          ? "Entrez l'adresse de l'événement pour calculer le temps de route."
          : "—";
        setDirectionsLink("", "", "");
        return;
      }

      const currentRequest = ++requestId;
      resultEl.textContent = "Calcul du temps de route…";

      try {
        const params = new URLSearchParams({ origin, destination });
        appendCoords(params, "origin", originInput);
        appendCoords(params, "dest", addressInput);
        const response = await fetch(`/api/route-time?${params.toString()}`);
        const data = await response.json();
        if (currentRequest !== requestId) return;

        if (!response.ok) {
          resultEl.textContent = data.error || "Impossible de calculer le temps de route.";
          setDirectionsLink(origin, destination, "");
          return;
        }

        const parts = [`Temps de route : ${data.durationLabel}`];
        if (data.distanceLabel) parts.push(data.distanceLabel);
        resultEl.textContent = parts.join(" · ");
        if (data.sourceNote) {
          resultEl.textContent += ` — ${data.sourceNote}`;
        }
        setDirectionsLink(origin, destination, data.directionsUrl);
      } catch {
        if (currentRequest !== requestId) return;
        resultEl.textContent = "Impossible de calculer le temps de route.";
        setDirectionsLink(origin, destination, "");
      }
    }, 500);
  };

  originInput.addEventListener("input", updateRouteTime);
  addressInput.addEventListener("input", updateRouteTime);
  updateRouteTime();
})();
