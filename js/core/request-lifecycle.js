export async function saveBeforeAcknowledge({ saved, apply, persist, acknowledge, onSaved }) {
  if (!saved) {
    const rollback = apply?.() || (() => {});
    try { persist(); }
    catch (error) { rollback(); throw error; }
    onSaved?.();
  }
  await acknowledge();
}
