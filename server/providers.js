// Personal-preview provider adapters (plan §5–6). The browser never sees keys.
// Contract: submit({ jobId, personImage, garmentReference, settings, signal })
//   resolves { status: 'succeeded', image: Buffer, mime } or { status: 'failed', reason }.
// No paid provider is connected until provider, consent and trial budget are approved.

export const unconfiguredProvider = {
  name: 'none',
  configured: false,
  async submit() {
    return { status: 'failed', reason: 'provider_not_configured' };
  },
};

export function selectProvider(env = process.env) {
  // FASHN and Google Virtual Try-On adapters will be added here after the
  // milestone-2 go decision. Until then any value resolves to unconfigured.
  if (env.NYONI_TRYON_PROVIDER && env.NYONI_TRYON_PROVIDER !== 'none') {
    console.warn(`Provider "${env.NYONI_TRYON_PROVIDER}" is not implemented; personal previews are disabled.`);
  }
  return unconfiguredProvider;
}
