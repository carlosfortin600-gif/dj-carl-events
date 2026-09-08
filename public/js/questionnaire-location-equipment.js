(function () {
  function readRadioValue(form, fieldName) {
    const selected = form.querySelector(`input[name="${fieldName}"]:checked`);
    return selected ? selected.value : "";
  }

  function clearInputs(container, selector) {
    container.querySelectorAll(selector).forEach((input) => {
      input.value = "";
    });
  }

  function syncEquipmentGroup(group) {
    const form = group.closest("form") || document;
    const fieldName = group.dataset.locationField;
    if (!fieldName) return;

    const location = readRadioValue(form, fieldName);
    const isOther = location === "other_room" || location === "outside";
    const isSame = location === "same_room";

    group.querySelectorAll(".js-equipment-other-room").forEach((block) => {
      block.hidden = !isOther;
    });
    group.querySelectorAll(".js-equipment-same-room").forEach((block) => {
      block.hidden = !isSame;
    });
  }

  function syncCocktailLocationSuite(suite) {
    const form = suite.closest("form") || document;
    const locationField = suite.dataset.locationField;
    const equipmentField = suite.dataset.equipmentField;
    if (!locationField) return;

    const location = readRadioValue(form, locationField);
    const kitProvided = equipmentField ? readRadioValue(form, equipmentField) : "";
    const isOther = location === "other_room" || location === "outside";
    const isSame = location === "same_room";

    const placeRow = suite.querySelector(".js-cocktail-place-row");
    const distanceRow = suite.querySelector(".js-cocktail-distance-row");

    if (placeRow) {
      const showPlace = isOther;
      placeRow.hidden = !showPlace;
      if (!showPlace) clearInputs(suite, ".js-cocktail-place-input");
    }

    if (distanceRow) {
      const showDistance = isOther && kitProvided === "yes";
      distanceRow.hidden = !showDistance;
      if (!showDistance) clearInputs(suite, ".js-cocktail-distance-input");
    }

    const equipmentGroup = suite.querySelector(".js-location-equipment-group");
    if (equipmentGroup) syncEquipmentGroup(equipmentGroup);
  }

  function bindCocktailLocationSuite(suite) {
    const form = suite.closest("form") || document;
    syncCocktailLocationSuite(suite);

    const locationField = suite.dataset.locationField;
    const equipmentField = suite.dataset.equipmentField;

    form.querySelectorAll(`input[name="${locationField}"]`).forEach((input) => {
      input.addEventListener("change", () => syncCocktailLocationSuite(suite));
    });

    if (equipmentField) {
      form.querySelectorAll(`input[name="${equipmentField}"]`).forEach((input) => {
        input.addEventListener("change", () => syncCocktailLocationSuite(suite));
      });
    }
  }

  function initLocationEquipment() {
    document.querySelectorAll(".js-cocktail-location-suite").forEach((suite) => {
      bindCocktailLocationSuite(suite);
    });

    document.querySelectorAll(".js-location-equipment-group").forEach((group) => {
      if (group.closest(".js-cocktail-location-suite")) return;
      syncEquipmentGroup(group);
      const fieldName = group.dataset.locationField;
      const form = group.closest("form") || document;
      form.querySelectorAll(`input[name="${fieldName}"]`).forEach((input) => {
        input.addEventListener("change", () => syncEquipmentGroup(group));
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initLocationEquipment);
  } else {
    initLocationEquipment();
  }
})();
