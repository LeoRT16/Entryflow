import { QRCodeSVG } from "qrcode.react";

type AccessQrCodeProps = {
  value: string;
  size?: number;
  className?: string;
};

export default function AccessQrCode({ value, size = 176, className = "" }: AccessQrCodeProps) {
  const padding = 12;
  const qrSize = Math.max(size - padding * 2, 64);

  return (
    <div
      role="img"
      aria-label="Código QR de acceso"
      className={[
        "inline-flex items-center justify-center rounded-[1.35rem] bg-white p-3",
        className,
      ].join(" ")}
      style={{ width: size, height: size }}
    >
      <QRCodeSVG
        value={value}
        size={qrSize}
        level="M"
        bgColor="#ffffff"
        fgColor="#020617"
        includeMargin
        marginSize={4}
        title="Código QR de acceso"
      />
    </div>
  );
}
