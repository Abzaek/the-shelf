/** Google's picker is loaded only after a user explicitly requests it, while online. */
interface PickerDocument {
  id: string;
}
interface PickerResult {
  action: string;
  docs?: PickerDocument[];
}
interface PickerBuilder {
  addView(view: unknown): PickerBuilder;
  setOAuthToken(value: string): PickerBuilder;
  setDeveloperKey(value: string): PickerBuilder;
  setAppId(value: string): PickerBuilder;
  setOrigin(value: string): PickerBuilder;
  setCallback(fn: (result: PickerResult) => void): PickerBuilder;
  build(): { setVisible(value: boolean): void };
}
interface GoogleWindow extends Window {
  gapi?: { load(name: string, options: { callback: () => void; onerror: () => void }): void };
  google?: {
    picker: {
      PickerBuilder: new () => PickerBuilder;
      DocsView: new () => { setMimeTypes(value: string): unknown };
    };
  };
}
let ready: Promise<void> | null = null;
function load(): Promise<void> {
  if (ready) return ready;
  ready = new Promise((resolve, reject) => {
    const start = () =>
      (window as GoogleWindow).gapi!.load("picker", {
        callback: resolve,
        onerror: () => reject(new Error("Google's file picker could not load.")),
      });
    if ((window as GoogleWindow).gapi) {
      start();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://apis.google.com/js/api.js";
    script.onload = start;
    script.onerror = () => reject(new Error("Connect to the internet to choose a Drive book."));
    document.head.appendChild(script);
  });
  ready.catch(() => {
    ready = null;
  });
  return ready;
}
export async function pickDriveBook(config: {
  accessToken: string;
  apiKey: string;
  appId: string;
}): Promise<string | null> {
  await load();
  const picker = (window as GoogleWindow).google!.picker;
  return new Promise((resolve) =>
    new picker.PickerBuilder()
      .addView(new picker.DocsView().setMimeTypes("application/pdf,application/epub+zip"))
      .setOAuthToken(config.accessToken)
      .setDeveloperKey(config.apiKey)
      .setAppId(config.appId)
      .setOrigin(location.origin)
      .setCallback((result) => {
        if (result.action === "picked") resolve(result.docs?.[0]?.id ?? null);
        else if (result.action === "cancel") resolve(null);
      })
      .build()
      .setVisible(true),
  );
}
