// Module resolve hook used by factory-harness.mjs: production imports of js/bridge.js get fake-bridge.mjs.
export async function resolve(specifier, context, next) {
  const result = await next(specifier, context);
  if (result.url.endsWith('/js/bridge.js')) return { ...result, url: new URL('./fake-bridge.mjs', import.meta.url).href };
  return result;
}
