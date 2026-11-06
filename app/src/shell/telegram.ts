// The Telegram shell (owner 05.11.2026: shell only). The node never learns a Telegram identity: initData is never read here.
type WebApp = { platform: string; ready(): void; expand(): void; BackButton: { show(): void; hide(): void; onClick(f: () => void): void } };
const webApp = (): WebApp | null => {
  const app = (window as unknown as { Telegram?: { WebApp?: WebApp } }).Telegram?.WebApp;
  return app && app.platform !== "unknown" ? app : null;
};

// Owner 05.11.2026: in Telegram only 18+. The node keeps its own lower limit for the other faces; it is not told why.
export const TELEGRAM_AGE_MIN = 18;
export const youngInTelegram = (age: string | number): boolean => age !== "" && !!webApp() && Number(age) < TELEGRAM_AGE_MIN;

export function startTelegram(): void {
  const app = webApp();
  if (!app) return;
  app.ready();
  app.expand();
  app.BackButton.onClick(() => history.back());
}

export function telegramBack(canGoBack: boolean): void {
  const back = webApp()?.BackButton;
  if (canGoBack) back?.show(); else back?.hide();
}
