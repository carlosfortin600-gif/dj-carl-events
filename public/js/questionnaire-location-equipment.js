(function () {
  function readLocationValue(form, fieldName) {
    const selected = form.querySelector(`input[name="${fieldName}"]:checked`);
    return selected ? selected.value : "";
  }

  function syncEquipmentGroup(group) {
    const form = group.closest("form") || document;
    const fieldName = group.dataset.locationField;
    if (!fieldName) return;

    const location = readLocationValue(form, fieldName);
    const isOther = location === "other_room" || location === "outside";
    const isSame = location === "same_room";

    group.querySelectorAll(".js-equipment-other-room").forEach((block) => {
      block.hidden = !isOther;
    });
    group.querySelectorAll(".js-equipment-same-room").forEach((block) => {
      block.hidden = !isSame;
    });
  }

  function initLocationEquipment() {
    document.querySelectorAll(".js-location-equipment-group").forEach((group) => {
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
