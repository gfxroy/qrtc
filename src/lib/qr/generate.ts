import QRCode from "qrcode";

export interface QrOptions {
  margin?: number;
  width?: number;
  darkColor?: string;
  lightColor?: string;
}

export async function generateQrSvg(
  text: string,
  options: QrOptions = {}
): Promise<string> {
  const {
    margin = 2,
    darkColor = "#000000",
    lightColor = "#ffffff",
  } = options;

  return QRCode.toString(text, {
    type: "svg",
    margin,
    errorCorrectionLevel: "M",
    color: {
      dark: darkColor,
      light: lightColor,
    },
  });
}

export async function generateQrDataUrl(
  text: string,
  options: QrOptions = {}
): Promise<string> {
  const {
    margin = 2,
    width = 300,
    darkColor = "#000000",
    lightColor = "#ffffff",
  } = options;

  return QRCode.toDataURL(text, {
    margin,
    width,
    errorCorrectionLevel: "M",
    color: {
      dark: darkColor,
      light: lightColor,
    },
  });
}
