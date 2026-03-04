// src/tools/screenshot.ts
import { type DataStreamWriter } from "ai";
import { type Page } from "playwright";

export async function captureAndStream(
  dataStream: DataStreamWriter,
  page: Page,
  url: string,
  action: string
): Promise<string> {
  try {
    const buffer = await page.screenshot({ type: "jpeg", fullPage: true });
    const imageData = `data:image/jpeg;base64,${buffer.toString("base64")}`;
    dataStream.writeData({ type: "browser_frame", image: imageData, url, action });
    return imageData;
  } catch {
    return "";
  }
}
