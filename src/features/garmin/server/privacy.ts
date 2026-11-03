import "server-only";

export function hostingProvider(): string | null {
  return process.env.PRIVACY_HOSTING_PROVIDER?.trim() || null;
}
