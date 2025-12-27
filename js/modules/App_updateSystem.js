
_updateSystem(system) {
    // 1. Update Grid System
    this.gridSystem.setSystem(system);

    // 2. Set Appropriate Default Symmetry
    if (system === 'icosahedral') {
        // Set default symmetry to 'icosahedral'?
        // Or just clear current settings?
        // Ideally, we might want a new default preset for Icosahedral.
        // For now, let's keep it manual but maybe trigger a preset if one exists.
        this.symmetry.settings.reflections = { xy: false, yz: false, zx: false, xy_diag: false, yz_diag: false, zx_diag: false };
        this.symmetry.settings.rotation.axis = 'none'; // Clear rotation
        // Ideally set to Icosahedral group if we had a preset selector.
        // But 'Symmetry Group' logic is separate in FormGenerator.
    } else {
        this.symmetry.settings.reflections = { xy: true, yz: true, zx: true }; // Cubic defaults
    }

    // 3. Rebuild
    this._generateGridPoints();
    this._rebuildVisuals();
    this._clearAll();

    // Notify user via Status? (LocalizationManager handles this via UI)
}
