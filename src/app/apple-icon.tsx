import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #f43f5e 0%, #be123c 100%)",
          borderRadius: 36,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "white",
            fontSize: 84,
            fontWeight: 800,
            letterSpacing: "-0.06em",
            fontFamily: "system-ui, -apple-system, sans-serif",
          }}
        >
          LF
        </div>
      </div>
    ),
    { ...size },
  );
}
